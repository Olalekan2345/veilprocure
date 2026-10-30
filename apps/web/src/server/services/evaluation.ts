import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  bidCommitmentHex,
  buyerMaySeeQuotes,
  EVALUATION_ENGINE_VERSION,
  evaluateHardCriteria,
  scoreEligible,
  type FrozenPolicy,
  type NormalizedQuote,
  type QuoteEvaluation,
  type ScoredQuote,
} from "@veilprocure/shared";
import { triggerAiRunner } from "@veilprocure/worker/trigger";
import { audit } from "../audit";
import type { Actor } from "../authz";
import { db, tables, withActor } from "../db";
import { openJson } from "../crypto";
import { AppError } from "../errors";
import { readChainRfq, syncRfqFromChain, type ChainBid } from "../chain/sync";
import { loadBuyerRfq, readFrozenPolicy } from "./rfq";
import { filenameAad, revisionPayloadAad, revisionSaltAad } from "./supplier";

const t = tables;

export type Integrity = "verified" | "mismatch" | "not_on_chain" | "withdrawn_on_chain" | "superseded_on_chain";

export interface ComparisonRow {
  quoteId: string;
  revisionId: string;
  supplierOrgId: string;
  supplierName: string;
  supplierAccountId: string;
  version: number;
  commitment: string;
  committedAtNs: string | null;
  commitTxHash: string | null;
  integrity: Integrity;
  quote: NormalizedQuote;
  evaluation: QuoteEvaluation;
  score: ScoredQuote | null;
  rank: number | null;
  attachments: { id: string; filename: string; sha256: string; sizeBytes: number; contentType: string; scanStatus: string }[];
}

export interface Comparison {
  rfq: typeof t.rfqs.$inferSelect;
  policy: FrozenPolicy;
  policyVersion: number;
  rows: ComparisonRow[];
  /** On-chain bids with no matching sealed quote in VeilProcure (cannot be evaluated). */
  unmatchedChainBids: ChainBid[];
  chainCheckedAt: Date;
}

/**
 * Builds the post-close comparison in the buyer's RLS context. Every commitment is recomputed
 * from the decrypted payload + private salt and compared with the commitment stored on chain.
 */
export async function buildComparison(actor: Actor, rfqId: string): Promise<Comparison> {
  let rfq = await loadBuyerRfq(actor, rfqId, "rfq:view");
  if (rfq.onchainId !== null) {
    await syncRfqFromChain(rfq.id);
    rfq = await loadBuyerRfq(actor, rfqId, "rfq:view");
  }
  if (!buyerMaySeeQuotes(rfq.status)) {
    throw new AppError("FORBIDDEN", "Quotes stay sealed until bidding has closed on chain.");
  }
  const frozen = await readFrozenPolicy(rfq);
  if (!frozen) throw new AppError("PRECONDITION_FAILED", "Policy not found.");
  const chain = await readChainRfq(rfq.onchainId!);
  if (!chain) throw new AppError("CHAIN_VERIFICATION_FAILED", "RFQ not found on chain.");

  const decrypted = await withActor(db(), [rfq.buyerOrgId], async (tx) => {
    const revs = await tx
      .select({ rev: t.quoteRevisions, supplierName: t.organizations.name })
      .from(t.quoteRevisions)
      .innerJoin(t.organizations, eq(t.organizations.id, t.quoteRevisions.supplierOrgId))
      .where(and(eq(t.quoteRevisions.rfqId, rfq.id), eq(t.quoteRevisions.status, "committed")));
    const atts = revs.length
      ? await tx
          .select()
          .from(t.privateAttachments)
          .where(and(inArray(t.privateAttachments.quoteId, revs.map((r) => r.rev.quoteId)), eq(t.privateAttachments.kind, "quote"), isNull(t.privateAttachments.deletedAt)))
      : [];
    return Promise.all(
      revs.map(async ({ rev, supplierName }) => {
        const quote = await openJson<NormalizedQuote>(rev.payloadEnc, revisionPayloadAad(rev.id, rev.supplierOrgId));
        const { salt } = await openJson<{ salt: string }>(rev.saltEnc, revisionSaltAad(rev.id, rev.supplierOrgId));
        const attachments = await Promise.all(
          atts
            .filter((a) => a.quoteId === rev.quoteId && rev.attachmentDigests.includes(a.sha256))
            .map(async (a) => ({
              id: a.id,
              filename: (await openJson<{ name: string }>(a.filenameEnc, filenameAad(a.id, a.ownerOrgId))).name,
              sha256: a.sha256,
              sizeBytes: a.sizeBytes,
              contentType: a.contentType,
              scanStatus: a.scanStatus,
            })),
        );
        return { rev, supplierName, quote, salt, attachments };
      }),
    );
  });

  const matchedAccounts = new Set<string>();
  const base = decrypted.map(({ rev, supplierName, quote, salt, attachments }) => {
    const recomputed = bidCommitmentHex({
      network: "testnet",
      contractId: rfq.contractId!,
      rfqOnchainId: rfq.onchainId!,
      supplierAccountId: rev.supplierAccountId,
      version: rev.version,
      quote,
      attachmentDigests: rev.attachmentDigests,
      saltHex: salt,
    });
    const bid = chain.bids.find((b) => b.supplier === rev.supplierAccountId);
    if (bid) matchedAccounts.add(bid.supplier);
    let integrity: Integrity;
    if (!bid) integrity = "not_on_chain";
    else if (bid.withdrawn) integrity = "withdrawn_on_chain";
    else if (bid.version !== rev.version) integrity = "superseded_on_chain";
    else if (bid.commitment !== recomputed || rev.commitmentHex !== recomputed) integrity = "mismatch";
    else integrity = "verified";
    const evaluation = evaluateHardCriteria(frozen.policy, rev.quoteId, quote);
    // Integrity is itself a hard gate: an unverifiable quote is never eligible.
    if (integrity !== "verified") {
      evaluation.eligible = false;
      evaluation.results.unshift({
        criterionId: "commitment",
        label: "Matches the sealed on-chain commitment",
        outcome: "fail",
        basis: "exact_comparison",
        expected: "Recomputed hash equals the on-chain commitment",
        actual: integrity.replaceAll("_", " "),
        sourceField: "chain.bids.commitment",
      });
    } else {
      evaluation.results.unshift({
        criterionId: "commitment",
        label: "Matches the sealed on-chain commitment",
        outcome: "pass",
        basis: "exact_comparison",
        expected: "Recomputed hash equals the on-chain commitment",
        actual: `${recomputed.slice(0, 12)}…`,
        sourceField: "chain.bids.commitment",
      });
    }
    return {
      quoteId: rev.quoteId,
      revisionId: rev.id,
      supplierOrgId: rev.supplierOrgId,
      supplierName,
      supplierAccountId: rev.supplierAccountId,
      version: rev.version,
      commitment: rev.commitmentHex,
      committedAtNs: bid?.committed_at_ns ?? rev.chainCommittedAtNs,
      commitTxHash: rev.commitTxHash,
      integrity,
      quote,
      evaluation,
      attachments,
    };
  });

  const scores = scoreEligible(
    frozen.policy,
    base.filter((r) => r.evaluation.eligible).map((r) => ({ quoteRef: r.quoteId, quote: r.quote })),
  );
  const rows: ComparisonRow[] = base
    .map((r) => {
      const idx = scores.findIndex((s) => s.quoteRef === r.quoteId);
      return { ...r, score: idx >= 0 ? scores[idx]! : null, rank: idx >= 0 ? idx + 1 : null };
    })
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.supplierName.localeCompare(b.supplierName));

  return {
    rfq,
    policy: frozen.policy,
    policyVersion: frozen.version,
    rows,
    unmatchedChainBids: chain.bids.filter((b) => !matchedAccounts.has(b.supplier) && !b.withdrawn),
    chainCheckedAt: new Date(),
  };
}

