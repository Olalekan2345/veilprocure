"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORIES } from "@veilprocure/shared";
import { audit } from "../audit";
import { requireActiveOrg, requireActor, requireMembership } from "../authz";
import { db, tables, withActor } from "../db";
import { AppError, toResult, type ActionResult } from "../errors";
import { rateLimit } from "../ratelimit";
import { INTENT_SPEC, type IntentKind, type IntentView } from "../chain/intents";
import { syncRfqFromChain } from "../chain/sync";
import { prepareAward, prepareAwardAction, prepareDelivery } from "../services/award";
import { recordDeterministicEvaluation, requestAiEvaluation } from "../services/evaluation";
import {
  applyPublished,
  createDraft,
  loadBuyerRfq,
  prepareSimpleRfqIntent,
  preparePublish,
  returnToDraft,
  saveDraft,
  sendSupplierInvites,
} from "../services/rfq";
import { acceptInvite, declineInvite, loadSupplierContext, prepareCommit, prepareWithdraw, saveQuoteDraft } from "../services/supplier";
import { viewFunction } from "../near";
import { env } from "../env";
import type { ChainRfq } from "../chain/sync";

const t = tables;

async function guarded<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return toResult(err);
  }
}

// ------------------------------------------------------------------ buyer: drafts

export async function createRfqAction(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await guarded(async () => {
    const actor = await requireActor();
    const m = requireActiveOrg(actor, "rfq:edit", "buyer");
    const title = z.string().trim().min(5, "Use at least 5 characters").max(140).safeParse(form.get("title"));
    if (!title.success) throw new AppError("INVALID_INPUT", "Give the request a title of at least 5 characters.", { title: "At least 5 characters" });
    const category = z.enum(Object.keys(CATEGORIES) as [keyof typeof CATEGORIES]).parse(form.get("category"));
    await rateLimit(`rfq-create:${actor.id}`, 30, 3600);
    return { id: await createDraft(actor, m.orgId, title.data, category) };
  });
  if (res.ok) redirect(`/app/rfqs/${res.data.id}/edit`);
  return res;
}

export async function saveRfqDraftAction(rfqId: string, payload: { draft: unknown; deadline: string | null; invitees: string[] }) {
  return guarded(async () => {
    const actor = await requireActor();
    await saveDraft(actor, rfqId, payload.draft, payload.deadline, Array.isArray(payload.invitees) ? payload.invitees.map(String) : []);
  });
}

export async function preparePublishAction(rfqId: string): Promise<ActionResult<IntentView>> {
  return guarded(async () => preparePublish(await requireActor(), rfqId));
}

export async function returnToDraftAction(rfqId: string) {
  return guarded(async () => returnToDraft(await requireActor(), rfqId));
}

/** Recovery when a publication signature was sent but never reported back (closed tab etc.). */
export async function recoverPublicationAction(rfqId: string): Promise<ActionResult<{ found: boolean }>> {
  return guarded(async () => {
    const actor = await requireActor();
    const rfq = await loadBuyerRfq(actor, rfqId, "rfq:publish");
    if (rfq.status !== "publishing") return { found: rfq.status === "open" };
    const [intent] = await db()
      .select()
      .from(t.txIntents)
      .where(and(eq(t.txIntents.rfqId, rfqId), eq(t.txIntents.kind, "publish_rfq"), inArray(t.txIntents.status, ["prepared", "submitted"])))
      .limit(1);
    if (!intent) return { found: false };
    const args = intent.args as { policy_hash: string };
    const summary = await viewFunction<{ rfq_count: string }>(env().NEAR_CONTRACT_ID, "get_escrow_summary");
    const count = BigInt(summary.rfq_count);
    for (let from = count > 60n ? count - 59n : 1n; from <= count; from += 20n) {
      const page = await viewFunction<ChainRfq[]>(env().NEAR_CONTRACT_ID, "list_rfqs", { from_id: from.toString(), limit: 20 });
      const hit = page.find((r) => r.policy_hash === args.policy_hash && r.buyer === intent.signerId);
      if (hit) {
        await applyPublished(rfqId, BigInt(hit.id), intent.txHash ?? "recovered-without-hash", intent.signerId, hit.created_at_ns, actor.id);
        await db().update(t.txIntents).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(t.txIntents.id, intent.id));
        return { found: true };
      }
    }
    return { found: false };
  });
}

export async function prepareRfqChainAction(rfqId: string, kind: "close_rfq" | "cancel_rfq"): Promise<ActionResult<IntentView>> {
  return guarded(async () => prepareSimpleRfqIntent(await requireActor(), rfqId, kind));
}

export async function resendInviteAction(rfqId: string, slotId: string): Promise<ActionResult<{ delivery: string; link: string | null }>> {
  return guarded(async () => {
    const actor = await requireActor();
    const rfq = await loadBuyerRfq(actor, rfqId, "rfq:invite");
    if (rfq.status !== "open") throw new AppError("PRECONDITION_FAILED", "Invitations can be re-sent while bidding is open.");
    await rateLimit(`invite-resend:${actor.id}`, 30, 3600);
    const [res] = await sendSupplierInvites(rfqId, actor.id, z.uuid().parse(slotId));
    if (!res) throw new AppError("PRECONDITION_FAILED", "This invitation was already accepted or declined.");
    // The link is returned to an authenticated buyer only when e-mail was not delivered.
    return { delivery: res.delivery, link: res.delivery === "sent" ? null : res.link };
  });
}

