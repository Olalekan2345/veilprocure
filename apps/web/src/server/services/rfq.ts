import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  CATEGORIES,
  freezePolicy,
  inviteLeafHex,
  msToNs,
  newInviteSecretHex,
  policyHashHex,
  rfqDraftSchema,
  termsHashHex,
  type FrozenPolicy,
  type RfqDraft,
} from "@veilprocure/shared";
import { audit } from "../audit";
import { requireMembership, type Actor } from "../authz";
import { db, tables } from "../db";
import { newToken, openJson, sealJson } from "../crypto";
import { sendEmail, type DeliveryStatus } from "../email";
import { env } from "../env";
import { AppError, zodFieldErrors } from "../errors";
import { prepareIntent, requireContract, type IntentView } from "../chain/intents";
import { readChainRfq } from "../chain/sync";

const t = tables;
export type RfqRow = typeof t.rfqs.$inferSelect;

export const MIN_BIDDING_MINUTES = 2;

export function defaultDraft(title: string, category: keyof typeof CATEGORIES): RfqDraft {
  return {
    title,
    category,
    summary: "",
    scope: "",
    deliverables: [],
    currency: "USD",
    maxPrice: null,
    maxDeliveryDays: null,
    minRevisions: null,
    requirements: [],
    weights: { price: 60, delivery: 30, revisions: 10 },
    acceptWindowMinutes: 3 * 24 * 60,
    reviewWindowMinutes: 7 * 24 * 60,
    reviewerAccountId: null,
  };
}

const draftAad = (rfq: Pick<RfqRow, "id" | "buyerOrgId">) => ({ table: "rfqs", id: rfq.id, org: rfq.buyerOrgId });
const pendingAad = (rfq: Pick<RfqRow, "id" | "buyerOrgId">) => ({ table: "rfqs.pending", id: rfq.id, org: rfq.buyerOrgId });
const secretAad = (slotId: string, org: string) => ({ table: "rfq_suppliers", id: slotId, org });
export const policyAad = (versionId: string, org: string) => ({ table: "rfq_policy_versions", id: versionId, org });

interface PendingPublication {
  policy: FrozenPolicy;
  policyHash: string;
  termsHash: string;
  deadlineNs: string;
  leaves: string[];
}

/** Loads an RFQ for its buyer organisation. Non-members get a 404 (existence is not leaked). */
export async function loadBuyerRfq(actor: Actor, rfqId: string, perm: "rfq:view" | "rfq:edit" | "rfq:publish" | "rfq:invite" | "rfq:evaluate" | "rfq:award" = "rfq:view") {
  if (!z.uuid().safeParse(rfqId).success) notFound();
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  if (!rfq || !actor.memberships.some((m) => m.orgId === rfq.buyerOrgId)) notFound();
  requireMembership(actor, rfq.buyerOrgId, perm);
  return rfq;
}

export async function readDraft(rfq: RfqRow): Promise<RfqDraft> {
  return openJson<RfqDraft>(rfq.draftEnc, draftAad(rfq));
}

export async function readFrozenPolicy(rfq: RfqRow): Promise<{ policy: FrozenPolicy; version: number } | null> {
  const [v] = await db().select().from(t.rfqPolicyVersions).where(eq(t.rfqPolicyVersions.rfqId, rfq.id)).orderBy(desc(t.rfqPolicyVersions.version)).limit(1);
  if (!v) return null;
  return { policy: await openJson<FrozenPolicy>(v.policyEnc, policyAad(v.id, rfq.buyerOrgId)), version: v.version };
}

export async function listBuyerRfqs(orgId: string) {
  return db().select().from(t.rfqs).where(eq(t.rfqs.buyerOrgId, orgId)).orderBy(desc(t.rfqs.createdAt));
}

export async function listSlots(rfqId: string) {
  return db()
    .select({
      id: t.rfqSuppliers.id,
      slotIndex: t.rfqSuppliers.slotIndex,
      inviteEmail: t.rfqSuppliers.inviteEmail,
      status: t.rfqSuppliers.status,
      supplierOrgId: t.rfqSuppliers.supplierOrgId,
      supplierOrgName: t.organizations.name,
      inviteLeaf: t.rfqSuppliers.inviteLeaf,
      acceptedAt: t.rfqSuppliers.acceptedAt,
    })
    .from(t.rfqSuppliers)
    .leftJoin(t.organizations, eq(t.organizations.id, t.rfqSuppliers.supplierOrgId))
    .where(eq(t.rfqSuppliers.rfqId, rfqId))
    .orderBy(asc(t.rfqSuppliers.slotIndex));
}

