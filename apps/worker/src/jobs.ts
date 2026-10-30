/**
 * One worker cycle, shared by the long-running worker (src/index.ts) and the hosted scheduled and
 * background functions: chain reconciliation (chain is the source of truth), intent expiry and
 * confidential AI evaluation jobs. Runs as the BYPASSRLS worker role; holds no NEAR keys and never
 * signs transactions.
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { tables, type Db } from "@veilprocure/db";
import { runAiJob } from "./evaluate";

const t = tables;

export interface WorkerConfig {
  workerId: string;
  databaseUrl: string;
  rpcUrl: string;
  contractId: string;
  kek: { keyId: string; key: Buffer };
  nearai: { apiKey?: string; model?: string; baseUrl?: string };
}

/** Reads the worker configuration; throws listing every missing variable. */
export function workerConfigFromEnv(workerId: string): WorkerConfig {
  const required = ["WORKER_DATABASE_URL", "VEIL_MASTER_KEY", "VEIL_KEY_ID", "NEAR_RPC_URL"] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`worker configuration invalid: missing ${missing.join(", ")} (see .env.example)`);
  return {
    workerId,
    databaseUrl: process.env.WORKER_DATABASE_URL!,
    rpcUrl: process.env.NEAR_RPC_URL!,
    contractId: process.env.NEAR_CONTRACT_ID ?? "",
    kek: { keyId: process.env.VEIL_KEY_ID!, key: Buffer.from(process.env.VEIL_MASTER_KEY!, "base64") },
    nearai: { apiKey: process.env.NEARAI_API_KEY, model: process.env.NEARAI_MODEL, baseUrl: process.env.NEARAI_BASE_URL },
  };
}

