import "server-only";
import { desc, sql } from "drizzle-orm";
import { canonicalJson } from "@veilprocure/shared";
import type { Db, Tx } from "@veilprocure/db";
import { tables } from "./db";
import { sha256Hex } from "./crypto";

const t = tables;
const GENESIS = "0".repeat(64);
/** Advisory lock id serialising appends so the hash chain has a single tail. */
const AUDIT_LOCK = 0x7e11_a0d1;

export interface AuditInput {
  actorKind: "user" | "system" | "chain";
  actorUserId?: string | null;
  actorAccountId?: string | null;
  orgId?: string | null;
  rfqId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  txHash?: string | null;
  /** Must already be redacted: never quote text, prices, tokens, secrets or signed URLs. */
  metadata?: Record<string, string | number | boolean | null>;
}

function eventBody(e: AuditInput, occurredAt: Date) {
  return {
    occurredAt: occurredAt.toISOString(),
    actorKind: e.actorKind,
    actorUserId: e.actorUserId ?? null,
    actorAccountId: e.actorAccountId ?? null,
    orgId: e.orgId ?? null,
    rfqId: e.rfqId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    txHash: e.txHash ?? null,
    metadata: e.metadata ?? {},
  };
}

export function chainHash(prevHash: string, body: ReturnType<typeof eventBody>): string {
  return sha256Hex(`${prevHash}\n${canonicalJson(body)}`);
}

/** Appends a hash-chained audit event. Call inside the same transaction as the change. */
export async function audit(tx: Db | Tx, e: AuditInput): Promise<void> {
  const run = async (inner: Tx) => {
    await inner.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK})`);
    const [last] = await inner.select({ h: t.auditEvents.eventHash }).from(t.auditEvents).orderBy(desc(t.auditEvents.id)).limit(1);
    const occurredAt = new Date();
    const body = eventBody(e, occurredAt);
    const prevHash = last?.h ?? GENESIS;
    await inner.insert(t.auditEvents).values({
      occurredAt,
      actorKind: body.actorKind,
      actorUserId: body.actorUserId,
      actorAccountId: body.actorAccountId,
      orgId: body.orgId,
      rfqId: body.rfqId,
      action: body.action,
      targetType: body.targetType,
      targetId: body.targetId,
      txHash: body.txHash,
      metadata: body.metadata,
      prevHash,
      eventHash: chainHash(prevHash, body),
    });
  };
  // On a pool this opens a transaction; inside a transaction it is a savepoint. Either way the
  // advisory lock is held until the outermost transaction ends.
  await (tx as Db).transaction(run);
}

/** Recomputes the whole chain; returns the first broken event id, if any (operator console). */
export async function verifyAuditChain(database: Db): Promise<{ ok: boolean; checked: number; brokenAt: string | null }> {
  const rows = await database.select().from(t.auditEvents).orderBy(t.auditEvents.id);
  let prev = GENESIS;
  for (const r of rows) {
    const body = {
      occurredAt: r.occurredAt.toISOString(),
      actorKind: r.actorKind as AuditInput["actorKind"],
      actorUserId: r.actorUserId,
      actorAccountId: r.actorAccountId,
      orgId: r.orgId,
      rfqId: r.rfqId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      txHash: r.txHash,
      metadata: r.metadata as Record<string, string | number | boolean | null>,
    };
    if (r.prevHash !== prev || chainHash(prev, body) !== r.eventHash) {
      return { ok: false, checked: rows.length, brokenAt: r.id.toString() };
    }
    prev = r.eventHash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}
