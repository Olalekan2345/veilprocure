import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { canonicalJson, formatNear } from "@veilprocure/shared";
import { db, tables } from "../db";
import { contractConfigured, env } from "../env";
import { AppError } from "../errors";
import type { Actor } from "../authz";

const t = tables;
const TGAS = 1_000_000_000_000n;
const NEAR = 10n ** 24n;

export type IntentKind =
  | "publish_rfq"
  | "commit_bid"
  | "withdraw_bid"
  | "close_rfq"
  | "cancel_rfq"
  | "award"
  | "revoke_award"
  | "fund_award"
  | "accept_award"
  | "decline_award"
  | "reclaim_unaccepted"
  | "submit_delivery"
  | "approve_release"
  | "claim_after_review"
  | "retry_transfer"
  | "request_cancel"
  | "approve_cancel"
  | "withdraw_cancel_request"
  | "open_dispute";

/** Contract method, gas and deposit policy per intent kind. */
export const INTENT_SPEC: Record<IntentKind, { method: string; gasTgas: bigint; deposit: "storage" | "one_yocto" | "none" | "amount"; label: string }> = {
  publish_rfq: { method: "create_rfq", gasTgas: 50n, deposit: "storage", label: "Publish RFQ policy commitment" },
  commit_bid: { method: "commit_bid", gasTgas: 50n, deposit: "storage", label: "Commit sealed bid" },
  withdraw_bid: { method: "withdraw_bid", gasTgas: 30n, deposit: "one_yocto", label: "Withdraw bid" },
  close_rfq: { method: "close_rfq", gasTgas: 30n, deposit: "none", label: "Close bidding" },
  cancel_rfq: { method: "cancel_rfq", gasTgas: 30n, deposit: "one_yocto", label: "Cancel RFQ" },
  award: { method: "award_supplier", gasTgas: 50n, deposit: "storage", label: "Award supplier" },
  revoke_award: { method: "revoke_award", gasTgas: 30n, deposit: "one_yocto", label: "Revoke unfunded award" },
  fund_award: { method: "fund_award", gasTgas: 50n, deposit: "amount", label: "Fund escrow" },
  accept_award: { method: "accept_award", gasTgas: 30n, deposit: "one_yocto", label: "Accept award" },
  decline_award: { method: "decline_award", gasTgas: 100n, deposit: "one_yocto", label: "Decline award" },
  reclaim_unaccepted: { method: "reclaim_unaccepted", gasTgas: 100n, deposit: "one_yocto", label: "Reclaim unaccepted escrow" },
  submit_delivery: { method: "submit_delivery", gasTgas: 30n, deposit: "one_yocto", label: "Anchor delivery evidence" },
  approve_release: { method: "approve_release", gasTgas: 100n, deposit: "one_yocto", label: "Approve delivery and release payment" },
  claim_after_review: { method: "claim_after_review", gasTgas: 100n, deposit: "one_yocto", label: "Claim payment after review window" },
  retry_transfer: { method: "retry_transfer", gasTgas: 100n, deposit: "one_yocto", label: "Retry failed transfer" },
  request_cancel: { method: "request_cancel", gasTgas: 30n, deposit: "one_yocto", label: "Request mutual cancellation" },
  approve_cancel: { method: "approve_cancel", gasTgas: 100n, deposit: "one_yocto", label: "Approve cancellation and refund" },
  withdraw_cancel_request: { method: "withdraw_cancel_request", gasTgas: 30n, deposit: "one_yocto", label: "Withdraw cancellation request" },
  open_dispute: { method: "open_dispute", gasTgas: 30n, deposit: "one_yocto", label: "Open dispute" },
};

/** Storage deposits attached for record-creating calls. The contract refunds any excess. */
export const STORAGE_DEPOSIT_YOCTO: Partial<Record<IntentKind, bigint>> = {
  publish_rfq: NEAR / 20n, // 0.05 NEAR
  commit_bid: NEAR / 100n, // 0.01 NEAR
  award: NEAR / 50n, // 0.02 NEAR
};

export interface IntentView {
  id: string;
  kind: IntentKind;
  label: string;
  network: string;
  signerId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  depositYocto: string;
  gas: string;
  depositLabel: string;
  depositNote: string;
  expiresAt: string;
  status: string;
}

