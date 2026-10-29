import Link from "next/link";
import { PublicShell } from "@/components/public-chrome";
import { Button, ButtonLink, Callout, PageHeader } from "@/components/ui";
import { getActor } from "@/server/authz";
import { declineInviteAction } from "@/server/actions/procurement";
import { loadInvite } from "@/server/services/supplier";
import { AcceptInviteForm } from "./accept-form";

export const metadata = { title: "Invitation to quote", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await getActor();
  if (!actor) {
    return (
      <PublicShell>
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
          <PageHeader eyebrow="Invitation to quote" title="Sign in to open this invitation" description="Use the e-mail address the invitation was sent to. Details are shown only to the invited address." />
          <ButtonLink href={`/signin?next=${encodeURIComponent(`/invite/${token}`)}`} size="lg">
            Sign in to continue
          </ButtonLink>
        </div>
      </PublicShell>
    );
  }
  const inv = await loadInvite(token);
  const mismatch = inv && inv.slot.inviteEmail !== actor.email;
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {!inv || mismatch ? (
          <>
            <PageHeader eyebrow="Invitation" title="This invitation can't be opened" />
            <Callout tone="bad">
              {mismatch
                ? `You are signed in as ${actor.email}, but this invitation was sent to another address. Sign out and sign in with the invited address.`
                : "The link is not valid. It may have been mistyped or replaced by a newer invitation."}
            </Callout>
          </>
        ) : inv.state !== "valid" ? (
          <>
            <PageHeader eyebrow="Invitation" title={inv.rfq.title} />
            <Callout tone={inv.state === "accepted" ? "ok" : "neutral"}>
              {inv.state === "accepted" ? (
                <>
                  Already accepted. <Link href={`/app/bids/${inv.rfq.id}`}>Open your bid workspace</Link>.
                </>
              ) : inv.state === "revoked" ? (
                "This invitation link was revoked by the buyer (a newer link may have been issued)."
              ) : inv.state === "declined" ? (
                "You declined this invitation."
              ) : (
                "This invitation has expired or bidding has closed."
              )}
            </Callout>
          </>
        ) : (
          <>
            <PageHeader
              eyebrow={`Invitation from ${inv.buyerName}`}
              title={inv.rfq.title}
              description={`Bids close ${inv.rfq.deadlineAt?.toUTCString() ?? "—"}. Your quote is sealed until then: the buyer cannot read it before the deadline, and other suppliers can never read it.`}
            />
            <div className="space-y-4">
              <AcceptInviteForm token={token} supplierOrgs={actor.memberships.filter((m) => m.orgKind === "supplier" && ["owner", "admin"].includes(m.role)).map((m) => ({ id: m.orgId, name: m.orgName }))} />
              <form action={declineInviteAction} className="text-right">
                <input type="hidden" name="token" value={token} />
                <Button type="submit" variant="ghost" size="sm">
                  Decline invitation
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
