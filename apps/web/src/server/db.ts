import "server-only";
import { createDb, type Db } from "@veilprocure/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { veilDb?: Db };

/** Process-wide connection pool (reused across hot reloads in development). */
export function db(): Db {
  globalForDb.veilDb ??= createDb(env().DATABASE_URL, { max: 10 }).db;
  return globalForDb.veilDb;
}

export { withActor, tables } from "@veilprocure/db";