async function view<T>(cfg: WorkerConfig, method: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(cfg.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "w", method: "query", params: { request_type: "call_function", finality: "final", account_id: cfg.contractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { result?: { result: number[] }; error?: unknown };
  if (!body.result) throw new Error("RPC view failed");
  return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
}

interface ChainRfq {
  status: string;
  policy_hash: string;
  buyer: string;
  bids: { supplier: string; commitment: string; version: number; withdrawn: boolean; committed_at_ns: string }[];
  awards: { round: number; status: string; attempt: number; supplier: string; amount_yocto: string; agreement_hash: string }[];
}

/** Idempotent projection of chain state. Only moves records to what the chain says. */
export async function reconcile(db: Db, cfg: WorkerConfig): Promise<number> {
  if (!cfg.contractId) return 0;
  const rfqs = await db
    .select()
    .from(t.rfqs)
    .where(and(eq(t.rfqs.contractId, cfg.contractId), inArray(t.rfqs.status, ["open", "closed", "awarded"])));
  let changes = 0;
  for (const rfq of rfqs) {
    const chain = await view<ChainRfq | null>(cfg, "get_rfq", { rfq_id: rfq.onchainId!.toString() }).catch(() => null);
    if (!chain || chain.policy_hash !== rfq.policyHash || chain.buyer !== rfq.buyerAccountId) continue;
    await db.transaction(async (tx) => {
      if (chain.status !== rfq.status) {
        await tx.update(t.rfqs).set({ status: chain.status as typeof rfq.status, chainSyncedAt: new Date(), updatedAt: new Date() }).where(eq(t.rfqs.id, rfq.id));
        changes++;
      }
      for (const a of chain.awards) {
        const res = await tx
          .update(t.awards)
          .set({ status: a.status as never, chainAttempt: a.attempt, chainSyncedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(t.awards.rfqId, rfq.id),
              eq(t.awards.round, a.round),
              eq(t.awards.supplierAccountId, a.supplier),
              eq(t.awards.amountYocto, a.amount_yocto),
              eq(t.awards.agreementHash, a.agreement_hash),
              or(sql`${t.awards.status}::text <> ${a.status}`, sql`${t.awards.chainAttempt} <> ${a.attempt}`),
            ),
          )
          .returning({ id: t.awards.id });
        changes += res.length;
      }
      // Bids committed on chain whose app-side confirmation never arrived (e.g. tab closed).
      for (const b of chain.bids) {
        const [rev] = await tx
          .select()
          .from(t.quoteRevisions)
          .where(and(eq(t.quoteRevisions.rfqId, rfq.id), eq(t.quoteRevisions.supplierAccountId, b.supplier), eq(t.quoteRevisions.commitmentHex, b.commitment), eq(t.quoteRevisions.version, b.version)))
          .limit(1);
        if (!rev || rev.status === "committed") continue;
        await tx.update(t.quoteRevisions).set({ status: "superseded" }).where(and(eq(t.quoteRevisions.quoteId, rev.quoteId), eq(t.quoteRevisions.status, "committed")));
        await tx.update(t.quoteRevisions).set({ status: "committed", chainCommittedAtNs: b.committed_at_ns }).where(eq(t.quoteRevisions.id, rev.id));
        await tx.update(t.quotes).set({ status: b.withdrawn ? "withdrawn" : "committed", committedRevisionId: rev.id, updatedAt: new Date() }).where(eq(t.quotes.id, rev.quoteId));
        changes++;
      }
    });
  }
  return changes;
}

export async function expireIntents(db: Db): Promise<void> {
  await db.update(t.txIntents).set({ status: "expired" }).where(and(eq(t.txIntents.status, "prepared"), lt(t.txIntents.expiresAt, new Date())));
}

/** Claims one queued AI job (SKIP LOCKED) and runs it. */
export async function runOneJob(db: Db, cfg: WorkerConfig): Promise<boolean> {
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`select id from evaluation_jobs where kind = 'ai' and status = 'queued' and run_after <= now() order by created_at limit 1 for update skip locked`,
    );
    const id = rows[0]?.id;
    if (!id) return null;
    const [job] = await tx
      .update(t.evaluationJobs)
      .set({ status: "running", lockedAt: new Date(), lockedBy: cfg.workerId, attempts: sql`${t.evaluationJobs.attempts} + 1` })
      .where(and(eq(t.evaluationJobs.id, id), isNull(t.evaluationJobs.finishedAt)))
      .returning();
    return job ?? null;
  });
  if (!claimed) return false;
  try {
    await runAiJob(db, claimed, { kek: cfg.kek, ...cfg.nearai });
  } catch (err) {
    await db
      .update(t.evaluationJobs)
      .set({ status: "failed", errorCode: "WORKER_ERROR", errorMessage: err instanceof Error ? err.message.slice(0, 300) : "error", finishedAt: new Date() })
      .where(eq(t.evaluationJobs.id, claimed.id));
  }
  return true;
}

/** Expires stale intents and projects chain state; returns the number of records changed. */
export async function syncChain(db: Db, cfg: WorkerConfig): Promise<number> {
  await expireIntents(db);
  const changed = await reconcile(db, cfg).catch((e: unknown) => {
    console.error("[worker] reconcile error:", e instanceof Error ? e.message : e);
    return 0;
  });
  if (changed) console.log(`[worker] reconciled ${changed} chain change(s)`);
  return changed;
}

export async function hasQueuedAiJobs(db: Db): Promise<boolean> {
  const rows = await db.execute<{ id: string }>(sql`select id from evaluation_jobs where kind = 'ai' and status = 'queued' and run_after <= now() limit 1`);
  return rows.length > 0;
}

/** Runs queued AI jobs one at a time until the queue is empty or `deadline` (epoch ms) passes. */
export async function drainAiJobs(db: Db, cfg: WorkerConfig, deadline = Infinity): Promise<number> {
  let ran = 0;
  while (Date.now() < deadline && (await runOneJob(db, cfg))) ran++;
  return ran;
}

export async function tick(db: Db, cfg: WorkerConfig): Promise<void> {
  await syncChain(db, cfg);
  await drainAiJobs(db, cfg);
}
