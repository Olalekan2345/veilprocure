#!/usr/bin/env node
// Builds the hosted (Netlify) environment for VeilProcure and, with --apply, sets it on the site
// through the Netlify CLI (logged in by the owner). Without --apply it only prints the plan, with
// every secret masked.
//
//   node scripts/netlify-env.mjs --site <name> [--apply]
//
// Sources (all local, never committed): .local/hosted.env (Neon logins written by
// `pnpm --filter @veilprocure/db provision:hosted`), apps/web/.env.local (SMTP, NEAR) and
// apps/worker/.env (NEAR AI). Fresh hosted-only secrets (encryption key, download-link key,
// AI-runner trigger) are generated once and kept in .local/hosted.env. The schema-owner login and
// the E2E wallet bridge are never sent.
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const site = args[args.indexOf("--site") + 1];
const apply = args.includes("--apply");
if (!args.includes("--site") || !site || site.startsWith("--")) {
  console.error("usage: node scripts/netlify-env.mjs --site <netlify-site-name> [--apply]");
  process.exit(2);
}

function readEnv(file) {
  const p = join(root, file);
  if (!existsSync(p)) throw new Error(`${file} not found`);
  return new Map(
    readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

const hostedFile = join(root, ".local/hosted.env");
const hosted = readEnv(".local/hosted.env");
const web = readEnv("apps/web/.env.local");
const worker = readEnv("apps/worker/.env");

const generated = {
  VEIL_MASTER_KEY: () => randomBytes(32).toString("base64"),
  DOWNLOAD_TOKEN_SECRET: () => randomBytes(32).toString("base64"),
  WORKER_TRIGGER_SECRET: () => randomBytes(32).toString("base64url"),
};
let created = false;
for (const [key, make] of Object.entries(generated)) {
  if (!hosted.get(key)) {
    hosted.set(key, make());
    created = true;
  }
}
if (created) writeFileSync(hostedFile, [...hosted].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

const appUrl = `https://${site}.netlify.app`;
const need = (map, key, from) => {
  const v = map.get(key);
  if (!v) throw new Error(`${key} is missing from ${from}`);
  return v;
};

// [key, value, secret]
const vars = [
  ["APP_URL", appUrl, false],
  ["DATABASE_URL", need(hosted, "DATABASE_URL", ".local/hosted.env"), true],
  ["WORKER_DATABASE_URL", need(hosted, "WORKER_DATABASE_URL", ".local/hosted.env"), true],
  ["VEIL_MASTER_KEY", hosted.get("VEIL_MASTER_KEY"), true],
  ["VEIL_KEY_ID", "netlify-1", false],
  ["DOWNLOAD_TOKEN_SECRET", hosted.get("DOWNLOAD_TOKEN_SECRET"), true],
  ["STORAGE_BACKEND", "netlify-blobs", false],
  ["EMAIL_TRANSPORT", "smtp", false],
  ["SMTP_HOST", need(web, "SMTP_HOST", "apps/web/.env.local"), false],
  ["SMTP_PORT", need(web, "SMTP_PORT", "apps/web/.env.local"), false],
  ["SMTP_USER", need(web, "SMTP_USER", "apps/web/.env.local"), false],
  ["SMTP_PASS", need(web, "SMTP_PASS", "apps/web/.env.local"), true],
  ["EMAIL_FROM", need(web, "EMAIL_FROM", "apps/web/.env.local"), false],
  ["TRUST_PROXY_HEADERS", "netlify", false],
  ["NEAR_NETWORK", "testnet", false],
  ["NEAR_RPC_URL", need(web, "NEAR_RPC_URL", "apps/web/.env.local"), false],
  ["NEAR_EXPLORER_URL", need(web, "NEAR_EXPLORER_URL", "apps/web/.env.local"), false],
  ["NEAR_CONTRACT_ID", need(web, "NEAR_CONTRACT_ID", "apps/web/.env.local"), false],
  ["NEARAI_BASE_URL", worker.get("NEARAI_BASE_URL") || "https://cloud-api.near.ai", false],
  ["NEARAI_API_KEY", need(worker, "NEARAI_API_KEY", "apps/worker/.env"), true],
  ["NEARAI_MODEL", need(worker, "NEARAI_MODEL", "apps/worker/.env"), false],
  ["AI_RUNNER_URL", `${appUrl}/.netlify/functions/ai-runner`, false],
  ["WORKER_TRIGGER_SECRET", hosted.get("WORKER_TRIGGER_SECRET"), true],
];

console.log(`Netlify site: ${site} (${appUrl})${apply ? "" : "  [plan only — rerun with --apply to set]"}`);
for (const [key, value, secret] of vars) {
  console.log(`  ${key.padEnd(22)} ${secret ? `(secret, ${value.length} chars) → production only` : `${value} → all contexts`}`);
}
console.log("  not sent: MIGRATION_DATABASE_URL (schema owner), NEXT_PUBLIC_VEIL_E2E_WALLET, STORAGE_DIR");
if (!apply) process.exit(0);

// Run the CLI's own entry point with node — no shell, so values are passed exactly as written.
const cli = join(execSync("npm root -g", { encoding: "utf8" }).trim(), "netlify-cli", "bin", "run.js");
if (!existsSync(cli)) throw new Error(`Netlify CLI not found at ${cli}; run: npm i -g netlify-cli`);
for (const [key, value, secret] of vars) {
  // Secrets: production deploys only (never previews). Do not add --scope: on Netlify's free plan
  // the CLI then silently skips the write (observed with netlify-cli 27.16.1).
  const extra = secret ? ["--secret", "--context", "production"] : [];
  try {
    // --filter answers the CLI's monorepo "which app?" prompt.
    execFileSync(process.execPath, [cli, "env:set", key, value, "--site", site, "--filter", "@veilprocure/web", "--force", ...extra], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    // Never echo the command line: it contains the value.
    const reason = String(err.stderr ?? "").split(/\r?\n/).find((l) => /error/i.test(l)) ?? `exit ${err.status}`;
    console.error(`failed to set ${key}: ${reason.replaceAll(value, "<redacted>").trim()}`);
    process.exit(1);
  }
  console.log(`set ${key}`);
}

// The CLI can exit 0 without writing, so confirm every key through the API (names only).
const state = JSON.parse(readFileSync(join(root, "apps/web/.netlify/state.json"), "utf8"));
const api = (method, data) => JSON.parse(execFileSync(process.execPath, [cli, "api", method, "--data", JSON.stringify(data)], { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }));
const { account_slug } = api("getSite", { site_id: state.siteId });
const present = new Map(api("getEnvVars", { account_id: account_slug, site_id: state.siteId }).map((v) => [v.key, v]));
const missing = vars.filter(([key, , secret]) => !present.has(key) || present.get(key).is_secret !== secret).map(([key]) => key);
if (missing.length) {
  console.error(`NOT confirmed on Netlify: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`confirmed via API: ${vars.length} variables present (${vars.filter((v) => v[2]).length} secret)`);
