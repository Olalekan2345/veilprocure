"use server";

import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isNearAccountId, randomBytes, toHex } from "@veilprocure/shared";
import { audit } from "../audit";
import { requireActor, requireMembership } from "../authz";
import { db, tables } from "../db";
import { newToken, sha256Hex } from "../crypto";
import { sendEmail, type DeliveryStatus } from "../email";
import { env } from "../env";
import { AppError, toResult, zodFieldErrors, type ActionResult } from "../errors";
import { verifyNep413 } from "../near";
import { clientIpBucket, rateLimit } from "../ratelimit";
import { createSession, destroySession, setActiveOrg } from "../session";

const t = tables;
const LOGIN_TTL_MS = 15 * 60_000;
const emailSchema = z.email("Enter a valid e-mail address").max(160).transform((e) => e.trim().toLowerCase());

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
}

// ------------------------------------------------------------------ sign-in

export async function requestSignIn(_prev: unknown, form: FormData): Promise<ActionResult<{ delivery: DeliveryStatus; email: string }>> {
  try {
    const parsed = emailSchema.safeParse(form.get("email"));
    if (!parsed.success) throw new AppError("INVALID_INPUT", "Enter a valid e-mail address.", { email: "Enter a valid e-mail address." });
    const email = parsed.data;
    await rateLimit(`signin:${await clientIpBucket()}`, 10, 600);
    await rateLimit(`signin-email:${email}`, 5, 600);
    const { token, hash } = newToken(32);
    await db()
      .insert(t.loginTokens)
      .values({ email, tokenHash: hash, nextPath: safeNext(form.get("next")), expiresAt: new Date(Date.now() + LOGIN_TTL_MS) });
    const link = `${env().APP_URL}/auth/confirm?token=${token}`;
    const delivery = await sendEmail({
      to: email,
      template: "sign_in",
      subject: "Your VeilProcure sign-in link",
      text: `Use this link within 15 minutes to sign in to VeilProcure:\n\n${link}\n\nIf you did not request it, ignore this e-mail. VeilProcure runs on NEAR testnet; testnet tokens have no monetary value.`,
    });
    return { ok: true, data: { delivery, email } };
  } catch (err) {
    return toResult(err);
  }
}

/** POST from /auth/confirm (never consumed by a GET, so link scanners cannot burn tokens). */
export async function confirmSignIn(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  if (!token || token.length > 100) redirect("/signin?error=invalid");
  await rateLimit(`confirm:${await clientIpBucket()}`, 30, 600);
  const hash = sha256Hex(token);
  const consumed = await db()
    .update(t.loginTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(t.loginTokens.tokenHash, hash), isNull(t.loginTokens.consumedAt), gt(t.loginTokens.expiresAt, new Date())))
    .returning({ email: t.loginTokens.email, nextPath: t.loginTokens.nextPath });
  const row = consumed[0];
  if (!row) redirect("/signin?error=expired");
  const now = new Date();
  const [user] = await db()
    .insert(t.users)
    .values({ email: row.email, emailVerifiedAt: now, lastLoginAt: now })
    .onConflictDoUpdate({ target: t.users.email, set: { lastLoginAt: now, emailVerifiedAt: now } })
    .returning({ id: t.users.id });
  await createSession(user!.id);
  await audit(db(), { actorKind: "user", actorUserId: user!.id, action: "auth.signed_in", targetType: "user", targetId: user!.id });
  redirect(safeNext(row.nextPath));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

// ------------------------------------------------------------------ organisations

const orgSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(120),
  kind: z.enum(["buyer", "supplier"]),
  website: z.union([z.literal(""), z.url("Enter a full URL, e.g. https://example.com").max(200)]).optional(),
});

