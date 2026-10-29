import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { can, permissionsFor, requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { InviteMemberForm, RoleSelect } from "./team-forms";

const t = tables;
export const metadata = { title: "Team" };

export default async function Team() {
  const actor = await requireActorPage("/app/team");
  const org = actor.activeOrg;
  if (!org) return <Callout tone="neutral">Create an organisation first.</Callout>;
  const members = await db()
    .select({ id: t.memberships.id, role: t.memberships.role, email: t.users.email, name: t.users.displayName, joined: t.memberships.createdAt })
    .from(t.memberships)
    .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
    .where(eq(t.memberships.orgId, org.orgId))
    .orderBy(t.memberships.createdAt);
  const invites = await db()
    .select()
    .from(t.memberInvites)
    .where(and(eq(t.memberInvites.orgId, org.orgId), isNull(t.memberInvites.acceptedAt), isNull(t.memberInvites.revokedAt), gt(t.memberInvites.expiresAt, new Date())))
    .orderBy(desc(t.memberInvites.createdAt));
  const manage = can(org, "team:manage");
  return (
    <>
      <PageHeader eyebrow={org.orgName} title="Team" description="Roles are enforced on the server for every action. Moving funds additionally requires the escrow-signing permission and the specific wallet bound on chain." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={`Members (${members.length})`} />
          <ul className="divide-y divide-line">
            {members.map((mm) => (
              <li key={mm.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{mm.name ?? mm.email}</p>
                  <p className="truncate text-xs text-muted">{mm.email}</p>
                </div>
                {manage && mm.email !== actor.email ? <RoleSelect membershipId={mm.id} role={mm.role} /> : <Badge>{mm.role}</Badge>}
              </li>
            ))}
          </ul>
          {invites.length > 0 && (
            <div className="border-t border-line px-5 py-4 sm:px-6">
              <p className="mb-2 text-sm font-semibold text-ink">Pending invitations</p>
              <ul className="space-y-1 text-sm text-muted">
                {invites.map((i) => (
                  <li key={i.id}>
                    {i.email} · {i.role} · expires {i.expiresAt.toISOString().slice(0, 10)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          {manage && (
            <Card>
              <CardHeader title="Invite a teammate" description="They sign in with the invited address to join." />
              <div className="px-5 py-5 sm:px-6">
                <InviteMemberForm />
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="What each role can do" description={`For a ${org.orgKind} organisation.`} />
            <ul className="divide-y divide-line text-sm">
              {(["owner", "admin", "member", "viewer"] as const).map((r) => (
                <li key={r} className="px-5 py-3 sm:px-6">
                  <p className="font-medium capitalize text-ink">{r}</p>
                  <p className="text-xs leading-relaxed text-muted">{permissionsFor(org.orgKind, r).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