export async function createDraft(actor: Actor, orgId: string, title: string, category: keyof typeof CATEGORIES): Promise<string> {
  requireMembership(actor, orgId, "rfq:edit");
  const id = crypto.randomUUID();
  const draftEnc = await sealJson(defaultDraft(title, category), { table: "rfqs", id, org: orgId });
  await db().transaction(async (tx) => {
    await tx.insert(t.rfqs).values({ id, buyerOrgId: orgId, createdBy: actor.id, status: "draft", title, category, draftEnc });
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId, rfqId: id, action: "rfq.draft_created", targetType: "rfq", targetId: id });
  });
  return id;
}

/** Shape-level validation for saving work in progress; completeness is checked at publish. */
const draftShape = z.object({
  title: z.string().trim().min(1).max(140),
  category: z.enum(Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]]),
  summary: z.string().max(500),
  scope: z.string().max(20000),
  deliverables: z.array(z.string().max(300)).max(20),
  currency: rfqDraftSchema.shape.currency,
  maxPrice: z.string().max(40).nullable(),
  maxDeliveryDays: z.number().int().min(1).max(3650).nullable(),
  minRevisions: z.number().int().min(0).max(100).nullable(),
  requirements: z.array(z.object({ id: z.string().max(40), label: z.string().max(120), description: z.string().max(1000) })).max(15),
  weights: z.object({ price: z.number().int().min(0).max(100), delivery: z.number().int().min(0).max(100), revisions: z.number().int().min(0).max(100) }),
  acceptWindowMinutes: z.number().int().min(1).max(30 * 24 * 60),
  reviewWindowMinutes: z.number().int().min(1).max(90 * 24 * 60),
  reviewerAccountId: z.string().max(64).nullable(),
});

export async function saveDraft(actor: Actor, rfqId: string, input: unknown, deadlineIso: string | null, invitees: string[]) {
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:edit");
  if (rfq.status !== "draft") throw new AppError("PRECONDITION_FAILED", "Only drafts can be edited. Published criteria are frozen; cancel and reissue to change them.");
  const parsed = draftShape.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "Some fields are invalid.", zodFieldErrors(parsed.error.issues));
  const deadline = deadlineIso ? new Date(deadlineIso) : null;
  if (deadline && Number.isNaN(deadline.getTime())) throw new AppError("INVALID_INPUT", "Deadline is not a valid date.", { deadline: "Invalid date" });

  const emails = [...new Set(invitees.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 20) throw new AppError("INVALID_INPUT", "At most 20 suppliers can be invited.", { invitees: "At most 20" });
  for (const e of emails) {
    if (!z.email().safeParse(e).success) throw new AppError("INVALID_INPUT", `"${e}" is not a valid e-mail address.`, { invitees: `Invalid: ${e}` });
    if (e === actor.email) throw new AppError("INVALID_INPUT", "You cannot invite yourself as a supplier.", { invitees: "Remove your own address" });
  }

  await db().transaction(async (tx) => {
    await tx
      .update(t.rfqs)
      .set({ title: parsed.data.title.trim() || rfq.title, category: parsed.data.category, draftEnc: await sealJson(parsed.data, draftAad(rfq)), deadlineAt: deadline, updatedAt: new Date() })
      .where(and(eq(t.rfqs.id, rfq.id), eq(t.rfqs.status, "draft")));
    const existing = await tx.select().from(t.rfqSuppliers).where(eq(t.rfqSuppliers.rfqId, rfq.id));
    const keep = new Set(emails);
    const remove = existing.filter((s) => !keep.has(s.inviteEmail)).map((s) => s.id);
    if (remove.length) await tx.delete(t.rfqSuppliers).where(inArray(t.rfqSuppliers.id, remove));
    const have = new Set(existing.map((s) => s.inviteEmail));
    // Re-number slots densely in e-mail order so slot indices are stable at publish time.
    const ordered = emails;
    for (const [i, email] of ordered.entries()) {
      if (have.has(email)) {
        await tx.update(t.rfqSuppliers).set({ slotIndex: 1000 + i }).where(and(eq(t.rfqSuppliers.rfqId, rfq.id), eq(t.rfqSuppliers.inviteEmail, email)));
      } else {
        await tx.insert(t.rfqSuppliers).values({ rfqId: rfq.id, slotIndex: 1000 + i, inviteEmail: email });
      }
    }
    for (const [i, email] of ordered.entries()) {
      await tx.update(t.rfqSuppliers).set({ slotIndex: i }).where(and(eq(t.rfqSuppliers.rfqId, rfq.id), eq(t.rfqSuppliers.inviteEmail, email)));
    }
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: rfq.buyerOrgId, rfqId: rfq.id, action: "rfq.draft_saved", targetType: "rfq", targetId: rfq.id, metadata: { invitees: emails.length } });
  });
}

