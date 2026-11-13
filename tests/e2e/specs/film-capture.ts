/**
 * Filming helpers for film.spec.ts. A Camera captures lossless 1920×1080 PNG frames of one page
 * through the DevTools screencast (frames arrive whenever the screen changes, each with a
 * timestamp) and draws a cursor in-page at the real pointer, because headless capture has none.
 * A Director moves that pointer with eased motion, types at a human pace, holds on what matters
 * and signs transactions through the same guarded wallet bridge as chain-helpers.ts.
 * Output: .local/video/footage/<camera>/NNNNNN.png + frames.tsv, markers.jsonl, manifest.json.
 */
import { appendFileSync, mkdirSync, writeFile, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Browser, type CDPSession, type Locator, type Page } from "@playwright/test";
import { actions } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { loadAccount, txHashOf } from "../../../scripts/testnet/lib";

export const FOOTAGE = resolve(import.meta.dirname, "../../../.local/video/footage");
const MARKERS = resolve(FOOTAGE, "markers.jsonl");

/*
 * Runs before any page script. The UI is laid out at 1536 CSS px and rendered into the 1920 px
 * frame (zoom 1.25) so text reads at video size; the Next.js dev badge is not part of the product
 * and is hidden; a cursor and a mint tap ripple follow the real pointer events.
 */
const INIT = `(() => {
  const start = () => {
    const root = document.documentElement;
    root.style.zoom = '1.25';
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal{display:none!important} html{scrollbar-width:none} @keyframes __vp_tap{from{transform:translate(-50%,-50%) scale(.35);opacity:.6}to{transform:translate(-50%,-50%) scale(1.7);opacity:0}}';
    root.appendChild(style);
    const c = document.createElement('div');
    c.id = '__vp_cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 28 28"><path d="M5 3l16 11-7 1.5 4 8-3 1.5-4-8L5 22z" fill="#0d201c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-4px,-2px)', display: 'none' });
    root.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.display = 'block'; c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '34px', height: '34px', borderRadius: '50%', background: '#00ec97', zIndex: '2147483646', pointerEvents: 'none', animation: '__vp_tap 480ms cubic-bezier(.2,.7,.3,1) forwards' });
      root.appendChild(r);
      setTimeout(() => r.remove(), 520);
    }, true);
  };
  document.documentElement ? start() : document.addEventListener('DOMContentLoaded', start);
})();`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Everything the edit and the evidence record need, written after every change. */
export class Manifest {
  data: { startedAt: string; txs: { step: string; txHash: string; explorer: string; cam: string; at: string }[]; events: { name: string; detail?: unknown; at: string }[] } & Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    txs: [],
    events: [],
  };
  private readonly file = resolve(FOOTAGE, "manifest.json");
  set(key: string, value: unknown) {
    this.data[key] = value;
    this.save();
  }
  tx(step: string, txHash: string, explorer: string, cam: string) {
    this.data.txs.push({ step, txHash, explorer, cam, at: new Date().toISOString() });
    this.save();
  }
  event(name: string, detail?: unknown) {
    this.data.events.push({ name, detail, at: new Date().toISOString() });
    this.save();
  }
  private save() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

export class Camera {
  readonly dir: string;
  frames = 0;
  private constructor(
    readonly name: string,
    readonly page: Page,
    private readonly cdp: CDPSession,
  ) {
    this.dir = resolve(FOOTAGE, name);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(resolve(this.dir, "frames.tsv"), "frame\tcdp_ts\twall_ms\n");
  }

