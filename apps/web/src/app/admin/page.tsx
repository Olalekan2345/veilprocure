import { count, desc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-chrome";
import { Badge, Callout, Card, CardHeader, KeyValue, PageHeader, Stat } from "@/components/ui";
import { verifyAuditChain } from "@/server/audit";
import { getActor } from "@/server/authz";
import { db, tables } from "@/server/db";
import { contractConfigured, env } from "@/server/env";
import { networkStatus, viewFunction } from "@/server/near";

const t = tables;
export const metadata = { title: "Operator console", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Restricted operating view: service health, delivery errors, audit chain integrity and support
 * tickets. It deliberately has no access to quote contents and no ability to change quotes,
 * awards or escrow — there is no such capability anywhere in the stack.
 */
export default async function Admin() {
  const actor = await getActor();
  if (!actor?.isPlatformOperator) notFound();
  const [chain, escrow] = await Promise.all([
    networkStatus().catch(() => null),
    contractConfigured()
      ? viewFunction<{ rfq_count: string; escrow_liabilities_yocto: string; account_balance_yocto: string; storage_locked_yocto: string }>(env().NEAR_CONTRACT_ID, "get_escrow_summary").catch(() => null)
      : Promise.resolve(null),
  ]);
  const audit = await verifyAuditChain(db());
  const [users] = await db().select({ n: count() }).from(t.users);
  const failedEmails = await db().select().from(t.emailOutbox).where(inArray(t.emailOutbox.status, ["failed", "not_configured"])).orderBy(desc(t.emailOutbox.createdAt)).limit(10);
  const stuck = await db().select().from(t.txIntents).where(eq(t.txIntents.status, "submitted")).limit(20);
  const jobs = await db().select().from(t.evaluationJobs).where(inArray(t.evaluationJobs.status, ["failed", "blocked"])).orderBy(desc(t.evaluationJobs.createdAt)).limit(10);
  const tickets = await db().select().from(t.supportTickets).orderBy(desc(t.supportTickets.createdAt)).limit(20);
  const invariantOk = escrow ? BigInt(escrow.account_balance_yocto) >= BigInt(escrow.escrow_liabilities_yocto) + BigInt(escrow.storage_locked_yocto) : null;
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <PageHeader eyebrow="Platform operator" title="Operator console" description="Health and support only. Operators cannot read quotes here, and no operator capability exists to alter awards or move escrow." />
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Users" value={users?.n ?? 0} />
            <Stat label="Audit chain" value={audit.ok ? "intact" : "BROKEN"} hint={`${audit.checked} events checked${audit.brokenAt ? `, first break #${audit.brokenAt}` : ""}`} />
            <Stat label="Testnet RPC" value={chain ? "reachable" : "unreachable"} hint={chain ? `block ${chain.latestBlockHeight}` : undefined} />
            <Stat label="Tx awaiting check" value={stuck.length} />
          </div>
          <Card>
            <CardHeader title="Escrow contract invariant" description="account balance ≥ escrow liabilities + storage locked" />
            <div className="px-5 py-4 sm:px-6">
              {escrow ? (
                <KeyValue
                  items={[
                    ["Contract", env().NEAR_CONTRACT_ID],
                    ["RFQs", escrow.rfq_count],
                    ["Liabilities (yocto)", escrow.escrow_liabilities_yocto],
                    ["Balance (yocto)", escrow.account_balance_yocto],
                    ["Storage locked (yocto)", escrow.storage_locked_yocto],
                    ["Invariant", <Badge key="i" tone={invariantOk ? "ok" : "bad"}>{invariantOk ? "holds" : "VIOLATED"}</Badge>],
                  ]}
                />
              ) : (
                <Callout tone="warn">{contractConfigured() ? "Contract view unavailable." : "No contract configured."}</Callout>
              )}
            </div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Undelivered e-mail" />
              <ul className="divide-y divide-line text-sm">
                {failedEmails.length === 0 && <li className="px-6 py-4 text-muted">None.</li>}
                {failedEmails.map((e) => (
                  <li key={e.id} className="px-5 py-2.5 sm:px-6">
                    {e.template} → {e.toEmail.replace(/(^.).*(@.*$)/, "$1…$2")} · <Badge tone={e.status === "failed" ? "bad" : "warn"}>{e.status}</Badge> {e.lastError ?? ""}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Evaluation jobs needing attention" />
              <ul className="divide-y divide-line text-sm">
                {jobs.length === 0 && <li className="px-6 py-4 text-muted">None.</li>}
                {jobs.map((j) => (
                  <li key={j.id} className="px-5 py-2.5 sm:px-6">
                    <Badge tone="warn">{j.status}</Badge> {j.errorCode}: {j.errorMessage}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card>
            <CardHeader title="Support tickets" />
            <ul className="divide-y divide-line text-sm">
              {tickets.length === 0 && <li className="px-6 py-4 text-muted">No tickets.</li>}
              {tickets.map((x) => (
                <li key={x.id} className="px-5 py-3 sm:px-6">
                  <p className="font-medium text-ink">{x.subject}</p>
                  <p className="text-xs text-muted">
                    {x.contactEmail} · {x.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {x.status}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-ink-3">{x.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PublicShell>
  );
}