export interface ReadinessIssue {
  field: string;
  message: string;
}

export async function publishReadiness(rfq: RfqRow, actor: Actor): Promise<{ draft: RfqDraft; issues: ReadinessIssue[] }> {
  const draft = await readDraft(rfq);
  const issues: ReadinessIssue[] = [];
  const full = rfqDraftSchema.safeParse(draft);
  if (!full.success) {
    for (const [field, message] of Object.entries(zodFieldErrors(full.error.issues))) issues.push({ field, message });
  }
  const minDeadline = Date.now() + MIN_BIDDING_MINUTES * 60_000;
  if (!rfq.deadlineAt) issues.push({ field: "deadline", message: "Set a bid deadline." });
  else if (rfq.deadlineAt.getTime() < minDeadline) issues.push({ field: "deadline", message: `Deadline must be at least ${MIN_BIDDING_MINUTES} minutes from now.` });
  else if (rfq.deadlineAt.getTime() > Date.now() + 365 * 24 * 3600_000) issues.push({ field: "deadline", message: "Deadline must be within 365 days." });
  const slots = await db().select({ id: t.rfqSuppliers.id }).from(t.rfqSuppliers).where(eq(t.rfqSuppliers.rfqId, rfq.id));
  if (slots.length === 0) issues.push({ field: "invitees", message: "Invite at least one supplier." });
  if (!actor.wallet) issues.push({ field: "wallet", message: "Bind your NEAR testnet wallet; it signs the on-chain policy commitment." });
  return { draft, issues };
}

/** Freezes the policy, assigns per-slot invite secrets and returns the create_rfq intent. */
export async function preparePublish(actor: Actor, rfqId: string): Promise<IntentView> {
  const contractId = requireContract();
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:publish");
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind your NEAR testnet wallet first.");

  if (rfq.status === "publishing" && rfq.pendingPublicationEnc) {
    const pending = await openJson<PendingPublication>(rfq.pendingPublicationEnc, pendingAad(rfq));
    if (pending.policy.buyerAccountId === actor.wallet.accountId) {
      return prepareIntent({ actor, orgId: rfq.buyerOrgId, kind: "publish_rfq", rfqId: rfq.id, refId: rfq.id, signerId: actor.wallet.accountId, args: publishArgs(pending) });
    }
  }
  if (rfq.status !== "draft" && rfq.status !== "publishing") throw new AppError("PRECONDITION_FAILED", "This RFQ is already published.");
  const { draft, issues } = await publishReadiness(rfq, actor);
  if (issues.length) throw new AppError("PRECONDITION_FAILED", issues.map((i) => i.message).join(" "));

  const slots = await db().select().from(t.rfqSuppliers).where(eq(t.rfqSuppliers.rfqId, rfq.id)).orderBy(asc(t.rfqSuppliers.slotIndex));
  const deadlineNs = msToNs(rfq.deadlineAt!.getTime());
  const policy = freezePolicy(draft, {
    network: "testnet",
    contractId,
    rfqRef: rfq.id,
    buyerAccountId: actor.wallet.accountId,
    deadlineNs,
    inviteSlots: slots.length,
  });
  const policyHash = policyHashHex(policy);
  const termsHash = termsHashHex(policy);
  const leaves: string[] = [];
  await db().transaction(async (tx) => {
    for (const s of slots) {
      const secret = newInviteSecretHex();
      const leaf = inviteLeafHex(policyHash, secret);
      leaves.push(leaf);
      await tx.update(t.rfqSuppliers).set({ inviteSecretEnc: await sealJson({ secret }, secretAad(s.id, rfq.buyerOrgId)), inviteLeaf: leaf }).where(eq(t.rfqSuppliers.id, s.id));
    }
    const pending: PendingPublication = { policy, policyHash, termsHash, deadlineNs: deadlineNs.toString(), leaves };
    await tx
      .update(t.rfqs)
      .set({ status: "publishing", pendingPublicationEnc: await sealJson(pending, pendingAad(rfq)), updatedAt: new Date() })
      .where(eq(t.rfqs.id, rfq.id));
    await audit(tx, { actorKind: "user", actorUserId: actor.id, actorAccountId: actor.wallet!.accountId, orgId: rfq.buyerOrgId, rfqId: rfq.id, action: "rfq.publication_prepared", targetType: "rfq", targetId: rfq.id, metadata: { policyHash, slots: slots.length } });
  });
  return prepareIntent({
    actor,
    orgId: rfq.buyerOrgId,
    kind: "publish_rfq",
    rfqId: rfq.id,
    refId: rfq.id,
    signerId: actor.wallet.accountId,
    args: publishArgs({ policy, policyHash, termsHash, deadlineNs: deadlineNs.toString(), leaves }),
  });
}

