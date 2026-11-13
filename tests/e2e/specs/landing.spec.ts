/**
 * Public landing page: layout at five widths (and the review screenshots in docs/ui-review),
 * every navigation target, the mobile menu's focus handling, interactive states, reduced motion,
 * no-JavaScript rendering and content honesty (no invented metrics, prices or hashes).
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REVIEW = resolve(import.meta.dirname, "../../../docs/ui-review");
const WIDTHS = [1440, 1280, 768, 390, 360];

/** Scrolls through the page instantly so every scroll reveal has run before a capture. */
async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(1200);
}

test.describe("landing page", () => {
  for (const width of WIDTHS) {
    test(`fits ${width}px without horizontal overflow; hero readable at once`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
      await page.goto("/");
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeVisible();
      await expect(h1).toContainText("Better sourcing.");
      await expect(h1).toContainText("Less exposure.");
      await expect(page.getByRole("link", { name: "Create a procurement request" })).toBeVisible();
      // The headline is painted immediately: never fully transparent while it settles.
      expect(Number(await h1.locator(".vp-line").first().evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.2);
      mkdirSync(REVIEW, { recursive: true });
      await page.screenshot({ path: `${REVIEW}/landing-${width}-hero.png` });
      await revealAll(page);
      const box = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(box.scroll, "no horizontal overflow").toBeLessThanOrEqual(box.inner);
      await page.screenshot({ path: `${REVIEW}/landing-${width}-full.jpg`, fullPage: true, type: "jpeg", quality: 72 });
    });
  }

  test("every link and call to action resolves", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(hrefs.length).toBeGreaterThan(15);
    const ids = new Set(await page.$$eval("[id]", (els) => els.map((e) => e.id)));
    for (const href of hrefs) {
      if (href.startsWith("#") || href.startsWith("/#")) {
        const id = href.split("#")[1]!;
        expect(ids.has(id), `anchor ${href}`).toBe(true);
      } else if (href.startsWith("/")) {
        const res = await request.get(href);
        expect(res.status(), href).toBeLessThan(400);
      } else {
        expect(href, "external links are the project's own public resources").toMatch(/^https:\/\/(github\.com\/Olalekan2345\/veilprocure|testnet\.nearblocks\.io\/address\/veilprocure-106725\.testnet)/);
      }
    }
  });

  test("mobile menu: focus moves in, Escape closes it, focus returns", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const button = page.getByRole("button", { name: "Menu", exact: true });
    const sheet = page.getByRole("dialog", { name: "Site menu" });
    await expect(async () => {
      await button.click();
      await expect(sheet).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await sheet.getByRole("link", { name: "FAQ" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/#faq$/);
  });

  test("keyboard: skip link first, visible focus ring on navigation", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    const logo = page.getByRole("link", { name: "VeilProcure home" });
    await expect(logo).toBeFocused();
    expect(await logo.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  });

  test("interactive states: bid illustration toggle and FAQ deep link", async ({ page }) => {
    await page.goto("/");
    const after = page.getByRole("button", { name: "After close" });
    await expect(async () => {
      await after.click();
      await expect(after).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByText("Bidding closed on chain")).toBeVisible();
    await page.getByRole("link", { name: "See bid privacy safeguards" }).click();
    await expect(page.locator("#faq-quotes")).toHaveAttribute("open", "");
    await expect(page.getByText(/servers hold the decryption key/)).toBeVisible();
    const money = page.locator("#faq-money summary");
    await money.click();
    await expect(page.locator("#faq-money")).toHaveAttribute("open", "");
  });

  test("back to top: appears after the first screen, returns to the top and moves focus", async ({ page }) => {
    await page.goto("/");
    const button = page.locator(".vp-totop");
    await expect(button).toBeHidden();
    await expect(async () => {
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "instant" }));
      await expect(button).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(button).toHaveAccessibleName("Back to top");
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBe(0);
    await expect(page.getByRole("link", { name: "VeilProcure home" })).toBeFocused();
    await expect(button).toBeHidden();
    // The footer link works on its own (no JavaScript needed).
    await expect(page.locator("footer").getByRole("link", { name: "Back to top" })).toHaveAttribute("href", "#top");
  });

  test("back to top stays clickable above a host badge in the same corner (Netlify free plan)", async ({ page }) => {
    await page.goto("/");
    // Simulate Netlify's injected badge: fixed 197x64 iframe, bottom-right, topmost.
    await page.evaluate(() => {
      const f = document.createElement("iframe");
      f.id = "nl-badge-frame";
      f.title = "Powered by Netlify";
      Object.assign(f.style, { position: "fixed", right: "0", bottom: "0", width: "197px", height: "64px", border: "0", zIndex: "2147483645" });
      document.body.appendChild(f);
    });
    const button = page.locator(".vp-totop");
    await expect(async () => {
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "instant" }));
      await expect(button).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    const btn = (await page.locator(".vp-totop-btn").boundingBox())!;
    const badge = (await page.locator("#nl-badge-frame").boundingBox())!;
    expect(btn.y + btn.height, "button sits above the badge").toBeLessThanOrEqual(badge.y);
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBe(0);
  });

  test("workspace showcase plays once inside its window and settles on the final frame", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const fig = page.locator(".jf-figure");
    const before = await fig.boundingBox();
    await fig.scrollIntoViewIfNeeded();
    await expect(fig).toHaveAttribute("data-done", "true", { timeout: 30_000 });
    for (const sel of [".jf-panel", ".jf-approve", ".jf-escrow"]) {
      expect(Number(await fig.locator(sel).evaluate((el) => getComputedStyle(el).opacity)), sel).toBe(1);
    }
    // Same footprint as before it played, and no claim that a payment happened.
    expect((await fig.boundingBox())!.height).toBeCloseTo(before!.height, 0);
    const text = await fig.innerText();
    expect(text).not.toMatch(/\bpaid\b|confirmed|\d+(\.\d+)?\s?NEAR\b/i);
    expect(text).toContain("Illustration of the workspace — not live data.");
  });

  test("reduced motion: the showcase shows its complete final frame without animating", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    const fig = page.locator(".jf-figure");
    await expect(fig).toHaveAttribute("data-ready", "static");
    for (const sel of [".jf-panel", ".jf-approve", ".jf-escrow"]) {
      expect(Number(await fig.locator(sel).evaluate((el) => getComputedStyle(el).opacity)), sel).toBe(1);
    }
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    await ctx.close();
  });

  test("reduced motion: everything is visible without scrolling", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const hidden = await page.$$eval("[data-reveal]", (els) => els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length);
    expect(hidden).toBe(0);
    await ctx.close();
  });

  test("without JavaScript: headline, value proposition and sections render", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Less exposure.");
    await expect(page.getByText("Collect sealed supplier quotations")).toBeVisible();
    const faq = page.getByRole("heading", { name: /Straight answers/ });
    await faq.scrollIntoViewIfNeeded();
    expect(Number(await faq.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    await ctx.close();
  });

  test("honest content: semantics, testnet labels, no invented numbers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThanOrEqual(10);
    const text = await page.locator("main").innerText();
    expect(text).toMatch(/no monetary value/i);
    expect(text).toMatch(/Workflow illustration/i);
    expect(text).toMatch(/not live data/i);
    expect(text, "no percentages / KPIs").not.toMatch(/\d\s?%/);
    expect(text, "no currency amounts").not.toMatch(/[$€£]\s?\d|\d+(\.\d+)?\s?(USD|NEAR)\b/);
    expect(text, "no transaction or account hashes").not.toMatch(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b|\b[0-9a-f]{32,}\b/);
    const missingAlt = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.hasAttribute("alt")).length);
    expect(missingAlt).toBe(0);
  });
});
