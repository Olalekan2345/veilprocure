import { and, eq, gt, isNull } from "drizzle-orm";
import { PublicShell } from "@/components/public-chrome";
import { Button, ButtonLink, Callout, PageHeader } from "@/components/ui";
import { acceptMemberInvite } from "@/server/actions/account";
import { getActor } from "@/server/authz";
import { sha256Hex } from "@/server/crypto";
import { db, tables } from "@/server/db";

const t = tables;
export const metadata = { title: "Join organisation", robots: { index: false } };

export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await getActor();
  const [inv] = await db()
    .select({ inv: t.memberInvites, org: t.organizations.name })
    .from(t.memberInvites)
    .innerJoin(t.organizations, eq(t.organizations.id, t.memberInvites.orgId))
    .where(and(eq(t.memberInvites.tokenHash, sha256Hex(token)), isNull(t.memberInvites.acceptedAt), isNull(t.memberInvites.revokedAt), gt(t.memberInvites.expiresAt, new Date())))
    .limit(1);
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        {!actor ? (
          <>
            <PageHeader eyebrow="Team invitation" title="Sign in to join" description="Use the e-mail address the invitation was sent to." />
            <ButtonLink href={`/signin?next=${encodeURIComponent(`/join/${token}`)}`} size="lg">
              Sign in
            </ButtonLink>
          </>
        ) : !inv || inv.inv.email !== actor.email ? (
          <Callout tone="bad">This invitation is invalid, expired, or addressed to a different e-mail than {actor.email}.</Callout>
        ) : (
          <>
            <PageHeader eyebrow="Team invitation" title={`Join ${inv.org}`} description={`You will join as ${inv.inv.role}.`} />
            <form action={acceptMemberInvite}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" size="lg">
                Accept and join
              </Button>
            </form>
          </>
        )}
      </div>
    </PublicShell>
  );
}
