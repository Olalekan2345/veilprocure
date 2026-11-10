/**
 * The signed-in app shares the website's look: Manrope, night-green ink, mint accents and the
 * green logo. Captures the review screenshots in docs/ui-review/app-*.png at desktop and phone width.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createOrg, signIn, testEmail } from "./helpers";

const REVIEW = resolve(import.meta.dirname, "../../../docs/ui-review");

async function capture(page: Page, name: string) {
  const box = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(box.scroll, `${name}: no horizontal overflow`).toBeLessThanOrEqual(box.inner);
  mkdirSync(REVIEW, { recursive: true });
  await page.screenshot({ path: `${REVIEW}/app-${name}.png`, fullPage: true });
}

async function expectSiteTheme(page: Page) {
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/manrope/i);
  const h1 = page.getByRole("heading", { level: 1 }).first();
  expect(Number(await h1.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  // next/image serves the artwork as /_next/image?url=%2Fbrand%2F…; decode before matching.
  const logos = (await page.$$eval("img", (imgs) => imgs.map((i) => decodeURIComponent(i.getAttribute("src") ?? "")))).filter((s) => s.includes("/brand/"));
  expect(logos.length).toBeGreaterThan(0);
  for (const src of logos) expect(src, "green logo artwork").toMatch(/-green\.png/);
}

test("sign-in screen uses the website theme", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.goto("/signin");
    await expectSiteTheme(page);
    const submit = page.getByRole("button", { name: "Email me a sign-in link" });
    expect(await submit.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(13, 32, 28)");
    await capture(page, `signin-${width}`);
  }
});

test("workspace pages use the website theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, testEmail("theme"));
  await expectSiteTheme(page);
  await capture(page, "onboarding-1440");
  await createOrg(page, "buyer", "Theme Review Studio (e2e)");
  await expectSiteTheme(page);
  await capture(page, "dashboard-1440");

  await page.getByRole("link", { name: /New request/ }).first().click();
  await page.getByLabel("Title").fill("Theme review: accessibility audit");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/edit$/);
  await capture(page, "draft-editor-1440");
  await page.getByRole("button", { name: "Save & review" }).click();
  await page.waitForURL(/\/app\/rfqs\/[0-9a-f-]+$/);
  await capture(page, "request-1440");

  for (const path of ["/app/rfqs", "/app/wallet", "/app/transactions"]) {
    await page.goto(path);
    await expectSiteTheme(page);
    await capture(page, `${path.split("/").pop()}-1440`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await capture(page, "dashboard-390");
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  // The drawer covers the full screen height (not clipped to the sticky header).
  expect((await menu.boundingBox())!.height).toBe(844);
  await expect(menu.getByRole("link", { name: "Settings" })).toBeInViewport();
  await page.screenshot({ path: `${REVIEW}/app-menu-390.png` });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
