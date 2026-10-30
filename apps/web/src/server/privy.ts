import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors";

/**
 * Privy e-mail sign-in, verified server-side without any Privy secret: the browser proves the
 * e-mail with Privy's one-time code, and we verify Privy's identity token (an ES256 JWT carrying
 * the user's linked accounts) against the app's published signing keys. Only fresh tokens are
 * accepted, so a leaked older token cannot be replayed to sign in.
 */
const ISSUER = "privy.io";
const MAX_TOKEN_AGE_S = 10 * 60;
const CLOCK_SKEW_S = 60;
const KEYS_TTL_MS = 10 * 60_000;
const KEYS_MIN_REFRESH_MS = 60_000;

export interface PrivyJwk {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

/** Returns the app's signing keys; `refresh` asks for a re-fetch (e.g. after key rotation). */
export type PrivyKeySource = (refresh: boolean) => Promise<PrivyJwk[]>;

const keyCache = new Map<string, { at: number; keys: PrivyJwk[] }>();

export function privyKeySource(appId: string): PrivyKeySource {
  return async (refresh) => {
    const hit = keyCache.get(appId);
    if (hit && Date.now() - hit.at < (refresh ? KEYS_MIN_REFRESH_MS : KEYS_TTL_MS)) return hit.keys;
    const res = await fetch(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Privy signing keys unavailable (HTTP ${res.status})`);
    const body = (await res.json()) as { keys?: unknown };
    const keys = Array.isArray(body.keys) ? (body.keys as PrivyJwk[]) : [];
    keyCache.set(appId, { at: Date.now(), keys });
    return keys;
  };
}

const rejected = () => new AppError("UNAUTHENTICATED", "We could not verify that sign-in. Please request a new code.");

function decodePart(part: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
  return value as Record<string, unknown>;
}

export async function verifyPrivyIdentityToken(token: string, appId: string, keys: PrivyKeySource, nowMs = Date.now()): Promise<{ privyUserId: string; email: string }> {
  const parts = typeof token === "string" && token.length <= 16_000 ? token.split(".") : [];
  if (parts.length !== 3) throw rejected();
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodePart(h);
    payload = decodePart(p);
  } catch {
    throw rejected();
  }
  if (header.alg !== "ES256" || typeof header.kid !== "string") throw rejected();

  const find = (list: PrivyJwk[]) => list.find((k) => k.kid === header.kid);
  const jwk = find(await keys(false)) ?? find(await keys(true));
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || (jwk.alg && jwk.alg !== "ES256") || (jwk.use && jwk.use !== "sig")) throw rejected();
  const signature = Buffer.from(s, "base64url");
  if (signature.length !== 64) throw rejected();
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
  if (!verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, signature)) throw rejected();

  const now = Math.floor(nowMs / 1000);
  const aud = payload.aud;
  if (payload.iss !== ISSUER || !(aud === appId || (Array.isArray(aud) && aud.includes(appId)))) throw rejected();
  if (typeof payload.exp !== "number" || now >= payload.exp + CLOCK_SKEW_S) throw rejected();
  if (typeof payload.iat !== "number" || payload.iat > now + CLOCK_SKEW_S || now - payload.iat > MAX_TOKEN_AGE_S) throw rejected();
  if (typeof payload.sub !== "string" || !payload.sub.startsWith("did:privy:")) throw rejected();

  let accounts: unknown;
  try {
    accounts = typeof payload.linked_accounts === "string" ? JSON.parse(payload.linked_accounts) : payload.linked_accounts;
  } catch {
    throw rejected();
  }
  const emails = Array.isArray(accounts)
    ? accounts.filter((a): a is { type: "email"; address: string } => (a as { type?: unknown })?.type === "email" && typeof (a as { address?: unknown }).address === "string")
    : [];
  if (emails.length !== 1) throw new AppError("PRECONDITION_FAILED", "Your sign-in did not include exactly one verified e-mail address. Sign in with your work e-mail.");
  const email = z.email().max(160).safeParse(emails[0]!.address.trim().toLowerCase());
  if (!email.success) throw rejected();
  return { privyUserId: payload.sub, email: email.data };
}
