import { desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { Callout, Card, CardHeader, Hash, PageHeader } from "@/components/ui";
import { can, requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";

const t = tables;
export const metadata = { title: "Audit trail" };

export default async function Activity() {
  const actor = await requireActorPage("/app/activity");
  const org = actor.activeOrg;
  if (!org || !can(org, "audit:view")) return <Callout tone="neutral">You need audit access in an organisation to view its trail.</Callout>;
  const events = await db()
    .select({ e: t.auditEvents, email: t.users.email })
    .from(t.auditEvents)
    .leftJoin(t.users, eq(t.users.id, t.auditEvents.actorUserId))
    .where(eq(t.auditEvents.orgId, org.orgId))
    .orderBy(desc(t.auditEvents.id))
    .limit(100);
  return (
    <>
      <PageHeader
        eyebrow={org.orgName}
        title="Audit trail"
        description="Append-only, hash-chained events for your organisation. The database refuses updates and deletes; each event commits to the previous one. Metadata is redacted: no quote content, tokens or secrets."
      />
      <Card>
        <CardHeader title="Latest 100 events" />
        {events.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">No events yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {events.map(({ e, email }) => (
              <li key={e.id.toString()} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[180px_1fr_auto] sm:gap-4 sm:px-6">
                <time className="tabular-nums text-xs text-faint sm:text-sm" dateTime={e.occurredAt.toISOString()}>
                  {e.occurredAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                </time>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{e.action}</p>
                  <p className="truncate text-xs text-muted">
                    {e.actorKind === "user" ? (email ?? "user") : e.actorKind}
                    {e.actorAccountId ? ` · ${e.actorAccountId}` : ""}
                    {Object.keys(e.metadata as object).length ? ` · ${JSON.stringify(e.metadata)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {e.txHash && e.txHash !== "recovered-without-hash" && (
                    <a href={`${env().NEAR_EXPLORER_URL}/txns/${e.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-verify hover:underline">
                      tx <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  <Hash value={e.eventHash} chars={6} label="Event hash" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
