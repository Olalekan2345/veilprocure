import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db, tables } from "./db";
import { env } from "./env";
import { newToken, sha256Hex } from "./crypto";

const t = tables;

function cookieName(): string {
  // __Host- requires Secure + Path=/ + no Domain: only possible over https.
  return env().NODE_ENV === "production" ? "__Host-veil_session" : "veil_session";
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  isPlatformOperator: boolean;
}

export interface Session {
  tokenHash: string;
  user: SessionUser;
  activeOrgId: string | null;
}

export async function createSession(userId: string): Promise<void> {
  const { token, hash } = newToken(32);
  const ttlMs = env().SESSION_TTL_HOURS * 3600_000;
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db().insert(t.sessions).values({ tokenHash: hash, userId, expiresAt: new Date(Date.now() + ttlMs), userAgent: ua });
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

/** Current session, validated against the database once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 100) return null;
  const hash = sha256Hex(token);
  const rows = await db()
    .select({
      tokenHash: t.sessions.tokenHash,
      activeOrgId: t.sessions.activeOrgId,
      lastSeenAt: t.sessions.lastSeenAt,
      id: t.users.id,
      email: t.users.email,
      displayName: t.users.displayName,
      isPlatformOperator: t.users.isPlatformOperator,
    })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.tokenHash, hash), isNull(t.sessions.revokedAt), gt(t.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await db().update(t.sessions).set({ lastSeenAt: new Date() }).where(eq(t.sessions.tokenHash, hash));
  }
  return {
    tokenHash: row.tokenHash,
    activeOrgId: row.activeOrgId,
    user: { id: row.id, email: row.email, displayName: row.displayName, isPlatformOperator: row.isPlatformOperator },
  };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (token) {
    await db().update(t.sessions).set({ revokedAt: new Date() }).where(eq(t.sessions.tokenHash, sha256Hex(token)));
  }
  store.delete(cookieName());
}

export async function setActiveOrg(tokenHash: string, orgId: string): Promise<void> {
  await db().update(t.sessions).set({ activeOrgId: orgId }).where(eq(t.sessions.tokenHash, tokenHash));
}
