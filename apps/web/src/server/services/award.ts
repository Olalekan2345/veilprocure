import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { agreementHashHex, deliveryEvidenceHex, formatNear, normalizeText, parseNear, type AwardStatus } from "@veilprocure/shared";
import { audit } from "../audit";
import { requireMembership, type Actor } from "../authz";
import { db, tables, withActor } from "../db";
import { openJson, sealJson } from "../crypto";
import { AppError } from "../errors";
import { prepareIntent, type IntentKind, type IntentView } from "../chain/intents";
import { readChainRfq } from "../chain/sync";
import { buildComparison } from "./evaluation";
import { loadBuyerRfq } from "./rfq";

const t = tables;
const MINUTE_NS = 60_000_000_000n;

export const agreementAad = (awardId: string, org: string) => ({ table: "awards", id: awardId, org });

export async function currentAward(rfqId: string) {
  const [a] = await db().select().from(t.awards).where(eq(t.awards.rfqId, rfqId)).orderBy(desc(t.awards.round)).limit(1);
  return a ?? null;
}

export interface AgreementDoc {
  policyHash: string;
  rfqOnchainId: string;
  round: number;
  supplierAccountId: string;
  bidCommitment: string;
  amountYocto: string;
  acceptWindowMinutes: number;
  reviewWindowMinutes: number;
  reviewerAccountId: string | null;
  workSummary: string;
}

const awardInput = z.object({
  quoteId: z.uuid(),
  amountNear: z.string().trim().regex(/^(0|[1-9]\d*)(\.\d{1,24})?$/, "Enter an amount in NEAR, e.g. 2.5"),
  workSummary: z.string().trim().min(10, "Summarise the agreed work in at least 10 characters").max(2000),
  overrideReason: z.string().trim().max(1000).optional(),
});

/** Buyer selects an eligible, commitment-verified quote and prepares the award_supplier intent. */
export async function prepareAward(actor: Actor, rfqId: string, input: unknown): Promise<IntentView> {
  const parsed = awardInput.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid award.");
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:award");
  requireBuyerWallet(actor, rfq.buyerAccountId);
  if (rfq.status !== "closed") throw new AppError("PRECONDITION_FAILED", "Close bidding on chain before awarding.");
  const cmp = await buildComparison(actor, rfqId);
  const row = cmp.rows.find((r) => r.quoteId === parsed.data.quoteId);
  if (!row) throw new AppError("NOT_FOUND", "Quote not found.");
  if (row.integrity !== "verified") throw new AppError("PRECONDITION_FAILED", "This quote does not match its on-chain commitment and cannot be awarded.");
  if (!row.evaluation.eligible) throw new AppError("PRECONDITION_FAILED", "This quote fails a published hard requirement and cannot be awarded.");
  const overrideReason = parsed.data.overrideReason?.trim() ?? "";
  if (row.rank !== 1 && overrideReason.length < 10) {
    throw new AppError("INVALID_INPUT", "You chose a quote that is not ranked first. Record a reason (at least 10 characters) for the audit trail.");
  }
  const amountYocto = parseNear(parsed.data.amountNear);
  if (amountYocto <= 0n) throw new AppError("INVALID_INPUT", "Amount must be greater than zero.");
  const chain = await readChainRfq(rfq.onchainId!);
  const round = (chain?.awards.length ?? 0) + 1;
  const terms = cmp.policy.terms;
  const doc: AgreementDoc = {
    policyHash: rfq.policyHash!,
    rfqOnchainId: rfq.onchainId!.toString(),
    round,
    supplierAccountId: row.supplierAccountId,
    bidCommitment: row.commitment,
    amountYocto: amountYocto.toString(),
    acceptWindowMinutes: terms.acceptWindowMinutes,
    reviewWindowMinutes: terms.reviewWindowMinutes,
    reviewerAccountId: terms.reviewerAccountId,
    workSummary: normalizeText(parsed.data.workSummary),
  };
  const agreementHash = agreementHashHex(doc);

  const awardId = await db().transaction(async (tx) => {
    const [existing] = await tx.select().from(t.awards).where(and(eq(t.awards.rfqId, rfqId), eq(t.awards.round, round))).limit(1);
    if (existing && existing.status !== "pending_signature") throw new AppError("CONFLICT", "This award round already exists on chain.");
    if (existing) {
      const submitted = await tx
        .select({ id: t.txIntents.id })
        .from(t.txIntents)
        .where(and(eq(t.txIntents.refId, existing.id), eq(t.txIntents.status, "submitted")));
      if (submitted.length) throw new AppError("CONFLICT", "An award transaction is already awaiting confirmation.");
      await tx.update(t.txIntents).set({ status: "expired" }).where(and(eq(t.txIntents.refId, existing.id), eq(t.txIntents.status, "prepared")));
      await tx.delete(t.awards).where(eq(t.awards.id, existing.id));
    }
    const id = crypto.randomUUID();
    await tx.insert(t.awards).values({
      id,
      rfqId,
      round,
      quoteId: row.quoteId,
      supplierOrgId: row.supplierOrgId,
      supplierAccountId: row.supplierAccountId,
      amountYocto: amountYocto.toString(),
      agreementEnc: await sealJson(doc, agreementAad(id, rfq.buyerOrgId)),
      agreementHash,
      acceptWindowMinutes: terms.acceptWindowMinutes,
      reviewWindowMinutes: terms.reviewWindowMinutes,
      reviewerAccountId: terms.reviewerAccountId,
      overrideReason: overrideReason || null,
      chosenBy: actor.id,
    });
    await audit(tx, {
      actorKind: "user",
      actorUserId: actor.id,
      actorAccountId: actor.wallet!.accountId,
      orgId: rfq.buyerOrgId,
      rfqId,
      action: "award.prepared",
      targetType: "award",
      targetId: id,
      metadata: { round, rank: row.rank ?? 0, overridden: row.rank !== 1, agreementHash, amountYocto: amountYocto.toString() },
    });
    return id;
  });

  return prepareIntent({
    actor,
    orgId: rfq.buyerOrgId,
    kind: "award",
    rfqId,
    refId: awardId,
    signerId: actor.wallet!.accountId,
    args: {
      rfq_id: rfq.onchainId!.toString(),
      supplier_id: row.supplierAccountId,
      agreement_hash: agreementHash,
      amount_yocto: amountYocto.toString(),
      accept_window_ns: (BigInt(terms.acceptWindowMinutes) * MINUTE_NS).toString(),
      review_window_ns: (BigInt(terms.reviewWindowMinutes) * MINUTE_NS).toString(),
      reviewer_id: terms.reviewerAccountId,
    },
  });
}

