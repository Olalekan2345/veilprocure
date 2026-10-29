import { desc, eq, inArray, or } from "drizzle-orm";
import { ArrowLeftRight, ExternalLink } from "lucide-react";
import { formatNear } from "@veilprocure/shared";
import { Badge, Callout, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";

const t = tables;
export const metadata = { title: "Transactions" };

/** Chain transactions involving the active organisation, each verified against RPC before recording. */
export default async function Transactions() {
  const actor = await requireActorPage("/app/transactions");
  const org = actor.activeOrg;
  if (!org) return <Callout tone="neutral">Create an organisation first.</Callout>;
  const rfqIds =
    org.orgKind === "buyer"
      ? (await db().select({ id: t.rfqs.id }).from(t.rfqs).where(eq(t.rfqs.buyerOrgId, org.orgId))).map((r) => r.id)
      : (await db().select({ id: t.rfqSuppliers.rfqId }).from(t.rfqSuppliers).where(eq(t.rfqSuppliers.supplierOrgId, org.orgId))).map((r) => r.id);
  const intents = rfqIds.length
    ? await db()
        .select({ i: t.txIntents, title: t.rfqs.title })
        .from(t.txIntents)
        .innerJoin(t.rfqs, eq(t.rfqs.id, t.txIntents.rfqId))
        .where(or(eq(t.txIntents.orgId, org.orgId), org.orgKind === "buyer" ? inArray(t.txIntents.rfqId, rfqIds) : eq(t.txIntents.orgId, org.orgId)))
        .orderBy(desc(t.txIntents.createdAt))
        .limit(100)
    : [];
  const shown = intents.filter((x) => x.i.txHash || x.i.status === "failed");
  const explorer = env().NEAR_EXPLORER_URL;
  return (
    <>
      <PageHeader eyebrow={org.orgName} title="Transactions" description="Wallet-signed NEAR testnet transactions for your organisation's requests. A row is marked confirmed only after the server verified the finalised transaction on chain." />
      <Card>
        {shown.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight className="size-5" />} title="No transactions yet">
            Publishing, bidding, awarding and paying each create a transaction signed by your wallet. They will be listed here with explorer links.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Request</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Signer</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Deposit</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map(({ i, title }) => (
                  <tr key={i.id}>
                    <td className="px-6 py-3 font-medium text-ink">{i.methodName}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted">{title}</td>
                    <td className="hash px-4 py-3 text-muted">{i.signerId}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{BigInt(i.depositYocto) <= 1n ? `${i.depositYocto} yocto` : formatNear(BigInt(i.depositYocto), 6)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={i.status === "confirmed" ? "ok" : i.status === "failed" ? "bad" : "warn"}>{i.status === "submitted" ? "pending verification" : i.status}</Badge>
                    </td>
                    <td className="px-6 py-3">
                      {i.txHash ? (
                        <a href={`${explorer}/txns/${i.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-verify hover:underline">
                          {i.txHash.slice(0, 10)}… <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-xs text-muted">{i.error?.slice(0, 60) ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
