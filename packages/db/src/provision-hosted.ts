/**
 * Prepares a hosted PostgreSQL database (e.g. Neon) for VeilProcure. Idempotent:
 *  1. creates the least-privilege login roles veil_app (subject to row-level security) and
 *     veil_worker (BYPASSRLS), or keeps them if .local/hosted.env already holds working logins;
 *  2. applies the migrations as the schema owner (MIGRATION_DATABASE_URL);
 *  3. checks each role's effective privileges by connecting as it;
 *  4. writes DATABASE_URL and WORKER_DATABASE_URL (Neon's pooled endpoint) to .local/hosted.env.
 * Passwords are generated here and never printed. Usage: pnpm --filter @veilprocure/db provision:hosted
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { normalizeDatabaseUrl } from "./index";
import { runMigrations } from "./migrate";

const FILE = fileURLToPath(new URL("../../../.local/hosted.env", import.meta.url));

const ROLES = [
  { name: "veil_app", urlKey: "DATABASE_URL", attrs: "NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS", bypass: false },
  { name: "veil_worker", urlKey: "WORKER_DATABASE_URL", attrs: "NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS", bypass: true },
] as const;

function readEnvFile(): Map<string, string> {
  if (!existsSync(FILE)) throw new Error(`${FILE} not found: create it with MIGRATION_DATABASE_URL=<owner connection string>`);
  const entries = readFileSync(FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()] as [string, string]);
  return new Map(entries);
}

/** Same database, other login; Neon's transaction pooler for app traffic ("-pooler" host). */
function roleUrl(ownerUrl: string, user: string, password: string): string {
  const u = new URL(normalizeDatabaseUrl(ownerUrl));
  u.username = user;
  u.password = password;
  if (u.hostname.endsWith(".neon.tech") && !u.hostname.split(".")[0]!.endsWith("-pooler")) {
    const [first, ...rest] = u.hostname.split(".");
    u.hostname = [`${first}-pooler`, ...rest].join(".");
  }
  return u.toString();
}

async function canLogin(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const client = postgres(normalizeDatabaseUrl(url), { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const env = readEnvFile();
  const ownerUrl = env.get("MIGRATION_DATABASE_URL");
  if (!ownerUrl) throw new Error("MIGRATION_DATABASE_URL is missing from .local/hosted.env");
  const owner = postgres(normalizeDatabaseUrl(ownerUrl), { max: 1, onnotice: () => {}, connect_timeout: 20 });
  try {
    const [who] = await owner<{ user: string; db: string; version: string }[]>`select current_user as user, current_database() as db, current_setting('server_version') as version`;
    console.log(`connected as ${who!.user} to ${who!.db} on ${new URL(ownerUrl).hostname} (PostgreSQL ${who!.version})`);

    for (const role of ROLES) {
      const [existing] = await owner<{ rolbypassrls: boolean }[]>`select rolbypassrls from pg_roles where rolname = ${role.name}`;
      if (existing && (await canLogin(env.get(role.urlKey)))) {
        console.log(`${role.name}: exists, stored login works — kept`);
        continue;
      }
      const password = randomBytes(24).toString("base64url");
      const verb = existing ? "ALTER" : "CREATE";
      try {
        // Rotation changes only the password: managed hosts (Neon) refuse attribute changes, and
        // the attributes are verified by logging in below.
        await owner.unsafe(existing ? `ALTER ROLE ${role.name} WITH PASSWORD '${password}'` : `CREATE ROLE ${role.name} WITH LOGIN PASSWORD '${password}' ${role.attrs}`);
      } catch (err) {
        throw new Error(`${verb} ROLE ${role.name} failed: ${err instanceof Error ? err.message : err}`);
      }
      env.set(role.urlKey, roleUrl(ownerUrl, role.name, password));
      console.log(`${role.name}: ${existing ? "password rotated" : "created"} (${role.attrs})`);
    }
    // Persist logins before migrating so a failed migration never loses the new passwords.
    writeFileSync(FILE, [...env].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  } finally {
    await owner.end({ timeout: 5 });
  }

  await runMigrations(ownerUrl);
  console.log("migrations applied");

  for (const role of ROLES) {
    const client = postgres(normalizeDatabaseUrl(env.get(role.urlKey)!), { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 });
    try {
      const [r] = await client<{ bypass: boolean; quotes: number }[]>`
        select (select rolbypassrls from pg_roles where rolname = current_user) as bypass,
               (select count(*)::int from quotes) as quotes`;
      const ok = r!.bypass === role.bypass;
      console.log(`${role.name}: login via ${new URL(env.get(role.urlKey)!).hostname} ok; BYPASSRLS=${r!.bypass} ${ok ? "(as intended)" : "(UNEXPECTED)"}`);
      if (!ok) process.exitCode = 1;
    } finally {
      await client.end({ timeout: 5 });
    }
  }
  console.log(`wrote DATABASE_URL and WORKER_DATABASE_URL to ${FILE} (not printed)`);
}

main().catch((err: unknown) => {
  console.error("provisioning failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