export async function createOrganization(_prev: unknown, form: FormData): Promise<ActionResult<{ orgId: string }>> {
  try {
    const actor = await requireActor();
    const parsed = orgSchema.safeParse({ name: form.get("name"), kind: form.get("kind"), website: form.get("website") ?? "" });
    if (!parsed.success) throw new AppError("INVALID_INPUT", "Check the highlighted fields.", zodFieldErrors(parsed.error.issues));
    await rateLimit(`org-create:${actor.id}`, 10, 3600);
    const orgId = await db().transaction(async (tx) => {
      const [org] = await tx
        .insert(t.organizations)
        .values({ name: parsed.data.name, kind: parsed.data.kind, website: parsed.data.website || null, createdBy: actor.id })
        .returning({ id: t.organizations.id });
      await tx.insert(t.memberships).values({ orgId: org!.id, userId: actor.id, role: "owner" });
      await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: org!.id, action: "org.created", targetType: "organization", targetId: org!.id, metadata: { kind: parsed.data.kind } });
      return org!.id;
    });
    await setActiveOrg(actor.sessionTokenHash, orgId);
    // Layouts persist across client navigation; refresh the workspace shell (nav, org switcher).
    revalidatePath("/app", "layout");
    return { ok: true, data: { orgId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function switchOrganization(form: FormData): Promise<void> {
  const actor = await requireActor();
  const orgId = String(form.get("orgId") ?? "");
  requireMembership(actor, orgId, "org:view");
  await setActiveOrg(actor.sessionTokenHash, orgId);
  revalidatePath("/app", "layout");
  redirect(String(form.get("returnTo") ?? "/app").startsWith("/app") ? String(form.get("returnTo")) : "/app");
}

export async function updateDisplayName(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const name = z.string().trim().min(1).max(80).safeParse(form.get("displayName"));
    if (!name.success) throw new AppError("INVALID_INPUT", "Enter a name between 1 and 80 characters.");
    await db().update(t.users).set({ displayName: name.data }).where(eq(t.users.id, actor.id));
    return { ok: true, data: undefined };
  } catch (err) {
    return toResult(err);
  }
}

// ------------------------------------------------------------------ team

export async function inviteMember(_prev: unknown, form: FormData): Promise<ActionResult<{ delivery: DeliveryStatus; link: string | null }>> {
  try {
    const actor = await requireActor();
    const m = actor.activeOrg;
    if (!m) throw new AppError("PRECONDITION_FAILED", "Create an organisation first.");
    requireMembership(actor, m.orgId, "team:manage");
    const email = emailSchema.parse(form.get("email"));
    const role = z.enum(["admin", "member", "viewer"]).parse(form.get("role"));
    await rateLimit(`member-invite:${actor.id}`, 30, 3600);
    const { token, hash } = newToken(32);
    await db().insert(t.memberInvites).values({
      orgId: m.orgId,
      email,
      role,
      tokenHash: hash,
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    });
    const link = `${env().APP_URL}/join/${token}`;
    const delivery = await sendEmail({
      to: email,
      template: "member_invite",
      subject: `You are invited to ${m.orgName} on VeilProcure`,
      text: `${actor.email} invited you to join ${m.orgName} on VeilProcure as ${role}.\n\nAccept within 7 days: ${link}\n\nSign in with this e-mail address to accept.`,
    });
    await audit(db(), { actorKind: "user", actorUserId: actor.id, orgId: m.orgId, action: "team.member_invited", targetType: "member_invite", metadata: { role, delivery } });
    // When e-mail is not delivered, the inviter may copy the link (authenticated workflow).
    return { ok: true, data: { delivery, link: delivery === "sent" ? null : link } };
  } catch (err) {
    return toResult(err);
  }
}

export async function acceptMemberInvite(form: FormData): Promise<void> {
  const actor = await requireActor();
  const hash = sha256Hex(String(form.get("token") ?? ""));
  const [inv] = await db()
    .select()
    .from(t.memberInvites)
    .where(and(eq(t.memberInvites.tokenHash, hash), isNull(t.memberInvites.acceptedAt), isNull(t.memberInvites.revokedAt), gt(t.memberInvites.expiresAt, new Date())))
    .limit(1);
  if (!inv || inv.email !== actor.email) redirect("/app?notice=invite-invalid");
  await db().transaction(async (tx) => {
    await tx.update(t.memberInvites).set({ acceptedAt: new Date() }).where(eq(t.memberInvites.id, inv.id));
    await tx.insert(t.memberships).values({ orgId: inv.orgId, userId: actor.id, role: inv.role }).onConflictDoNothing();
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: inv.orgId, action: "team.member_joined", targetType: "membership", metadata: { role: inv.role } });
  });
  await setActiveOrg(actor.sessionTokenHash, inv.orgId);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function changeMemberRole(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    const m = actor.activeOrg;
    if (!m) throw new AppError("PRECONDITION_FAILED", "No active organisation.");
    requireMembership(actor, m.orgId, "team:manage");
    const membershipId = z.uuid().parse(form.get("membershipId"));
    const role = z.enum(["owner", "admin", "member", "viewer"]).parse(form.get("role"));
    await db().transaction(async (tx) => {
      const [target] = await tx.select().from(t.memberships).where(and(eq(t.memberships.id, membershipId), eq(t.memberships.orgId, m.orgId))).limit(1);
      if (!target) throw new AppError("NOT_FOUND", "Member not found.");
      if (target.role === "owner" && m.role !== "owner") throw new AppError("FORBIDDEN", "Only an owner can change another owner.");
      if (role === "owner" && m.role !== "owner") throw new AppError("FORBIDDEN", "Only an owner can grant ownership.");
      if (target.role === "owner" && role !== "owner") {
        const owners = await tx.select({ id: t.memberships.id }).from(t.memberships).where(and(eq(t.memberships.orgId, m.orgId), eq(t.memberships.role, "owner")));
        if (owners.length <= 1) throw new AppError("PRECONDITION_FAILED", "An organisation needs at least one owner.");
      }
      await tx.update(t.memberships).set({ role }).where(eq(t.memberships.id, membershipId));
      await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: m.orgId, action: "team.role_changed", targetType: "membership", targetId: membershipId, metadata: { from: target.role, to: role } });
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return toResult(err);
  }
}

