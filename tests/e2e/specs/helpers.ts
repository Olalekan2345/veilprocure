import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

/** Reads local DB credentials (worker role) to fetch dev-mailbox sign-in links. Test-only. */
function env(): Record<string, string> {
  const file = resolve(import.meta.dirname, "../../../.local/db.env");
  if (!existsSync(file)) throw new Error("Run `node scripts/dev-db.mjs start` first.");
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

export const sql = postgres(env().WORKER_DATABASE_URL!, { max: 2, onnotice: () => {} });

export function testEmail(label: string): string {
  return `test-e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
}

export async function latestLink(email: string, pathPrefix: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const rows = await sql<{ body_text: string }[]>`select body_text from email_outbox where to_email = ${email} order by created_at desc limit 1`;
    const m = rows[0]?.body_text.match(new RegExp(`https?://[^\\s]+${pathPrefix}[^\\s]+`));
    if (m) return new URL(m[0]).pathname + new URL(m[0]).search;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${pathPrefix} link for ${email}`);
}

/** Full passwordless sign-in through the UI, using the development mailbox. */
export async function signIn(page: Page, email: string, next = "/app"): Promise<void> {
  // Test infrastructure: every journey signs in from the same local address, so reset the
  // fixed-window limiter (the limiter itself is exercised in ratelimit tests).
  await sql`delete from rate_limits`;
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Work e-mail").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("E-mail delivery is not configured on this server")).toBeVisible();
  const link = await latestLink(email, "/auth/confirm");
  await page.goto(link);
  await page.getByRole("button", { name: "Continue to VeilProcure" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"));
}

export async function createOrg(page: Page, kind: "buyer" | "supplier", name: string): Promise<void> {
  await page.goto("/app/onboarding");
  await page.getByText(kind === "buyer" ? "I buy services" : "I supply services").click();
  await page.getByLabel("Organisation name").fill(name);
  await page.getByRole("button", { name: `Create ${kind} organisation` }).click();
  await page.waitForURL("**/app");
}
