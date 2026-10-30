import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowRight, FileText, Gavel, Inbox, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatNear, type AwardStatus, type RfqStatus } from "@veilprocure/shared";
import { AwardStatusBadge, RfqStatusBadge } from "@/components/status";
import { ButtonLink, Callout, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { listPendingInvitesForEmail, listSupplierRfqs } from "@/server/services/supplier";

const t = tables;
const HOLDING: AwardStatus[] = ["funded", "accepted", "delivered", "release_pending", "release_failed", "disputed", "refund_pending", "refund_failed"];

export const metadata = { title: "Overview" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const actor = await requireActorPage("/app");
  const { notice } = await searchParams;
  if (!actor.activeOrg) redirect("/app/onboarding");
  const org = actor.activeOrg;
  const invites = await listPendingInvitesForEmail(actor.email);

  const notices: Record<string, string> = {
    "invite-invalid": "That invitation is invalid, expired, or addressed to another e-mail.",
    "invite-declined": "You declined the invitation. The buyer has been informed through the audit trail.",
  };

  const inviteBanner =
    invites.length > 0 ? (
      <Callout tone="gold" title={`You have ${invites.length} pending invitation${invites.length > 1 ? "s" : ""} to quote`}>
        Open the invitation link the buyer sent you to accept it into a supplier organisation.{" "}
        {invites.map((i) => `"${i.rfqTitle}" from ${i.buyerName}`).join(", ")}.
      </Callout>
    ) : null;

  if (org.orgKind === "buyer") {
    const rfqs = await db().select().from(t.rfqs).where(eq(t.rfqs.buyerOrgId, org.orgId)).orderBy(desc(t.rfqs.updatedAt));
    const ids = rfqs.map((r) => r.id);
    const awards = ids.length ? await db().select().from(t.awards).where(inArray(t.awards.rfqId, ids)) : [];
    const by = (s: RfqStatus) => rfqs.filter((r) => r.status === s).length;
    const escrow = awards.filter((a) => HOLDING.includes(a.status as AwardStatus)).reduce((n, a) => n + BigInt(a.amountYocto), 0n);
    const paid = awards.filter((a) => a.status === "paid").reduce((n, a) => n + BigInt(a.amountYocto), 0n);
    const attention = [
      ...rfqs.filter((r) => r.status === "publishing").map((r) => ({ r, why: "Waiting for your publication signature" })),
      ...rfqs.filter((r) => r.status === "open" && r.deadlineAt && r.deadlineAt.getTime() <= Date.now()).map((r) => ({ r, why: "Deadline passed: close bidding on chain" })),
      ...rfqs.filter((r) => r.status === "closed").map((r) => ({ r, why: "Bids are open for review and award" })),
      ...awards
        .filter((a) => a.status === "awarded" || a.status === "delivered" || a.status === "release_failed" || a.status === "refund_failed")
        .map((a) => ({ r: rfqs.find((x) => x.id === a.rfqId)!, why: a.status === "awarded" ? "Fund the escrow" : a.status === "delivered" ? "Review the delivery and release payment" : "A transfer failed: retry it" })),
    ];
    return (
      <>
        <PageHeader
          eyebrow={org.orgName}
          title="Overview"
          description="Every figure below comes from your organisation's records and the last verified chain state."
          actions={
            <ButtonLink href="/app/rfqs/new">
              New request <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          }
        />
        <div className="space-y-6">
          {notice && notices[notice] && <Callout tone="neutral">{notices[notice]}</Callout>}
          {inviteBanner}
          {!actor.wallet && (
            <Callout tone="warn" title="Connect a NEAR testnet wallet before publishing" icon={<Wallet className="size-4" />}>
              You can draft requests now. Publishing, awarding and paying are signed by your own wallet. <Link href="/app/wallet">Connect a wallet</Link>.
            </Callout>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Drafts" value={by("draft") + by("publishing")} />
            <Stat label="Open for bids" value={by("open")} />
            <Stat label="Held in escrow" value={escrow === 0n ? "0 NEAR" : formatNear(escrow)} hint="testnet NEAR" />
            <Stat label="Paid out" value={paid === 0n ? "0 NEAR" : formatNear(paid)} hint="testnet NEAR" />
          </div>
          <Card>
            <CardHeader title="Needs your attention" description="Next steps on your requests." />
            {attention.length === 0 ? (
              <EmptyState icon={<FileText className="size-5" />} title={rfqs.length ? "You're all caught up" : "Create your first request"} action={!rfqs.length && <ButtonLink href="/app/rfqs/new">Start a request</ButtonLink>}>
                {rfqs.length
                  ? "Nothing is waiting on you right now."
                  : "Describe a fixed-scope service, set the rules suppliers will be judged by, and invite suppliers to quote under seal."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {attention.map(({ r, why }, i) => (
                  <li key={`${r.id}-${i}`}>
                    <Link href={`/app/rfqs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-sunken/50 sm:px-6">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{r.title}</span>
                        <span className="text-sm text-muted">{why}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {rfqs.length > 0 && (
            <Card>
              <CardHeader title="Recent requests" action={<ButtonLink href="/app/rfqs" variant="ghost" size="sm">All requests</ButtonLink>} />
              <ul className="divide-y divide-line">
                {rfqs.slice(0, 5).map((r) => {
                  const a = awards.filter((x) => x.rfqId === r.id).sort((x, y) => y.round - x.round)[0];
                  return (
                    <li key={r.id}>
                      <Link href={`/app/rfqs/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-sunken/50 sm:px-6">
                        <span className="min-w-0 font-medium text-ink">{r.title}</span>
                        <span className="flex gap-2">
                          <RfqStatusBadge status={r.status as RfqStatus} />
                          {a && <AwardStatusBadge status={a.status as AwardStatus} />}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </>
    );
  }

  // Supplier overview
  const bids = await listSupplierRfqs(actor);
  const rfqIds = bids.map((b) => b.rfq.id);
  const awards = rfqIds.length
    ? await db().select().from(t.awards).where(and(inArray(t.awards.rfqId, rfqIds), eq(t.awards.supplierOrgId, org.orgId)))
    : [];
  const received = awards.filter((a) => a.status === "paid").reduce((n, a) => n + BigInt(a.amountYocto), 0n);
  return (
    <>
      <PageHeader eyebrow={org.orgName} title="Overview" description="Your invitations, sealed bids and awards. Buyers cannot read your quotes before their deadline." />
      <div className="space-y-6">
        {notice && notices[notice] && <Callout tone="neutral">{notices[notice]}</Callout>}
        {inviteBanner}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Active invitations" value={bids.filter((b) => b.rfq.status === "open").length} />
          <Stat label="Awards" value={awards.filter((a) => a.status !== "pending_signature").length} />
          <Stat label="In escrow for you" value={formatNear(awards.filter((a) => HOLDING.includes(a.status as AwardStatus)).reduce((n, a) => n + BigInt(a.amountYocto), 0n))} hint="testnet NEAR" />
          <Stat label="Received" value={received === 0n ? "0 NEAR" : formatNear(received)} hint="testnet NEAR" />
        </div>
        <Card>
          <CardHeader title="Invitations & bids" action={<ButtonLink href="/app/bids" variant="ghost" size="sm">Open</ButtonLink>} />
          {bids.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title="No invitations yet">
              Buyers invite suppliers by e-mail. When you accept an invitation, it appears here with its deadline and your sealed-bid status.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {bids.slice(0, 6).map((b) => (
                <li key={b.rfq.id}>
                  <Link href={`/app/bids/${b.rfq.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-sunken/50 sm:px-6">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">{b.rfq.title}</span>
                      <span className="text-sm text-muted">{b.buyerName}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <RfqStatusBadge status={b.rfq.status as RfqStatus} />
                      <Gavel className="size-4 text-faint" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