function toView(row: typeof t.txIntents.$inferSelect): IntentView {
  const kind = row.kind as IntentKind;
  const spec = INTENT_SPEC[kind];
  const deposit = BigInt(row.depositYocto);
  const note =
    spec.deposit === "storage"
      ? "Storage deposit for the on-chain record. The contract refunds any amount above the measured storage cost."
      : spec.deposit === "one_yocto"
        ? "1 yoctoNEAR forces a full-access wallet confirmation. It is not a payment."
        : spec.deposit === "amount"
          ? "Escrow principal. Held by the contract until released to the supplier or refunded to you."
          : "No deposit.";
  return {
    id: row.id,
    kind,
    label: spec.label,
    network: row.network,
    signerId: row.signerId,
    receiverId: row.receiverId,
    methodName: row.methodName,
    args: row.args as Record<string, unknown>,
    depositYocto: row.depositYocto,
    gas: row.gas,
    depositLabel: deposit === 0n ? "0 NEAR" : deposit === 1n ? "1 yoctoNEAR" : formatNear(deposit, 8),
    depositNote: note,
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
  };
}

export function requireContract(): string {
  if (!contractConfigured()) {
    throw new AppError(
      "CHAIN_NOT_CONFIGURED",
      "The VeilProcure testnet contract is not configured on this server yet, so on-chain actions are disabled.",
    );
  }
  return env().NEAR_CONTRACT_ID;
}

/**
 * Prepares (or re-uses) the single open intent for (user, kind, ref). Re-using an identical open
 * intent makes double-clicks harmless; a different payload expires the old intent first.
 */
export async function prepareIntent(input: {
  actor: Actor;
  orgId: string;
  kind: IntentKind;
  rfqId: string;
  refId: string;
  signerId: string;
  args: Record<string, unknown>;
  amountYocto?: bigint;
}): Promise<IntentView> {
  const receiverId = requireContract();
  const spec = INTENT_SPEC[input.kind];
  const deposit =
    spec.deposit === "storage"
      ? STORAGE_DEPOSIT_YOCTO[input.kind]!
      : spec.deposit === "one_yocto"
        ? 1n
        : spec.deposit === "amount"
          ? (input.amountYocto ?? 0n)
          : 0n;
  if (spec.deposit === "amount" && deposit <= 0n) throw new AppError("INVALID_INPUT", "Amount must be positive.");
  const gas = (spec.gasTgas * TGAS).toString();

  return db().transaction(async (tx) => {
    await tx
      .update(t.txIntents)
      .set({ status: "expired" })
      .where(and(eq(t.txIntents.status, "prepared"), lt(t.txIntents.expiresAt, new Date())));
    const [open] = await tx
      .select()
      .from(t.txIntents)
      .where(
        and(
          eq(t.txIntents.userId, input.actor.id),
          eq(t.txIntents.kind, input.kind),
          eq(t.txIntents.refId, input.refId),
          inArray(t.txIntents.status, ["prepared", "submitted"]),
        ),
      )
      .limit(1);
    if (open) {
      const same =
        canonicalJson(open.args) === canonicalJson(input.args) &&
        open.signerId === input.signerId &&
        BigInt(open.depositYocto) === deposit;
      if (same) return toView(open);
      if (open.status === "submitted") {
        throw new AppError("CONFLICT", "A transaction for this step is already awaiting confirmation on chain.");
      }
      await tx.update(t.txIntents).set({ status: "expired" }).where(eq(t.txIntents.id, open.id));
    }
    const [row] = await tx
      .insert(t.txIntents)
      .values({
        userId: input.actor.id,
        orgId: input.orgId,
        kind: input.kind,
        rfqId: input.rfqId,
        refId: input.refId,
        network: env().NEAR_NETWORK,
        signerId: input.signerId,
        receiverId,
        methodName: spec.method,
        args: input.args,
        depositYocto: deposit.toString(),
        gas,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })
      .returning();
    return toView(row!);
  });
}

export async function loadOwnIntent(actor: Actor, intentId: string) {
  const [row] = await db().select().from(t.txIntents).where(and(eq(t.txIntents.id, intentId), eq(t.txIntents.userId, actor.id))).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "That transaction request does not exist or is not yours.");
  return row;
}

export { toView as intentView };
