import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "./db";
import { sha256Hex } from "./crypto";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiting stored in Postgres (works across server instances without Redis).
 * Buckets never contain raw IPs or e-mail addresses — they are hashed.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const key = sha256Hex(bucket);
  const rows = await db().execute<{ count: number }>(sql`
    insert into rate_limits (bucket, window_start, count) values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (bucket, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
  }
}

/**
 * Client address bucket. Forwarding headers are client-controlled unless a trusted reverse proxy
 * overwrites them, so they are honoured only when TRUST_PROXY_HEADERS=true (set this behind
 * Vercel/Cloudflare/nginx). Otherwise all callers share one bucket, which fails safe (stricter).
 */
export async function clientIpBucket(): Promise<string> {
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "ip:untrusted-proxy";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}
