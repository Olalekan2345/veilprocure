import "server-only";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import type { Actor } from "../authz";
import { db, tables } from "../db";
import { AppError } from "../errors";
import { verifyExpectedTx, type VerifiedTx } from "../near";
import { applyPublished } from "../services/rfq";
import { applyCommit, applyWithdraw } from "../services/supplier";
import { loadOwnIntent, type IntentKind } from "./intents";
import { syncRfqFromChain } from "./sync";

const t = tables;

export interface ConfirmResult {
  status: "confirmed" | "failed" | "pending";
  message: string;
  txHash: string;
}

const ESCROW_KINDS = new Set<IntentKind>([
  "award",
  "revoke_award",
  "fund_award",
  "accept_award",
  "decline_award",
  "reclaim_unaccepted",
  "submit_delivery",
  "approve_release",
  "claim_after_review",
  "retry_transfer",
  "request_cancel",
  "approve_cancel",
  "withdraw_cancel_request",
  "open_dispute",
]);

/**
 * Confirms a wallet-submitted transaction against the server-prepared intent. Idempotent:
 * re-reporting the same hash returns the stored outcome. A wallet "success" without a finalised,
 * matching on-chain transaction is never treated as success.
 */
export async function confirmIntent(actor: Actor, intentId: string, txHash: string): Promise<ConfirmResult> {
  const intent = await loadOwnIntent(actor, intentId);
  if (intent.status === "confirmed") {
    if (intent.txHash === txHash) return { status: "confirmed", message: "Already confirmed.", txHash };
    throw new AppError("CONFLICT", "This step was already confirmed with a different transaction.");
  }
  if (intent.status === "expired") throw new AppError("PRECONDITION_FAILED", "This request expired. Start the action again.");
  if (intent.txHash && intent.txHash !== txHash) throw new AppError("CONFLICT", "A different transaction was already reported for this step.");
  if (!intent.txHash) {
    await db().update(t.txIntents).set({ status: "submitted", txHash }).where(and(eq(t.txIntents.id, intent.id), eq(t.txIntents.status, "prepared")));
  }

  let tx: VerifiedTx;
  try {
    tx = await verifyExpectedTx(txHash, {
      signerId: intent.signerId,
      receiverId: intent.receiverId,
      methodName: intent.methodName,
      args: intent.args as Record<string, unknown>,
      depositYocto: BigInt(intent.depositYocto),
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "PRECONDITION_FAILED") return { status: "pending", message: err.message, txHash };
    if (err instanceof AppError && err.code === "CHAIN_VERIFICATION_FAILED") {
      await db().update(t.txIntents).set({ status: "failed", error: err.message }).where(eq(t.txIntents.id, intent.id));
    }
    throw err;
  }

  if (!tx.success) {
    await db().transaction(async (dbtx) => {
      await dbtx.update(t.txIntents).set({ status: "failed", error: tx.failure }).where(eq(t.txIntents.id, intent.id));
      await audit(dbtx, {
        actorKind: "user",
        actorUserId: actor.id,
        actorAccountId: tx.signerId,
        orgId: intent.orgId,
        rfqId: intent.rfqId,
        action: `chain.${intent.kind}.failed`,
        txHash,
        metadata: { reason: (tx.failure ?? "").slice(0, 200) },
      });
    });
    await recordTx(intent, tx, actor.id, "failed");
    return { status: "failed", message: humanFailure(tx.failure), txHash };
  }

  const kind = intent.kind as IntentKind;
  switch (kind) {
    case "publish_rfq": {
      const id = typeof tx.returnValue === "string" ? tx.returnValue : null;
      if (!id || !/^\d+$/.test(id)) throw new AppError("CHAIN_VERIFICATION_FAILED", "create_rfq did not return an RFQ id.");
      await applyPublished(intent.rfqId, BigInt(id), txHash, tx.signerId, tx.blockTimestampNs, actor.id);
      break;
    }
    case "commit_bid":
      await applyCommit(intent, tx, actor.id);
      break;
    case "withdraw_bid":
      await applyWithdraw(intent, tx, actor.id);
      break;
    default:
      await syncRfqFromChain(intent.rfqId);
  }
  if (ESCROW_KINDS.has(kind) || kind === "close_rfq" || kind === "cancel_rfq") await recordTx(intent, tx, actor.id, "confirmed");

  await db().transaction(async (dbtx) => {
    await dbtx.update(t.txIntents).set({ status: "confirmed", confirmedAt: new Date(), error: null }).where(eq(t.txIntents.id, intent.id));
    if (kind !== "publish_rfq" && kind !== "commit_bid" && kind !== "withdraw_bid") {
      await audit(dbtx, {
        actorKind: "user",
        actorUserId: actor.id,
        actorAccountId: tx.signerId,
        orgId: intent.orgId,
        rfqId: intent.rfqId,
        action: `chain.${kind}.confirmed`,
        targetType: ESCROW_KINDS.has(kind) ? "award" : "rfq",
        targetId: intent.refId,
        txHash,
        metadata: transferMeta(tx),
      });
    }
  });
  const transfer = tx.events.find((e) => e.event === "transfer_succeeded" || e.event === "transfer_failed");
  const message =
    transfer?.event === "transfer_failed"
      ? "The contract attempted the transfer and it failed. The funds remain in escrow and the transfer can be retried."
      : "Confirmed on NEAR testnet.";
  return { status: "confirmed", message, txHash };
}

function transferMeta(tx: VerifiedTx): Record<string, string> {
  const ev = tx.events.find((e) => e.event === "transfer_succeeded" || e.event === "transfer_failed");
  return ev ? { transfer: ev.event, attempt: ev.data[0]?.attempt ?? "" } : {};
}

async function recordTx(intent: typeof t.txIntents.$inferSelect, tx: VerifiedTx, userId: string, status: "confirmed" | "failed") {
  if (!ESCROW_KINDS.has(intent.kind as IntentKind) && intent.kind !== "close_rfq" && intent.kind !== "cancel_rfq") return;
  const [award] = ESCROW_KINDS.has(intent.kind as IntentKind)
    ? await db().select({ id: t.awards.id }).from(t.awards).where(eq(t.awards.id, intent.refId)).limit(1)
    : [];
  const transfer = tx.events.find((e) => e.event === "transfer_succeeded" || e.event === "transfer_failed");
  await db()
    .insert(t.escrowTransactions)
    .values({
      awardId: award?.id ?? null,
      rfqId: intent.rfqId,
      action: intent.kind,
      network: intent.network,
      txHash: tx.txHash,
      signerAccountId: tx.signerId,
      receiverId: tx.receiverId,
      methodName: tx.methodName,
      depositYocto: tx.depositYocto.toString(),
      status,
      blockHash: tx.blockHash,
      blockTimestampNs: tx.blockTimestampNs,
      transferOutcome: transfer?.event ?? null,
      failureReason: tx.failure,
      submittedBy: userId,
      verifiedAt: new Date(),
    })
    .onConflictDoNothing();
}

/** Contract panics look like "VP_CODE: message"; show the message, keep the code for support. */
export function humanFailure(failure: string | null): string {
  if (!failure) return "The transaction failed on chain.";
  const m = /(VP_[A-Z_]+): ([^"\\]+)/.exec(failure);
  return m ? `The contract rejected this action: ${m[2]} (${m[1]}).` : "The transaction failed on chain. Nothing was changed.";
}
