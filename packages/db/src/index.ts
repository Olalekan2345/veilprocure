import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";
export { schema as tables };

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * postgres.js forwards unknown URL parameters to the server as settings, so drop libpq-only ones
 * that hosted providers add (Neon's `channel_binding`); TLS still comes from `sslmode`.
 */
export function normalizeDatabaseUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("channel_binding");
  return u.toString();
}

export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close: () => Promise<void> } {
  const client = postgres(normalizeDatabaseUrl(url), {
    max: opts.max ?? 10,
    // Transaction-mode poolers (e.g. Neon's "-pooler" endpoint) cannot track prepared statements.
    prepare: !/-pooler\./.test(url),
    // Never log query parameters: they can contain e-mail addresses or ciphertext.
    debug: false,
    onnotice: () => {},
  });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

/**
 * Runs `fn` in a transaction whose row-level-security context is the caller's organisations.
 * Quote, quote-revision and attachment rows are only visible through this helper (the web app
 * connects as `veil_app`, which is subject to RLS); forgetting it fails closed (no rows).
 */
export async function withActor<T>(db: Db, orgIds: readonly string[], fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (const id of orgIds) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("withActor: invalid organisation id");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('veil.org_ids', ${`{${orgIds.join(",")}}`}, true)`);
    return fn(tx);
  });
}
