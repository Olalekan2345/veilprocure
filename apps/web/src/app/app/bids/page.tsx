import { Inbox } from "lucide-react";
import Link from "next/link";
import type { RfqStatus } from "@veilprocure/shared";
import { RfqStatusBadge } from "@/components/status";
import { Callout, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { listPendingInvitesForEmail, listSupplierRfqs } from "@/server/services/supplier";

export const metadata = { title: "Invitations & bids" };

export default async function Bids() {
  const actor = await requireActorPage("/app/bids");
  const [rows, pending] = await Promise.all([listSupplierRfqs(actor), listPendingInvitesForEmail(actor.email)]);
  return (
    <>
      <PageHeader eyebrow="Supplier workspace" title="Invitations & bids" description="Requests you accepted. Your quote is private to your organisation; the buyer can open it only after the deadline, and other suppliers never can." />
      {pending.length > 0 && (
        <div className="mb-6">
          <Callout tone="gold" title="Waiting for you">
            {pending.length} invitation{pending.length > 1 ? "s" : ""} sent to {actor.email} not yet accepted. Open the link in the invitation e-mail to accept.
          </Callout>
        </div>
      )}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="No accepted invitations">
            Buyers invite suppliers by e-mail. Accepting an invitation links it to one of your supplier organisations.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ rfq, buyerName }) => (
              <li key={rfq.id}>
                <Link href={`/app/bids/${rfq.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-sunken/50 sm:px-6">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{rfq.title}</span>
                    <span className="text-sm text-muted">
                      {buyerName} · closes {rfq.deadlineAt?.toISOString().replace("T", " ").slice(0, 16)} UTC
                    </span>
                  </span>
                  <RfqStatusBadge status={rfq.status as RfqStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