/** Persists a deterministic evaluation run (criterion results) for the audit trail. */
export async function recordDeterministicEvaluation(actor: Actor, rfqId: string): Promise<string> {
  const cmp = await buildComparison(actor, rfqId);
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:evaluate");
  return db().transaction(async (tx) => {
    const [job] = await tx
      .insert(t.evaluationJobs)
      .values({ rfqId, kind: "deterministic", status: "succeeded", requestedBy: actor.id, policyVersion: cmp.policyVersion, modelId: EVALUATION_ENGINE_VERSION, finishedAt: new Date() })
      .returning({ id: t.evaluationJobs.id });
    for (const row of cmp.rows) {
      for (const r of row.evaluation.results) {
        await tx.insert(t.evaluationCriterionResults).values({
          evaluationJobId: job!.id,
          quoteId: row.quoteId,
          criterionId: r.criterionId,
          label: r.label,
          outcome: r.outcome,
          basis: r.basis,
          expected: r.expected,
          actual: r.actual,
          sourceField: r.sourceField,
        });
      }
    }
    await audit(tx, {
      actorKind: "user",
      actorUserId: actor.id,
      orgId: rfq.buyerOrgId,
      rfqId,
      action: "evaluation.deterministic_recorded",
      targetType: "evaluation_job",
      targetId: job!.id,
      metadata: { quotes: cmp.rows.length, eligible: cmp.rows.filter((r) => r.evaluation.eligible).length, engine: EVALUATION_ENGINE_VERSION },
    });
    return job!.id;
  });
}

export async function requestAiEvaluation(actor: Actor, rfqId: string): Promise<string> {
  const rfq = await loadBuyerRfq(actor, rfqId, "rfq:evaluate");
  if (!buyerMaySeeQuotes(rfq.status)) throw new AppError("FORBIDDEN", "AI evaluation runs only after bidding has closed.");
  const frozen = await readFrozenPolicy(rfq);
  const [open] = await db()
    .select({ id: t.evaluationJobs.id })
    .from(t.evaluationJobs)
    .where(and(eq(t.evaluationJobs.rfqId, rfqId), eq(t.evaluationJobs.kind, "ai"), inArray(t.evaluationJobs.status, ["queued", "running"])))
    .limit(1);
  if (open) return open.id;
  const [job] = await db()
    .insert(t.evaluationJobs)
    .values({ rfqId, kind: "ai", status: "queued", requestedBy: actor.id, policyVersion: frozen?.version ?? 1 })
    .returning({ id: t.evaluationJobs.id });
  await audit(db(), { actorKind: "user", actorUserId: actor.id, orgId: rfq.buyerOrgId, rfqId, action: "evaluation.ai_requested", targetType: "evaluation_job", targetId: job!.id });
  await triggerAiRunner();
  return job!.id;
}

export async function latestAiJob(rfqId: string) {
  const [job] = await db().select().from(t.evaluationJobs).where(and(eq(t.evaluationJobs.rfqId, rfqId), eq(t.evaluationJobs.kind, "ai"))).orderBy(desc(t.evaluationJobs.createdAt)).limit(1);
  if (!job) return null;
  const [evidence] = await db().select().from(t.attestationEvidence).where(eq(t.attestationEvidence.evaluationJobId, job.id)).limit(1);
  return { job, evidence: evidence ?? null };
}
