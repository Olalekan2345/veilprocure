/**
 * Real Privy e-mail-code sign-in using a Privy test account (opt-in). Put the dashboard's test
 * credentials in .local/privy-test.env as PRIVY_TEST_EMAIL=… and PRIVY_TEST_CODE=…
 * (Privy dashboard → User management → Authentication → Advanced → Enable test accounts).
 * The web server must have PRIVY_APP_ID set and the app must return identity tokens.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

const file = resolve(import.meta.dirname, "../../../.local/privy-test.env");
const creds: Record<string, string> = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};

test.skip(!creds.PRIVY_TEST_EMAIL || !creds.PRIVY_TEST_CODE, "needs Privy test-account credentials in .local/privy-test.env");

test("signs in with Privy's e-mail code and leaves no Privy session on our origin", async ({ page }) => {
  await sql`delete from rate_limits`;
  const email = creds.PRIVY_TEST_EMAIL!.toLowerCase();
  await page.goto("/signin");
  await page.locator("#privy-email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("6-digit code").fill(creds.PRIVY_TEST_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 30_000 });

  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.toLowerCase().includes("privy")))).toEqual([]);
  const ours = await page.context().cookies(page.url());
  expect(ours.filter((c) => c.name.toLowerCase().includes("privy"))).toEqual([]);
  const [row] = await sql<{ metadata: Record<string, unknown> }[]>`
    select a.metadata from audit_events a join users u on u.id = a.actor_user_id
    where u.email = ${email} and a.action = 'auth.signed_in' order by a.occurred_at desc limit 1`;
  expect(row?.metadata).toMatchObject({ method: "privy" });
});