function requireBuyerWallet(actor: Actor, buyerAccountId: string | null): void {
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind your NEAR testnet wallet first.");
  if (buyerAccountId && actor.wallet.accountId !== buyerAccountId) {
    throw new AppError("FORBIDDEN", `On chain, this RFQ belongs to ${buyerAccountId}. Only that wallet can sign buyer actions.`);
  }
}

const BUYER_KINDS: IntentKind[] = ["revoke_award", "fund_award", "reclaim_unaccepted", "approve_release"];
const SUPPLIER_KINDS: IntentKind[] = ["accept_award", "decline_award", "claim_after_review"];
const EITHER_KINDS: IntentKind[] = ["retry_transfer", "request_cancel", "approve_cancel", "withdraw_cancel_request", "open_dispute"];

/** Statuses (mirrored from chain) in which each action is offered; the contract re-checks. */
export const ACTION_STATES: Partial<Record<IntentKind, AwardStatus[]>> = {
  revoke_award: ["awarded"],
  fund_award: ["awarded"],
  reclaim_unaccepted: ["funded"],
  approve_release: ["delivered", "disputed"],
  accept_award: ["funded"],
  decline_award: ["awarded", "funded"],
  claim_after_review: ["delivered"],
  submit_delivery: ["accepted"],
  retry_transfer: ["release_failed", "refund_failed"],
  request_cancel: ["accepted", "delivered", "disputed"],
  approve_cancel: ["accepted", "delivered", "disputed"],
  withdraw_cancel_request: ["accepted", "delivered", "disputed"],
  open_dispute: ["accepted", "delivered"],
};

/** Prepares a single-step escrow action for the current award after role and wallet checks. */
export async function prepareAwardAction(actor: Actor, rfqId: string, kind: IntentKind): Promise<IntentView> {
  if (![...BUYER_KINDS, ...SUPPLIER_KINDS, ...EITHER_KINDS].includes(kind)) throw new AppError("INVALID_INPUT", "Unknown action.");
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  const award = rfq ? await currentAward(rfqId) : null;
  if (!rfq || !award || award.status === "pending_signature") throw new AppError("NOT_FOUND", "No active award for this RFQ.");
  const isBuyer = actor.memberships.some((m) => m.orgId === rfq.buyerOrgId);
  const isSupplier = actor.memberships.some((m) => m.orgId === award.supplierOrgId);
  let orgId: string;
  if (BUYER_KINDS.includes(kind) || (EITHER_KINDS.includes(kind) && isBuyer)) {
    if (!isBuyer) throw new AppError("NOT_FOUND", "No active award for this RFQ.");
    requireMembership(actor, rfq.buyerOrgId, "escrow:sign");
    requireBuyerWallet(actor, rfq.buyerAccountId);
    orgId = rfq.buyerOrgId;
  } else {
    if (!isSupplier) throw new AppError("NOT_FOUND", "No active award for this RFQ.");
    requireMembership(actor, award.supplierOrgId, "award:respond");
    if (!actor.wallet || actor.wallet.accountId !== award.supplierAccountId) {
      throw new AppError("FORBIDDEN", `This award is bound to ${award.supplierAccountId}. Only that wallet can sign supplier actions.`);
    }
    orgId = award.supplierOrgId;
  }
  const allowed = ACTION_STATES[kind];
  if (allowed && !allowed.includes(award.status as AwardStatus)) {
    throw new AppError("PRECONDITION_FAILED", `Not available while the award is "${award.status.replaceAll("_", " ")}".`);
  }
  return prepareIntent({
    actor,
    orgId,
    kind,
    rfqId,
    refId: award.id,
    signerId: actor.wallet!.accountId,
    args: { rfq_id: rfq.onchainId!.toString() },
    amountYocto: kind === "fund_award" ? BigInt(award.amountYocto) : undefined,
  });
}