// ------------------------------------------------------------------ wallet binding

export async function createWalletChallenge(input: { accountId: string; confirmRebind: boolean }): Promise<
  ActionResult<{ challengeId: string; message: string; recipient: string; nonceHex: string } | { needsConfirmation: "replace_own" | "move_from_other_user" }>
> {
  try {
    const actor = await requireActor();
    const accountId = String(input.accountId ?? "").trim();
    if (!isNearAccountId(accountId)) throw new AppError("INVALID_INPUT", "That is not a valid NEAR account id.");
    if (!accountId.endsWith(".testnet") && !/^[0-9a-f]{64}$/.test(accountId)) {
      throw new AppError("INVALID_INPUT", "Connect a NEAR testnet account (ending in .testnet). Mainnet accounts are not supported.");
    }
    await rateLimit(`wallet-challenge:${actor.id}`, 20, 3600);
    const [otherOwner] = await db()
      .select({ userId: t.walletBindings.userId })
      .from(t.walletBindings)
      .where(and(eq(t.walletBindings.network, "testnet"), eq(t.walletBindings.accountId, accountId), isNull(t.walletBindings.revokedAt), ne(t.walletBindings.userId, actor.id)))
      .limit(1);
    if (otherOwner && !input.confirmRebind) return { ok: true, data: { needsConfirmation: "move_from_other_user" } };
    if (actor.wallet && actor.wallet.accountId !== accountId && !input.confirmRebind) return { ok: true, data: { needsConfirmation: "replace_own" } };

    const nonceHex = toHex(randomBytes(32));
    const issued = new Date();
    const expires = new Date(issued.getTime() + 10 * 60_000);
    const recipient = new URL(env().APP_URL).host;
    const message = [
      "VeilProcure wallet binding",
      `Account: ${accountId}`,
      `VeilProcure user: ${actor.email}`,
      "Network: NEAR testnet",
      `Origin: ${env().APP_URL}`,
      `Issued: ${issued.toISOString()}`,
      `Expires: ${expires.toISOString()}`,
      "Signing this message proves you control this account. It does not send a transaction or move funds.",
    ].join("\n");
    const [row] = await db()
      .insert(t.walletChallenges)
      .values({ userId: actor.id, network: "testnet", accountId, nonceHex, recipient, message, allowRebind: input.confirmRebind, expiresAt: expires })
      .returning({ id: t.walletChallenges.id });
    return { ok: true, data: { challengeId: row!.id, message, recipient, nonceHex } };
  } catch (err) {
    return toResult(err);
  }
}