  /** Opens a 1920×1080 page and starts capturing. With an account id the wallet bridge signs for it. */
  static async open(browser: Browser, name: string, accountId?: string): Promise<Camera> {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    if (accountId) {
      const account = loadAccount(accountId);
      await page.exposeFunction("__veilE2EAccount", async () => accountId);
      await page.exposeFunction("__veilE2ESignMessage", async (json: string) => {
        const i = JSON.parse(json) as { message: string; recipient: string; nonceHex: string };
        const signed = await signMessage({ signerAccount: account, payload: { message: i.message, recipient: i.recipient, nonce: Buffer.from(i.nonceHex, "hex") } });
        return JSON.stringify({ accountId, publicKey: signed.publicKey.toString(), signature: Buffer.from(signed.signature).toString("base64") });
      });
      await page.exposeFunction("__veilE2ESendTx", async (json: string) => {
        const i = JSON.parse(json) as { receiverId: string; methodName: string; args: object; gas: string; depositYocto: string };
        const res = await account.signAndSendTransaction({
          receiverId: i.receiverId,
          actions: [actions.functionCall(i.methodName, i.args, BigInt(i.gas), BigInt(i.depositYocto))],
          waitUntil: "FINAL",
          throwOnFailure: false,
        });
        return txHashOf(res as never);
      });
    }
    const cdp = await ctx.newCDPSession(page);
    const cam = new Camera(name, page, cdp);
    cdp.on("Page.screencastFrame", (f) => {
      const i = cam.frames++;
      appendFileSync(resolve(cam.dir, "frames.tsv"), `${i}\t${f.metadata.timestamp}\t${Date.now()}\n`);
      writeFile(resolve(cam.dir, `${String(i).padStart(6, "0")}.png`), Buffer.from(f.data, "base64"), (e) => e && console.error(e));
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    return cam;
  }

  async close() {
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await wait(300);
    await this.page.context().close();
  }
}

export class Director {
  private pos = { x: 960, y: 640 };
  constructor(
    readonly cam: Camera,
    readonly manifest: Manifest,
  ) {}
  get page() {
    return this.cam.page;
  }
  /** Scene marker: the edit takes this camera's frames from this wall-clock time on. */
  mark(name: string, note?: string) {
    appendFileSync(MARKERS, `${JSON.stringify({ name, cam: this.cam.name, wall: Date.now(), note })}\n`);
  }
  hold(ms: number) {
    return wait(ms);
  }
  async goto(path: string, hold = 1200) {
    await this.page.goto(path, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
    await wait(hold);
  }
  /** Eased pointer travel to the element (slightly off-centre, like a hand). */
  async glide(target: Locator, offset = { x: 0, y: 0 }) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("glide: target has no box");
    const to = { x: box.x + box.width / 2 + offset.x, y: box.y + box.height / 2 + offset.y };
    const dist = Math.hypot(to.x - this.pos.x, to.y - this.pos.y);
    const steps = Math.max(10, Math.min(42, Math.round(dist / 26)));
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps);
      await this.page.mouse.move(this.pos.x + (to.x - this.pos.x) * t, this.pos.y + (to.y - this.pos.y) * t);
      await wait(14);
    }
    this.pos = to;
    await wait(140);
  }
  async click(target: Locator) {
    await this.glide(target);
    await target.click({ delay: 70 });
    await wait(320);
  }
  async type(target: Locator, text: string, delay = 36) {
    await this.click(target);
    // Replace, never append: some fields start with defaults (delivery 14 days, 1 revision).
    await target.fill("");
    await target.pressSequentially(text, { delay });
    await wait(280);
  }
  async fill(target: Locator, value: string) {
    await this.click(target);
    await target.fill(value);
    await wait(280);
  }
  async select(target: Locator, value: string) {
    await this.glide(target);
    await target.selectOption(value);
    await wait(320);
  }
  async check(target: Locator) {
    await this.glide(target);
    await target.check();
    await wait(280);
  }
  async scrollTo(target: Locator, hold = 900) {
    await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await wait(hold);
  }
  async scrollBy(dy: number, hold = 900) {
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
    await wait(hold);
  }

  /** Opens a TxAction, lets the viewer read the preview, signs, waits for chain confirmation. */
  async sign(label: string | RegExp, step: string): Promise<{ txHash: string; explorer: string }> {
    const dialog = this.page.getByRole("dialog");
    const signButton = dialog.getByRole("button", { name: "Sign with wallet" });
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.click(this.page.getByRole("button", { name: label }).first());
      if (await signButton.waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false)) break;
    }
    await expect(dialog.getByText("NEAR testnet (no monetary value)")).toBeVisible();
    await wait(1900);
    await this.click(signButton);
    await expect(dialog.getByText("Confirmed on chain")).toBeVisible({ timeout: 180_000 });
    await wait(2600);
    const href = (await dialog.getByRole("link", { name: /View on explorer/ }).getAttribute("href"))!;
    const txHash = href.split("/txns/")[1]!;
    this.manifest.tx(step, txHash, href, this.cam.name);
    return { txHash, explorer: href };
  }
  async closeDialog() {
    await this.click(this.page.getByRole("dialog").getByRole("button", { name: "Close" }));
  }
  /** Shows the real block explorer page for a transaction, then returns to the app. */
  async explorer(href: string, hold = 6500) {
    this.mark("explorer", href);
    await this.page.goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e: Error) => this.manifest.event("explorer page did not load", e.message));
    await this.page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await wait(hold);
    await this.page.goBack({ waitUntil: "load" }).catch(() => {});
    await wait(900);
  }
}
