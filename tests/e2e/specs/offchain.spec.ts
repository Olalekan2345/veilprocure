/**
 * Off-chain acceptance and adversarial journeys that run without a deployed contract or wallet:
 * fresh-account onboarding (A19/Journey E), draft authoring, publish gating, tenant isolation
 * (IDOR) and CSRF/auth guards. Chain-backed journeys live in chain.spec.ts.
 */
import { expect, test } from "@playwright/test";
import { createOrg, latestLink, signIn, sql, testEmail } from "./helpers";

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("public pages are honest and reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Private bids.");
  await expect(page.getByText("Public beta on NEAR testnet").first()).toBeVisible();
  await expect(page.getByText(/no monetary value/i).first()).toBeVisible();
  for (const path of ["/security", "/terms", "/privacy", "/support"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("workspace requires a session", async ({ page }) => {
  await page.goto("/app/rfqs");
  await expect(page).toHaveURL(/\/signin\?next=/);
});

test("sign-in links are single use and not consumed by GET", async ({ page }) => {
  const email = testEmail("single-use");
  await page.goto("/signin");
  await page.getByLabel("Work e-mail").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const link = await latestLink(email, "/auth/confirm");
  // Simulate a mail scanner prefetching the link twice: still unconsumed.
  await page.request.get(link);
  await page.request.get(link);
  await page.goto(link);
  await page.getByRole("button", { name: "Continue to VeilProcure" }).click();
  await page.waitForURL("**/app/onboarding");
  // Re-using the link in a fresh context fails.
  const ctx = await page.context().browser()!.newContext();
  const other = await ctx.newPage();
  await other.goto(link);
  await other.getByRole("button", { name: "Continue to VeilProcure" }).click();
  await expect(other).toHaveURL(/signin\?error=expired/);
  await ctx.close();
});

test("fresh buyer: onboarding, empty states, draft, publish gate", async ({ page }) => {
  await signIn(page, testEmail("buyer"));
  await expect(page).toHaveURL(/onboarding/);
  await createOrg(page, "buyer", "Test Buyer Studio (e2e)");
  // Honest empty dashboard: zeros and a first action, no seeded data.
  await expect(page.getByText("Create your first request")).toBeVisible();
  await expect(page.getByText("0 NEAR").first()).toBeVisible();

  await page.getByRole("link", { name: /New request/ }).first().click();
  await page.getByLabel("Title").fill("E2E accessibility audit");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/edit$/);

  await page.getByLabel("Scope of work").fill("Audit the checkout flow against WCAG 2.2 AA and deliver a prioritised report.");
  await page.getByLabel("Deliverable 1", { exact: true }).fill("Audit report (PDF)");
  await page.getByLabel("Maximum price").fill("2000");
  await page.getByLabel("Supplier e-mail 1", { exact: true }).fill(testEmail("invitee"));
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved and encrypted.")).toBeVisible();

  // Weights must sum to 100 — UI shows the error and the server rejects publishing.
  await page.getByRole("button", { name: "Save & review" }).click();
  await page.waitForURL(/\/app\/rfqs\/[0-9a-f-]+$/);
  await expect(page.getByText("Ready to publish?")).toBeVisible();
  await expect(page.getByText(/Set a bid deadline/)).toBeVisible();
  await expect(page.getByText(/Bind your NEAR testnet wallet/)).toBeVisible();

  // The draft is encrypted at rest: the plaintext scope is not in the database row.
  const id = page.url().split("/").pop()!;
  const [row] = await sql<{ draft_enc: string }[]>`select draft_enc from rfqs where id = ${id}`;
  expect(row!.draft_enc.startsWith("v1.")).toBe(true);
  expect(row!.draft_enc).not.toContain("WCAG");
});

test("another organisation cannot open a buyer's request (IDOR)", async ({ browser }) => {
  const buyerCtx = await browser.newContext();
  const buyer = await buyerCtx.newPage();
  await signIn(buyer, testEmail("owner"));
  await createOrg(buyer, "buyer", "Test Owner Org (e2e)");
  await buyer.goto("/app/rfqs/new");
  await buyer.getByLabel("Title").fill("Confidential request for IDOR test");
  await buyer.getByRole("button", { name: "Create draft" }).click();
  await buyer.waitForURL(/\/edit$/);
  const rfqUrl = buyer.url().replace(/\/edit$/, "");

  const attackerCtx = await browser.newContext();
  const attacker = await attackerCtx.newPage();
  await signIn(attacker, testEmail("attacker"));
  await createOrg(attacker, "buyer", "Test Attacker Org (e2e)");
  for (const path of [rfqUrl, `${rfqUrl}/edit`, `${rfqUrl}/compare`]) {
    const res = await attacker.goto(new URL(path).pathname);
    expect(res?.status(), path).toBe(404);
    await expect(attacker.getByText("Confidential request for IDOR test")).toHaveCount(0);
  }
  await buyerCtx.close();
  await attackerCtx.close();
});

test("API mutations reject cross-site and unauthenticated requests", async ({ request }) => {
  const upload = await request.post("/api/uploads", { headers: { Origin: "https://evil.example" }, multipart: { purpose: "quote", rfqId: crypto.randomUUID() } });
  expect(upload.status()).toBe(403);
  const confirm = await request.post(`/api/tx/${crypto.randomUUID()}/confirm`, { headers: { Origin: "http://localhost:3000" }, data: { txHash: "x".repeat(44) } });
  expect(confirm.status()).toBe(401);
  const file = await request.get(`/api/files/${crypto.randomUUID()}?t=1.abc`);
  expect(file.status()).toBe(401);
});

test("mobile: sign-in and navigation work @mobile", async ({ page }) => {
  await signIn(page, testEmail("mobile"));
  await createOrg(page, "supplier", "Test Mobile Supplier (e2e)");
  const menu = page.getByRole("dialog", { name: "Menu" });
  // Retry until hydrated: a click before React attaches handlers is a no-op in dev mode.
  await expect(async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await menu.getByRole("link", { name: "Invitations & bids" }).click();
  await expect(page.getByRole("heading", { name: "Invitations & bids" })).toBeVisible();
  await expect(page.getByText("No accepted invitations")).toBeVisible();
});

test("sign-in requests are rate limited per address", async ({ page }) => {
  await sql`delete from rate_limits`;
  const email = testEmail("ratelimit");
  for (let i = 0; i < 5; i++) {
    await page.goto("/signin");
    await page.getByLabel("Work e-mail").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText("E-mail delivery is not configured on this server")).toBeVisible();
  }
  await page.goto("/signin");
  await page.getByLabel("Work e-mail").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Too many attempts")).toBeVisible();
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from login_tokens where email = ${email}`;
  expect(row!.n).toBe(5);
});
