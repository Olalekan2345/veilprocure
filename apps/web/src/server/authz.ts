import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, tables } from "./db";
import { AppError } from "./errors";
import { getSession, type SessionUser } from "./session";

const t = tables;

export type Role = "owner" | "admin" | "member" | "viewer";
export type OrgKind = "buyer" | "supplier";

/**
 * Authorization is modelled as permissions, not UI labels. Every server action and route handler
 * checks one of these against the caller's membership in the *server-resolved* organisation —
 * client-supplied organisation ids are never trusted.
 */
export type Permission =
  | "org:view"
  | "org:manage"
  | "team:manage"
  | "audit:view"
  | "rfq:view"
  | "rfq:edit"
  | "rfq:publish"
  | "rfq:invite"
  | "rfq:evaluate"
  | "rfq:award"
  | "escrow:sign"
  | "quote:view"
  | "quote:edit"
  | "quote:submit"
  | "award:respond"
  | "delivery:submit";

const BUYER: Record<Role, Permission[]> = {
  owner: ["org:view", "org:manage", "team:manage", "audit:view", "rfq:view", "rfq:edit", "rfq:publish", "rfq:invite", "rfq:evaluate", "rfq:award", "escrow:sign"],
  admin: ["org:view", "team:manage", "audit:view", "rfq:view", "rfq:edit", "rfq:publish", "rfq:invite", "rfq:evaluate", "rfq:award", "escrow:sign"],
  member: ["org:view", "audit:view", "rfq:view", "rfq:edit", "rfq:invite", "rfq:evaluate"],
  viewer: ["org:view", "rfq:view"],
};

const SUPPLIER: Record<Role, Permission[]> = {
  owner: ["org:view", "org:manage", "team:manage", "audit:view", "quote:view", "quote:edit", "quote:submit", "award:respond", "delivery:submit", "escrow:sign"],
  admin: ["org:view", "team:manage", "audit:view", "quote:view", "quote:edit", "quote:submit", "award:respond", "delivery:submit", "escrow:sign"],
  member: ["org:view", "audit:view", "quote:view", "quote:edit"],
  viewer: ["org:view", "quote:view"],
};

export function permissionsFor(kind: OrgKind, role: Role): readonly Permission[] {
  return (kind === "buyer" ? BUYER : SUPPLIER)[role];
}

export interface Membership {
  orgId: string;
  orgName: string;
  orgKind: OrgKind;
  role: Role;
}

export interface Actor extends SessionUser {
  sessionTokenHash: string;
  memberships: Membership[];
  activeOrg: Membership | null;
  wallet: { accountId: string; network: string } | null;
}

export function can(m: Membership | null, perm: Permission): boolean {
  return m !== null && permissionsFor(m.orgKind, m.role).includes(perm);
}

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session) return null;
  const rows = await db()
    .select({ orgId: t.organizations.id, orgName: t.organizations.name, orgKind: t.organizations.kind, role: t.memberships.role })
    .from(t.memberships)
    .innerJoin(t.organizations, eq(t.organizations.id, t.memberships.orgId))
    .where(eq(t.memberships.userId, session.user.id))
    .orderBy(t.organizations.createdAt);
  const memberships: Membership[] = rows.map((r) => ({ ...r, orgKind: r.orgKind as OrgKind, role: r.role as Role }));
  const active = memberships.find((m) => m.orgId === session.activeOrgId) ?? memberships[0] ?? null;
  const [wallet] = await db()
    .select({ accountId: t.walletBindings.accountId, network: t.walletBindings.network })
    .from(t.walletBindings)
    .where(and(eq(t.walletBindings.userId, session.user.id), isNull(t.walletBindings.revokedAt)))
    .limit(1);
  return { ...session.user, sessionTokenHash: session.tokenHash, memberships, activeOrg: active, wallet: wallet ?? null };
});

/** For pages: redirect to sign-in when there is no session. */
export async function requireActorPage(next?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  return actor;
}

/** For actions / route handlers. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  return actor;
}

/** The caller's membership in `orgId` with `perm`, or FORBIDDEN. */
export function requireMembership(actor: Actor, orgId: string, perm: Permission): Membership {
  const m = actor.memberships.find((x) => x.orgId === orgId) ?? null;
  if (!can(m, perm)) throw new AppError("FORBIDDEN", "You do not have permission to do that in this organisation.");
  return m!;
}

/** The caller's active organisation with `perm`. */
export function requireActiveOrg(actor: Actor, perm: Permission, kind?: OrgKind): Membership {
  const m = actor.activeOrg;
  if (!m) throw new AppError("PRECONDITION_FAILED", "Create or join an organisation first.");
  if (kind && m.orgKind !== kind) {
    throw new AppError("FORBIDDEN", kind === "buyer" ? "Switch to a buyer organisation to do this." : "Switch to a supplier organisation to do this.");
  }
  return requireMembership(actor, m.orgId, perm);
}

export function orgIdsOf(actor: Actor, kind?: OrgKind): string[] {
  return actor.memberships.filter((m) => !kind || m.orgKind === kind).map((m) => m.orgId);
}

/** Wallet actions must be signed by the caller's own bound wallet. */
export function requireWallet(actor: Actor): { accountId: string; network: string } {
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind a NEAR testnet wallet to your account first.");
  return actor.wallet;
}