function publishArgs(p: PendingPublication): Record<string, unknown> {
  return { policy_hash: p.policyHash, terms_hash: p.termsHash, deadline_ns: p.deadlineNs, invite_leaves: p.leaves };
}

export async function returnToDraft(actor: Actor, rfqId: string): Promise<void> {
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:publish");
  if (rfq.status !== "publishing") throw new AppError("PRECONDITION_FAILED", "Only an RFQ that is waiting for its publication signature can return to draft.");
  await db().transaction(async (tx) => {
    const open = await tx
      .select()
      .from(t.txIntents)
      .where(and(eq(t.txIntents.rfqId, rfq.id), eq(t.txIntents.kind, "publish_rfq"), eq(t.txIntents.status, "submitted")));
    if (open.length) throw new AppError("CONFLICT", "A publication transaction was already submitted; wait for it to be checked on chain.");
    await tx.update(t.txIntents).set({ status: "expired" }).where(and(eq(t.txIntents.rfqId, rfq.id), eq(t.txIntents.kind, "publish_rfq"), eq(t.txIntents.status, "prepared")));
    await tx.update(t.rfqs).set({ status: "draft", pendingPublicationEnc: null, updatedAt: new Date() }).where(eq(t.rfqs.id, rfq.id));
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: rfq.buyerOrgId, rfqId: rfq.id, action: "rfq.publication_abandoned", targetType: "rfq", targetId: rfq.id });
  });
}

/**
 * Applies a verified create_rfq transaction: checks the on-chain record field by field against
 * the pending publication, then freezes the policy version and opens the RFQ.
 */
