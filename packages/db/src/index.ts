import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";
export { schema as tables };

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, {
    max: opts.max ?? 10,
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