export async function syncRfqAction(rfqId: string) {
  return guarded(async () => {
    const actor = await requireActor();
    const isBuyer = await loadBuyerRfq(actor, rfqId, "rfq:view").then(() => true).catch(() => false);
    if (!isBuyer) await loadSupplierContext(actor, rfqId);
    await rateLimit(`sync:${actor.id}`, 60, 600);
    await syncRfqFromChain(rfqId);
  });
}

// ------------------------------------------------------------------ supplier

export async function acceptInviteAction(_prev: unknown, form: FormData): Promise<ActionResult<{ rfqId: string }>> {
  const res = await guarded(async () => {
    const actor = await requireActor();
    const token = String(form.get("token") ?? "");
    const orgId = String(form.get("orgId") ?? "");
    const rfqId = await acceptInvite(actor, token, orgId && orgId !== "new" ? { orgId } : { newOrgName: String(form.get("newOrgName") ?? "") });
    return { rfqId };
  });
  if (res.ok) {
    revalidatePath("/app", "layout");
    redirect(`/app/bids/${res.data.rfqId}`);
  }
  return res;
}

export async function declineInviteAction(form: FormData): Promise<void> {
  const actor = await requireActor();
  await declineInvite(actor, String(form.get("token") ?? ""));
  redirect("/app?notice=invite-declined");
}

export async function saveQuoteDraftAction(rfqId: string, input: unknown) {
  return guarded(async () => saveQuoteDraft(await requireActor(), rfqId, input));
}

export async function prepareCommitAction(rfqId: string): Promise<ActionResult<IntentView>> {
  return guarded(async () => {
    const actor = await requireActor();
    await rateLimit(`commit:${actor.id}`, 30, 3600);
    return prepareCommit(actor, rfqId);
  });
}

export async function prepareWithdrawAction(rfqId: string): Promise<ActionResult<IntentView>> {
  return guarded(async () => prepareWithdraw(await requireActor(), rfqId));
}

export async function removeAttachmentAction(rfqId: string, attachmentId: string) {
  return guarded(async () => {
    const actor = await requireActor();
    const ctx = await loadSupplierContext(actor, rfqId);
    requireMembership(actor, ctx.supplierOrgId, "quote:edit");
    const att = ctx.attachments.find((a) => a.id === attachmentId);
    if (!att) throw new AppError("NOT_FOUND", "Attachment not found.");
    if (ctx.revisions.some((r) => r.status === "committed" && r.attachmentDigests.includes(att.sha256))) {
      throw new AppError("PRECONDITION_FAILED", "This file is part of a committed bid. Commit a new revision without it instead; the old commitment stays on record.");
    }
    await withActor(db(), [ctx.supplierOrgId], async (tx) => {
      await tx.update(t.privateAttachments).set({ deletedAt: new Date() }).where(and(eq(t.privateAttachments.id, attachmentId), isNull(t.privateAttachments.deletedAt)));
      await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: ctx.supplierOrgId, rfqId, action: "attachment.removed", targetType: "attachment", targetId: attachmentId });
    });
  });
}

// ------------------------------------------------------------------ evaluation & award

export async function recordEvaluationAction(rfqId: string) {
  return guarded(async () => {
    const actor = await requireActor();
    await rateLimit(`evaluate:${actor.id}`, 30, 3600);
    return { jobId: await recordDeterministicEvaluation(actor, rfqId) };
  });
}

export async function requestAiEvaluationAction(rfqId: string) {
  return guarded(async () => {
    const actor = await requireActor();
    await rateLimit(`ai-eval:${actor.id}`, 10, 3600);
    return { jobId: await requestAiEvaluation(actor, rfqId) };
  });
}

export async function prepareAwardActionServer(rfqId: string, input: unknown): Promise<ActionResult<IntentView>> {
  return guarded(async () => prepareAward(await requireActor(), rfqId, input));
}

export async function prepareAwardStepAction(rfqId: string, kind: string): Promise<ActionResult<IntentView>> {
  return guarded(async () => {
    if (!(kind in INTENT_SPEC)) throw new AppError("INVALID_INPUT", "Unknown action.");
    return prepareAwardAction(await requireActor(), rfqId, kind as IntentKind);
  });
}

export async function prepareDeliveryAction(rfqId: string, input: { note: string; attachmentIds: string[] }): Promise<ActionResult<IntentView>> {
  return guarded(async () => prepareDelivery(await requireActor(), rfqId, input));
}

export async function markNotificationsReadAction() {
  return guarded(async () => {
    const actor = await requireActor();
    await db().update(t.notifications).set({ readAt: new Date() }).where(and(eq(t.notifications.userId, actor.id), isNull(t.notifications.readAt)));
  });
}
