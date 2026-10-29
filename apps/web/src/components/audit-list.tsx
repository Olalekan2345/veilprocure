import { desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";
import { Hash } from "./ui";

const t = tables;

function label(action: string): string {
  return action.replaceAll("_", " ").replace(/\./g, " · ");
}

/** Recent hash-chained audit events for an RFQ, visible to its participants. */
export async function AuditList({ rfqId, limit = 25 }: { rfqId: string; limit?: number }) {
  const events = await db()
    .select({ e: t.auditEvents, email: t.users.email })
    .from(t.auditEvents)
    .leftJoin(t.users, eq(t.users.id, t.auditEvents.actorUserId))
    .where(eq(t.auditEvents.rfqId, rfqId))
    .orderBy(desc(t.auditEvents.id))
    .limit(limit);
  if (!events.length) return <p className="px-6 py-6 text-sm text-muted">No events yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {events.map(({ e, email }) => (
        <li key={e.id.toString()} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[170px_1fr_auto] sm:gap-4 sm:px-6">
          <time className="tabular-nums text-xs text-faint sm:text-sm" dateTime={e.occurredAt.toISOString()}>
            {e.occurredAt.toISOString().replace("T", " ").slice(0, 19)} UTC
          </time>
          <div className="min-w-0">
            <p className="font-medium capitalize text-ink">{label(e.action)}</p>
            <p className="truncate text-xs text-muted">
              {e.actorKind === "chain" ? "Chain reconciler" : e.actorKind === "system" ? "System" : (email ?? "User")}
              {e.actorAccountId ? ` · ${e.actorAccountId}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {e.txHash && e.txHash !== "recovered-without-hash" && (
              <a className="inline-flex items-center gap-1 text-verify hover:underline" href={`${env().NEAR_EXPLORER_URL}/txns/${e.txHash}`} target="_blank" rel="noreferrer">
                tx <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            <Hash value={e.eventHash} chars={6} label="Event hash" />
          </div>
        </li>
      ))}
    </ol>
  );
}
