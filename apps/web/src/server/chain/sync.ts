import "server-only";
import { and, eq } from "drizzle-orm";
import type { AwardStatus, RfqStatus } from "@veilprocure/shared";
import { db, tables } from "../db";
import { env } from "../env";
import { viewFunction } from "../near";
import { audit } from "../audit";

const t = tables;

/** JSON shape returned by the contract's `get_rfq` view (contracts/veilprocure/contract). */
export interface ChainBid {
  supplier: string;
  invite_leaf: string;
  commitment: string;
  version: number;
  revisions: number;
  first_committed_at_ns: string;
  committed_at_ns: string;
  withdrawn: boolean;
}
export interface ChainAward {
  round: number;
  supplier: string;
  agreement_hash: string;
  amount_yocto: string;
  reviewer: string | null;
  accept_window_ns: string;
  review_window_ns: string;
  status: AwardStatus;
  awarded_at_ns: string;
  funded_at_ns: string;
  accept_by_ns: string;
  accepted_at_ns: string;
  delivered_at_ns: string;
  review_deadline_ns: string;
  settled_at_ns: string;
  evidence_hash: string | null;
  attempt: number;
  cancel_requested_by: "none" | "buyer" | "supplier";
  dispute_opened_by: "none" | "buyer" | "supplier";
}
export interface ChainRfq {
  id: string;
  buyer: string;
  status: Exclude<RfqStatus, "draft" | "publishing">;
  policy_hash: string;
  terms_hash: string;
  created_at_ns: string;
  deadline_ns: string;
  closed_at_ns: string;
  invite_leaves: string[];
  bids: ChainBid[];
  awards: ChainAward[];
  escrowed_yocto: string;
}

export async function readChainRfq(onchainId: bigint): Promise<ChainRfq | null> {
  return viewFunction<ChainRfq | null>(env().NEAR_CONTRACT_ID, "get_rfq", { rfq_id: onchainId.toString() });
}

/**
 * Projects on-chain RFQ and award state into the database (idempotent). The chain is the source
 * of truth for every financial status; this never moves state "forward" on optimism.
 * Quote-revision projection happens in supplier context or in the worker (RLS).
 */
export async function syncRfqFromChain(rfqId: string): Promise<ChainRfq | null> {
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, rfqId)).limit(1);
  if (!rfq || rfq.onchainId === null || rfq.contractId !== env().NEAR_CONTRACT_ID) return null;
  const chain = await readChainRfq(rfq.onchainId);
  if (!chain) return null;

  if (chain.policy_hash !== rfq.policyHash || chain.buyer !== rfq.buyerAccountId) {
    await audit(db(), {
      actorKind: "system",
      orgId: rfq.buyerOrgId,
      rfqId,
      action: "chain.mismatch_detected",
      targetType: "rfq",
      targetId: rfqId,
      metadata: { field: chain.policy_hash !== rfq.policyHash ? "policy_hash" : "buyer" },
    });
    return chain;
  }

  await db().transaction(async (tx) => {
    if (rfq.status !== chain.status) {
      await tx
        .update(t.rfqs)
        .set({
          status: chain.status,
          closedAt: chain.closed_at_ns !== "0" ? new Date(Number(BigInt(chain.closed_at_ns) / 1_000_000n)) : rfq.closedAt,
          cancelledAt: chain.status === "cancelled" ? (rfq.cancelledAt ?? new Date()) : rfq.cancelledAt,
          chainSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(t.rfqs.id, rfqId));
      await audit(tx, {
        actorKind: "chain",
        orgId: rfq.buyerOrgId,
        rfqId,
        action: "rfq.status_synced",
        targetType: "rfq",
        targetId: rfqId,
        metadata: { from: rfq.status, to: chain.status },
      });
    } else {
      await tx.update(t.rfqs).set({ chainSyncedAt: new Date() }).where(eq(t.rfqs.id, rfqId));
    }

    for (const a of chain.awards) {
      const [row] = await tx
        .select()
        .from(t.awards)
        .where(and(eq(t.awards.rfqId, rfqId), eq(t.awards.round, a.round)))
        .limit(1);
      if (!row) continue;
      const matches = row.supplierAccountId === a.supplier && row.amountYocto === a.amount_yocto && row.agreementHash === a.agreement_hash;
      if (!matches) {
        await audit(tx, {
          actorKind: "system",
          orgId: rfq.buyerOrgId,
          rfqId,
          action: "chain.award_mismatch",
          targetType: "award",
          targetId: row.id,
          metadata: { round: a.round },
        });
        continue;
      }
      if (row.status !== a.status || row.chainAttempt !== a.attempt) {
        await tx
          .update(t.awards)
          .set({ status: a.status, chainAttempt: a.attempt, chainSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(t.awards.id, row.id));
        if (row.status !== a.status) {
          await audit(tx, {
            actorKind: "chain",
            orgId: rfq.buyerOrgId,
            rfqId,
            action: "award.status_synced",
            targetType: "award",
            targetId: row.id,
            metadata: { round: a.round, from: row.status, to: a.status, attempt: a.attempt },
          });
        }
      }
    }
  });
  return chain;
}