export async function confirmWalletBinding(input: { challengeId: string; accountId: string; publicKey: string; signature: string }): Promise<ActionResult<{ accountId: string }>> {
  try {
    const actor = await requireActor();
    await rateLimit(`wallet-confirm:${actor.id}`, 20, 3600);
    const [ch] = await db()
      .update(t.walletChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(t.walletChallenges.id, String(input.challengeId)),
          eq(t.walletChallenges.userId, actor.id),
          isNull(t.walletChallenges.consumedAt),
          gt(t.walletChallenges.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!ch) throw new AppError("PRECONDITION_FAILED", "This signing request expired or was already used. Start again.");
    if (ch.accountId !== input.accountId) throw new AppError("FORBIDDEN", "The wallet signed for a different account than requested.");
    const result = await verifyNep413({
      accountId: ch.accountId,
      publicKey: String(input.publicKey),
      signature: String(input.signature),
      message: ch.message,
      nonce: Buffer.from(ch.nonceHex, "hex"),
      recipient: ch.recipient,
    });
    if (!result.ok) throw new AppError("FORBIDDEN", `Wallet signature rejected: ${result.reason}`);

    await db().transaction(async (tx) => {
      const now = new Date();
      const previousOwner = await tx
        .update(t.walletBindings)
        .set({ revokedAt: now })
        .where(and(eq(t.walletBindings.network, "testnet"), eq(t.walletBindings.accountId, ch.accountId), isNull(t.walletBindings.revokedAt), ne(t.walletBindings.userId, actor.id)))
        .returning({ userId: t.walletBindings.userId });
      if (previousOwner.length && !ch.allowRebind) throw new AppError("CONFLICT", "This wallet is bound to another user; explicit confirmation is required.");
      await tx
        .update(t.walletBindings)
        .set({ revokedAt: now })
        .where(and(eq(t.walletBindings.userId, actor.id), eq(t.walletBindings.network, "testnet"), isNull(t.walletBindings.revokedAt)));
      await tx.insert(t.walletBindings).values({ userId: actor.id, network: "testnet", accountId: ch.accountId, publicKey: String(input.publicKey) });
      for (const p of previousOwner) {
        await tx.insert(t.notifications).values({
          userId: p.userId,
          kind: "wallet_moved",
          title: "A wallet was moved off your account",
          body: `${ch.accountId} was bound to another VeilProcure user after they proved control of it. If this was not you, secure the wallet's keys.`,
          linkPath: "/app/wallet",
        });
      }
      await audit(tx, {
        actorKind: "user",
        actorUserId: actor.id,
        actorAccountId: ch.accountId,
        action: previousOwner.length ? "wallet.rebound_from_other_user" : "wallet.bound",
        targetType: "wallet",
        targetId: ch.accountId,
      });
    });
    return { ok: true, data: { accountId: ch.accountId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function unbindWallet(): Promise<ActionResult> {
  try {
    const actor = await requireActor();
    await db()
      .update(t.walletBindings)
      .set({ revokedAt: new Date() })
      .where(and(eq(t.walletBindings.userId, actor.id), isNull(t.walletBindings.revokedAt)));
    await audit(db(), { actorKind: "user", actorUserId: actor.id, action: "wallet.unbound", targetType: "wallet", targetId: actor.wallet?.accountId ?? null });
    return { ok: true, data: undefined };
  } catch (err) {
    return toResult(err);
  }
}

export async function submitSupportTicket(_prev: unknown, form: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor().catch(() => null);
    const parsed = z
      .object({ email: emailSchema, subject: z.string().trim().min(3).max(140), body: z.string().trim().min(10).max(5000) })
      .safeParse({ email: form.get("email") ?? actor?.email, subject: form.get("subject"), body: form.get("body") });
    if (!parsed.success) throw new AppError("INVALID_INPUT", "Check the highlighted fields.", zodFieldErrors(parsed.error.issues));
    await rateLimit(`support:${await clientIpBucket()}`, 5, 3600);
    await db().insert(t.supportTickets).values({ userId: actor?.id ?? null, contactEmail: parsed.data.email, subject: parsed.data.subject, body: parsed.data.body });
    return { ok: true, data: undefined };
  } catch (err) {
    return toResult(err);
  }
}