/** Supplier anchors delivery evidence: note + uploaded files → evidence hash → submit_delivery. */
export async function prepareDelivery(actor: Actor, rfqId: string, input: { note: string; attachmentIds: string[] }): Promise<IntentView> {
  const note = normalizeText(String(input.note ?? ""));
  if (note.length < 10) throw new AppError("INVALID_INPUT", "Describe what you delivered (at least 10 characters).");
  if (note.length > 5000) throw new AppError("INVALID_INPUT", "Keep the delivery note under 5000 characters.");
  const award = await currentAward(rfqId);
  if (!award || award.status !== "accepted") throw new AppError("PRECONDITION_FAILED", "Delivery can be submitted once the award is accepted.");
  requireMembership(actor, award.supplierOrgId, "delivery:submit");
  if (!actor.wallet || actor.wallet.accountId !== award.supplierAccountId) throw new AppError("FORBIDDEN", `Sign with ${award.supplierAccountId}.`);
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  const ids = z.array(z.uuid()).max(10).parse(input.attachmentIds ?? []);
  const deliveryId = crypto.randomUUID();
  const evidenceHash = await withActor(db(), [award.supplierOrgId], async (tx) => {
    const files = ids.length
      ? await tx
          .select()
          .from(t.privateAttachments)
          .where(and(inArray(t.privateAttachments.id, ids), eq(t.privateAttachments.kind, "delivery"), eq(t.privateAttachments.ownerOrgId, award.supplierOrgId), isNull(t.privateAttachments.deletedAt), isNull(t.privateAttachments.deliveryId)))
      : [];
    if (files.length !== ids.length) throw new AppError("INVALID_INPUT", "One of the files is unavailable.");
    const digests = files.map((f) => f.sha256);
    const hash = deliveryEvidenceHex({ rfqRef: rfqId, round: award.round, note, fileDigests: digests });
    await tx.insert(t.deliveries).values({
      id: deliveryId,
      awardId: award.id,
      noteEnc: await sealJson({ note }, { table: "deliveries", id: deliveryId, org: award.supplierOrgId }),
      fileDigests: [...digests].sort(),
      evidenceHash: hash,
      submittedBy: actor.id,
    });
    if (ids.length) await tx.update(t.privateAttachments).set({ deliveryId }).where(inArray(t.privateAttachments.id, ids));
    await audit(tx, { actorKind: "user", actorUserId: actor.id, actorAccountId: actor.wallet!.accountId, orgId: award.supplierOrgId, rfqId, action: "delivery.prepared", targetType: "delivery", targetId: deliveryId, metadata: { files: ids.length, evidenceHash: hash } });
    return hash;
  });
  return prepareIntent({
    actor,
    orgId: award.supplierOrgId,
    kind: "submit_delivery",
    rfqId,
    refId: award.id,
    signerId: actor.wallet.accountId,
    args: { rfq_id: rfq!.onchainId!.toString(), evidence_hash: evidenceHash },
  });
}

export async function readAgreement(award: typeof t.awards.$inferSelect, buyerOrgId: string): Promise<AgreementDoc> {
  return openJson<AgreementDoc>(award.agreementEnc, agreementAad(award.id, buyerOrgId));
}

export async function deliveriesFor(awardId: string, supplierOrgId: string) {
  const rows = await db().select().from(t.deliveries).where(eq(t.deliveries.awardId, awardId)).orderBy(desc(t.deliveries.createdAt));
  return Promise.all(rows.map(async (d) => ({ ...d, note: (await openJson<{ note: string }>(d.noteEnc, { table: "deliveries", id: d.id, org: supplierOrgId })).note })));
}

export function describeAmount(yocto: string): string {
  return `${formatNear(BigInt(yocto), 8)} (testnet)`;
}

export async function loadBuyerAwardContext(actor: Actor, rfqId: string) {
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:view");
  return { rfq, award: await currentAward(rfqId) };
}
