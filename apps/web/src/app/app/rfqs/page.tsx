import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { CATEGORIES, type RfqStatus } from "@veilprocure/shared";
import { RfqStatusBadge } from "@/components/status";
import { ButtonLink, Callout, Card, EmptyState, PageHeader } from "@/components/ui";
import { can, requireActorPage } from "@/server/authz";
import { listBuyerRfqs } from "@/server/services/rfq";

export const metadata = { title: "Requests" };

function when(d: Date | null) {
  return d ? d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "Not set";
}

export default async function RfqList() {
  const actor = await requireActorPage("/app/rfqs");
  const org = actor.activeOrg;
  if (!org || org.orgKind !== "buyer") {
    return <Callout tone="neutral">Requests belong to buyer organisations. Switch to a buyer organisation, or create one from onboarding.</Callout>;
  }
  const rfqs = await listBuyerRfqs(org.orgId);
  const canCreate = can(org, "rfq:edit");
  return (
    <>
      <PageHeader
        eyebrow={org.orgName}
        title="Requests"
        description="Drafts stay editable. Once published, the policy hash is on NEAR testnet and the criteria are frozen."
        actions={canCreate && <ButtonLink href="/app/rfqs/new"><Plus className="size-4" aria-hidden /> New request</ButtonLink>}
      />
      <Card>
        {rfqs.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No requests yet" action={canCreate && <ButtonLink href="/app/rfqs/new">Create a request</ButtonLink>}>
            A request describes one fixed-scope service, the hard requirements every quote must meet, and how compliant quotes are scored.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Request</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Bid deadline</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rfqs.map((r) => (
                  <tr key={r.id} className="hover:bg-sunken/40">
                    <td className="px-6 py-3.5">
                      <Link href={`/app/rfqs/${r.id}`} className="font-medium text-ink hover:underline">
                        {r.title}
                      </Link>
                      {r.onchainId !== null && <span className="ml-2 text-xs text-faint">#{r.onchainId.toString()} on chain</span>}
                    </td>
                    <td className="px-4 py-3.5 text-muted">{CATEGORIES[r.category as keyof typeof CATEGORIES] ?? r.category}</td>
                    <td className="px-4 py-3.5 tabular-nums text-muted">{when(r.deadlineAt)}</td>
                    <td className="px-6 py-3.5">
                      <RfqStatusBadge status={r.status as RfqStatus} />
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