export async function applyPublished(rfqId: string, onchainId: bigint, txHash: string, signerId: string, blockTimestampNs: string, userId: string): Promise<void> {
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  if (!rfq) throw new AppError("NOT_FOUND", "RFQ not found.");
  if (rfq.status === "open" && rfq.onchainId === onchainId) return; // idempotent
  if (rfq.status !== "publishing" || !rfq.pendingPublicationEnc) throw new AppError("PRECONDITION_FAILED", "This RFQ is not awaiting publication.");
  const pending = await openJson<PendingPublication>(rfq.pendingPublicationEnc, pendingAad(rfq));
  const chain = await readChainRfq(onchainId);
  if (!chain) throw new AppError("CHAIN_VERIFICATION_FAILED", "The contract has no RFQ with the returned id.");
  const problems: string[] = [];
  if (chain.buyer !== signerId || chain.buyer !== pending.policy.buyerAccountId) problems.push("buyer");
  if (chain.policy_hash !== pending.policyHash) problems.push("policy hash");
  if (chain.terms_hash !== pending.termsHash) problems.push("terms hash");
  if (chain.deadline_ns !== pending.deadlineNs) problems.push("deadline");
  if (chain.invite_leaves.join() !== pending.leaves.join()) problems.push("invite leaves");
  if (problems.length) throw new AppError("CHAIN_VERIFICATION_FAILED", `On-chain RFQ does not match the prepared policy (${problems.join(", ")}).`);

  await db().transaction(async (tx) => {
    const versionId = crypto.randomUUID();
    await tx.insert(t.rfqPolicyVersions).values({
      id: versionId,
      rfqId: rfq.id,
      version: 1,
      policyEnc: await sealJson(pending.policy, policyAad(versionId, rfq.buyerOrgId)),
      policyHash: pending.policyHash,
      termsHash: pending.termsHash,
      createdBy: userId,
    });
    await tx
      .update(t.rfqs)
      .set({
        status: "open",
        network: "testnet",
        contractId: env().NEAR_CONTRACT_ID,
        onchainId,
        buyerAccountId: chain.buyer,
        policyHash: pending.policyHash,
        termsHash: pending.termsHash,
        deadlineAt: new Date(Number(BigInt(chain.deadline_ns) / 1_000_000n)),
        publishedAt: new Date(Number(BigInt(blockTimestampNs) / 1_000_000n)),
        pendingPublicationEnc: null,
        chainSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(t.rfqs.id, rfq.id));
    await tx
      .insert(t.commitmentReceipts)
      .values({
        kind: "rfq_policy",
        rfqId: rfq.id,
        network: "testnet",
        txHash,
        signerAccountId: signerId,
        receiverId: env().NEAR_CONTRACT_ID,
        methodName: "create_rfq",
        status: "confirmed",
        blockTimestampNs,
        submittedBy: userId,
        verifiedAt: new Date(),
      })
      .onConflictDoNothing();
    await audit(tx, {
      actorKind: "user",
      actorUserId: userId,
      actorAccountId: signerId,
      orgId: rfq.buyerOrgId,
      rfqId: rfq.id,
      action: "rfq.published",
      targetType: "rfq",
      targetId: rfq.id,
      txHash,
      metadata: { onchainId: onchainId.toString(), policyHash: pending.policyHash },
    });
  });
  await sendSupplierInvites(rfq.id, userId);
}

/** Issues (or re-issues) an invite token per pending slot and e-mails it. */
export async function sendSupplierInvites(rfqId: string, userId: string, onlySlotId?: string): Promise<{ slotId: string; email: string; delivery: DeliveryStatus; link: string }[]> {
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  if (!rfq) return [];
  const [buyer] = await db().select({ name: t.organizations.name }).from(t.organizations).where(eq(t.organizations.id, rfq.buyerOrgId)).limit(1);
  const slots = await db()
    .select()
    .from(t.rfqSuppliers)
    .where(and(eq(t.rfqSuppliers.rfqId, rfqId), eq(t.rfqSuppliers.status, "pending"), onlySlotId ? eq(t.rfqSuppliers.id, onlySlotId) : undefined));
  const out: { slotId: string; email: string; delivery: DeliveryStatus; link: string }[] = [];
  for (const s of slots) {
    const { token, hash } = newToken(32);
    await db()
      .update(t.supplierInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(t.supplierInvites.rfqSupplierId, s.id), isNull(t.supplierInvites.consumedAt), isNull(t.supplierInvites.revokedAt)));
    await db().insert(t.supplierInvites).values({ rfqSupplierId: s.id, tokenHash: hash, expiresAt: rfq.deadlineAt ?? new Date(Date.now() + 7 * 86400_000), createdBy: userId });
    const link = `${env().APP_URL}/invite/${token}`;
    const delivery = await sendEmail({
      to: s.inviteEmail,
      template: "supplier_invite",
      subject: `Invitation to quote: ${rfq.title}`,
      text: [
        `${buyer?.name ?? "A buyer"} invited you to submit a confidential quote on VeilProcure for "${rfq.title}".`,
        rfq.deadlineAt ? `Bids close ${rfq.deadlineAt.toUTCString()}.` : "",
        "",
        `Open the invitation (sign in with this e-mail address): ${link}`,
        "",
        "Quotes are deadline-sealed with audited access controls: the buyer cannot read them before the deadline.",
        "Payments run on NEAR testnet and have no monetary value.",
      ].join("\n"),
    });
    await audit(db(), { actorKind: "user", actorUserId: userId, orgId: rfq.buyerOrgId, rfqId, action: "rfq.supplier_invited", targetType: "rfq_supplier", targetId: s.id, metadata: { delivery } });
    out.push({ slotId: s.id, email: s.inviteEmail, delivery, link });
  }
  return out;
}

export async function prepareSimpleRfqIntent(actor: Actor, rfqId: string, kind: "close_rfq" | "cancel_rfq"): Promise<IntentView> {
  const rfq = await loadBuyerRfq(actor, rfqId, kind === "cancel_rfq" ? "rfq:publish" : "rfq:view");
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind your NEAR testnet wallet first.");
  if (rfq.onchainId === null) throw new AppError("PRECONDITION_FAILED", "This RFQ is not on chain yet.");
  if (kind === "close_rfq" && rfq.status !== "open") throw new AppError("PRECONDITION_FAILED", "Bidding is not open.");
  if (kind === "cancel_rfq" && rfq.status !== "open" && rfq.status !== "closed") throw new AppError("PRECONDITION_FAILED", "This RFQ can no longer be cancelled.");
  return prepareIntent({ actor, orgId: rfq.buyerOrgId, kind, rfqId: rfq.id, refId: rfq.id, signerId: actor.wallet.accountId, args: { rfq_id: rfq.onchainId.toString() } });
}
