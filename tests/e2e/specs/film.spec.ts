/**
 * Films the product explainer's footage: one real procurement on NEAR testnet, driven at human
 * pace through the UI by three cameras (buyer, supplier A, supplier B). Opt-in:
 *   VEIL_FILM=dry  — rehearsal, stops before anything is signed on chain
 *   VEIL_FILM=1    — the real journey (approved by the project owner on 2026-11-11), signing with
 *                    the labelled test accounts and running one attested AI evaluation
 * Output: .local/video/footage/ (frames per camera, markers.jsonl, manifest.json, worker log).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { actions } from "near-api-js";
import { loadAccount, MANIFEST, readManifest, txHashOf } from "../../../scripts/testnet/lib";
import { balance, localInput, NEAR } from "./chain-helpers";
import { Camera, Director, FOOTAGE, Manifest } from "./film-capture";
import { latestLink, sql } from "./helpers";

const MODE = process.env.VEIL_FILM;
test.skip(!MODE, "filming is opt-in (VEIL_FILM=1 | dry)");
test.skip(!existsSync(MANIFEST), "testnet accounts not provisioned");
const DRY = MODE === "dry";
const root = resolve(import.meta.dirname, "../../..");
const ASSETS = resolve(root, ".local/video/assets");
// Fresh addresses every run: a reused address already has an organisation, which changes the screens.
const RUN = `.${DRY ? "dry" : "r"}${Date.now().toString(36).slice(-4)}`;
const BUYER = { email: `buyer${RUN}@northwind-studio.test`, org: "Northwind Studio (test buyer)" };
// Priced in testnet NEAR, so the escrow funded later is exactly the winning quote.
const SUP_A = { email: `bids${RUN}@clearline-a11y.test`, org: "Clearline Accessibility (test supplier)", price: "1.2", days: "14", revs: "2" };
const SUP_B = { email: `quotes${RUN}@harbor-digital.test`, org: "Harbor Digital (test supplier)", price: "1.5", days: "10", revs: "1" };
const ESCROW_NEAR = "1.2";
const ESCROW_YOCTO = (NEAR * 12n) / 10n;

/** Cosmetic camera moves must never strand a half-finished escrow: log and carry on. */
async function soft(manifest: Manifest, what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    manifest.event(`soft step skipped: ${what}`, (e as Error).message.split("\n")[0]);
  }
}

/** Compiles every route once so the camera never waits on the development compiler. */
async function warmRoutes() {
  const z = "00000000-0000-0000-0000-000000000000";
  const paths = ["/", "/signin", "/auth/confirm?token=x", "/app", "/app/onboarding", "/app/wallet", "/app/rfqs", "/app/rfqs/new", `/app/rfqs/${z}`, `/app/rfqs/${z}/edit`, `/app/rfqs/${z}/compare`, `/app/rfqs/${z}/ai-evidence`, "/app/bids", `/app/bids/${z}`, "/app/transactions", "/app/activity", "/app/team", "/app/settings", "/app/notifications", "/invite/x", "/security"];
  for (const p of paths) await fetch(`http://localhost:3000${p}`).catch(() => {});
}

/** Passwordless sign-in on camera. The development mailbox supplies the one-time link. */
async function signInOnCamera(d: Director, email: string, next: string, navigate = true) {
  await sql`delete from rate_limits`;
  if (navigate) await d.goto(`/signin?next=${encodeURIComponent(next)}`);
  await d.hold(900);
  await d.type(d.page.getByLabel("Work e-mail"), email);
  await d.click(d.page.getByRole("button", { name: "Email me a sign-in link" }));
  await expect(d.page.getByText("E-mail delivery is not configured on this server")).toBeVisible();
  await d.hold(500);
  const link = await latestLink(email, "/auth/confirm");
  d.mark("confirm-link");
  await d.goto(link, 1400);
  await d.click(d.page.getByRole("button", { name: "Continue to VeilProcure" }));
  await d.page.waitForURL((u) => !u.pathname.startsWith("/auth"));
  await d.hold(1400);
}

/** NEP-413 wallet binding on camera (the bridge signs the challenge for the labelled account). */
async function bindOnCamera(d: Director, accountId: string) {
  await d.goto("/app/wallet", 1800);
  d.mark("wallet");
  const page = d.page;
  const bound = page.getByText(`Bound ${accountId}.`);
  const confirmMove = page.getByRole("button", { name: "Yes, continue" });
  const bindButton = page.getByRole("button", { name: "Bind this wallet" });
  for (let attempt = 0; attempt < 4; attempt++) {
    await d.click(page.getByRole("button", { name: "Connect wallet" }));
    if (await bindButton.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) break;
  }
  await d.hold(1000);
  await d.click(bindButton);
  await expect(bound.or(confirmMove)).toBeVisible({ timeout: 60_000 });
  if (await confirmMove.isVisible()) {
    // Bound to a user from an earlier test run: the account-takeover guard asks first.
    d.mark("wallet-rebind-confirm");
    await d.click(confirmMove);
  }
  await expect(bound).toBeVisible({ timeout: 60_000 });
  await d.hold(1600);
  // Reload so the sidebar and binding history show the bound account.
  await d.page.reload({ waitUntil: "networkidle" }).catch(() => {});
  await d.hold(2000);
}

// Fail fast instead of waiting out the whole test on a missing element.
test.use({ actionTimeout: 45_000, navigationTimeout: 60_000 });

test("film: one complete procurement on NEAR testnet", async ({ browser }) => {
  test.setTimeout(55 * 60_000);
  rmSync(FOOTAGE, { recursive: true, force: true });
  mkdirSync(FOOTAGE, { recursive: true });
  const m = readManifest();
  const manifest = new Manifest();
  manifest.set("mode", DRY ? "dry" : "full");
  manifest.set("accounts", { contract: m.contract, buyer: m.buyer, supplierA: m.supplierA, supplierB: m.supplierB, outsider: m.outsider });
  manifest.set("people", { buyer: BUYER, supplierA: SUP_A, supplierB: SUP_B });
  await warmRoutes();

  // ---------------------------------------------------------------- buyer: site, sign-in, set-up
  const buyerCam = await Camera.open(browser, "buyer", m.buyer);
  const b = new Director(buyerCam, manifest);
  b.mark("S2 landing");
  await b.goto("/", 2800);
  await b.scrollBy(850, 1800);
  await b.scrollBy(900, 1800);
  await b.scrollBy(1000, 1800);
  await b.scrollTo(b.page.getByRole("link", { name: "Get started" }).first(), 800);
  b.mark("S3 signin");
  await b.click(b.page.getByRole("link", { name: "Get started" }).first());
  await b.page.waitForURL(/\/signin/);
  await signInOnCamera(b, BUYER.email, "/app/onboarding", false);
  b.mark("S3 onboarding");
  await b.hold(1200);
  await b.click(b.page.getByText("I buy services"));
  await b.type(b.page.getByLabel("Organisation name"), BUYER.org);
  await b.click(b.page.getByRole("button", { name: "Create buyer organisation" }));
  await b.page.waitForURL("**/app");
  b.mark("S3 dashboard-empty");
  await b.hold(2800);
  await b.scrollBy(500, 1400);
  await bindOnCamera(b, m.buyer);
  b.mark("S3 team");
  await b.goto("/app/team", 2600);
  await b.scrollBy(450, 1400);
  b.mark("S3 settings");
  await b.goto("/app/settings", 2400);

  // ---------------------------------------------------------------- buyer: the request
  b.mark("S4 new-request");
  await b.goto("/app/rfqs/new", 1600);
  await b.type(b.page.getByLabel("Title"), "Checkout accessibility audit (test request)");
  await b.click(b.page.getByRole("button", { name: "Create draft" }));
  await b.page.waitForURL(/\/edit$/);
  const rfqId = b.page.url().split("/").at(-2)!;
  manifest.set("rfqId", rfqId);
  b.mark("S4 editor");
  await b.hold(1400);
  await b.type(b.page.getByLabel("Scope of work"), "Audit our checkout flow against WCAG 2.2 AA and deliver a prioritised findings report with remediation notes.", 22);
  await b.type(b.page.getByLabel("Deliverable 1", { exact: true }), "Findings report (PDF)");
  b.mark("S4 rules");
  await b.select(b.page.getByLabel("Currency"), "NEAR");
  await b.type(b.page.getByLabel("Maximum price"), "2");
  await b.type(b.page.getByLabel("Max delivery (days)"), "21");
  await b.click(b.page.getByRole("button", { name: "Add requirement" }));
  await b.type(b.page.getByLabel("Requirement 1", { exact: true }), "WCAG 2.2 AA audit experience");
  b.mark("S4 weights");
  await soft(manifest, "scroll to weights", () => b.scrollTo(b.page.getByText("Scoring weights", { exact: true }), 2200));
  await b.select(b.page.getByLabel("Supplier acceptance window"), "5");
  await b.select(b.page.getByLabel("Your review window"), "5");
  b.mark("S4 suppliers");
  await b.type(b.page.getByLabel("Supplier e-mail 1", { exact: true }), SUP_A.email);
  await b.click(b.page.getByRole("button", { name: "Add supplier" }));
  await b.type(b.page.getByLabel("Supplier e-mail 2", { exact: true }), SUP_B.email);
  // Filming both suppliers at a readable pace takes ~10 minutes; leave room so no bid arrives late.
  const deadline = new Date(Date.now() + 18 * 60_000);
  deadline.setSeconds(0, 0);
  manifest.set("deadline", deadline.toISOString());
  b.mark("S4 deadline");
  await soft(manifest, "scroll to deadline", () => b.scrollTo(b.page.getByLabel("Bid deadline"), 900));
  await b.fill(b.page.getByLabel("Bid deadline"), localInput(deadline));
  await b.hold(900);
  b.mark("S4 review");
  await b.click(b.page.getByRole("button", { name: "Save & review" }));
  await b.page.waitForURL(new RegExp(`/app/rfqs/${rfqId}$`));
  await expect(b.page.getByText("All checks pass")).toBeVisible();
  await b.hold(2800);
  if (DRY) {
    manifest.set("stoppedAt", "before publish (dry run)");
    manifest.set("frames", { buyer: buyerCam.frames });
    await buyerCam.close();
    return;
  }

  // ---------------------------------------------------------------- publish: policy hash on chain
  b.mark("S4 publish");
  const publish = await b.sign("Publish on NEAR testnet", "create_rfq — buyer publishes the policy hash and one invite leaf per supplier");
  await b.closeDialog();
  await b.page.reload();
  await expect(b.page.getByText("Open for bids").first()).toBeVisible();
  const [rfqRow] = await sql<{ onchain_id: string; policy_hash: string }[]>`select onchain_id::text, policy_hash from rfqs where id = ${rfqId}`;
  manifest.set("onchainId", rfqRow!.onchain_id);
  manifest.set("policyHash", rfqRow!.policy_hash);
  const explorerBase = publish.explorer.split("/txns/")[0]!;
  await b.hold(2200);
  await b.scrollBy(650, 2400);

  // ---------------------------------------------------------------- suppliers: sealed quotes
  async function supplier(name: string, s: typeof SUP_A, account: string, attach: boolean) {
    const cam = await Camera.open(browser, name, account);
    const d = new Director(cam, manifest);
    const invite = await latestLink(s.email, "/invite/");
    d.mark(`S5 ${name} invite-signin`);
    await signInOnCamera(d, s.email, invite);
    d.mark(`S5 ${name} invitation`);
    await d.hold(1600);
    const company = d.page.getByLabel("Company name");
    if (await company.isVisible()) await d.type(company, s.org);
    else manifest.event(`${name} already had an organisation; accepted with it`);
    await d.click(d.page.getByRole("button", { name: "Accept invitation" }));
    await d.page.waitForURL(`**/app/bids/${rfqId}`);
    await d.hold(1800);
    await bindOnCamera(d, account);
    d.mark(`S5 ${name} quote`);
    await d.goto(`/app/bids/${rfqId}`, 2000);
    await d.scrollBy(320, 1200);
    await d.type(d.page.getByLabel(/Total price/), s.price);
    await d.type(d.page.getByLabel("Delivery (days)"), s.days);
    await d.type(d.page.getByLabel("Revision rounds included"), s.revs);
    await d.type(d.page.getByLabel("Approach and scope"), `Manual review with assistive technology plus automated scans of every checkout step, by ${s.org}.`, 22);
    if (attach) await d.type(d.page.getByLabel("Assumptions"), "Staging access and a test account are provided.", 24);
    await d.check(d.page.getByRole("checkbox").first());
    await d.click(d.page.getByRole("button", { name: "Save draft" }));
    await expect(d.page.getByText("Draft saved and encrypted")).toBeVisible();
    await d.hold(1300);
    if (attach) {
      d.mark(`S5 ${name} attachment`);
      await soft(manifest, "quote attachment", async () => {
        await d.glide(d.page.getByText("Attach a file", { exact: false }));
        await d.page.locator('input[type="file"]').first().setInputFiles(resolve(ASSETS, "Clearline-proposal-TEST.pdf"));
        await expect(d.page.getByText("Clearline-proposal-TEST.pdf").first()).toBeVisible({ timeout: 30_000 });
        await d.hold(1800);
      });
    }
    // Never sign a bid the contract would reject as late.
    if (deadline.getTime() - Date.now() < 90_000) throw new Error(`deadline too close to commit ${s.org}'s bid; not signing`);
    d.mark(`S5 ${name} commit`);
    await d.sign("Seal & commit bid", `commit_bid — ${s.org} seals its quote (salted hash on chain)`);
    await d.closeDialog();
    await d.page.reload();
    await expect(d.page.getByText(/Sealed bid on chain \(v1\)/)).toBeVisible();
    await d.hold(2600);
    return d;
  }
  const a = await supplier("supplierA", SUP_A, m.supplierA, true);
  const sb = await supplier("supplierB", SUP_B, m.supplierB, false);

  // ---------------------------------------------------------------- the confidentiality boundary
  sb.mark("S5 competitor-404");
  await sb.page.goto(`/app/rfqs/${rfqId}`).catch(() => {});
  await sb.hold(2600);
  await sb.goto(`/app/bids/${rfqId}`, 1600);
  b.mark("S5 buyer-blind");
  await b.goto(`/app/rfqs/${rfqId}/compare`, 1200);
  await expect(b.page.getByText("Quotes stay sealed until bidding has closed on chain.")).toBeVisible();
  await b.hold(2800);

  // ---------------------------------------------------------------- deadline, close, verify
  const remaining = deadline.getTime() - Date.now() + 25_000;
  manifest.event("waiting for the chain-time deadline", { ms: remaining });
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  b.mark("S6 close");
  await b.goto(`/app/rfqs/${rfqId}`, 1600);
  await b.sign("Close bidding", "close_rfq — after the chain-time deadline");
  await b.closeDialog();
  b.mark("S6 verify");
  await b.goto(`/app/rfqs/${rfqId}/compare`, 2200);
  await expect(b.page.getByText("Commitment verified")).toHaveCount(2);
  await soft(manifest, "scroll to integrity", () => b.scrollTo(b.page.getByText("Commitment verified").first(), 2800));

  // ---------------------------------------------------------------- evaluation: rules, then AI
  b.mark("S7 ranking");
  await soft(manifest, "scroll to ranking", () => b.scrollTo(b.page.getByText("Ranking", { exact: true }).first(), 2600));
  await b.scrollBy(520, 2200);
  b.mark("S7 request-ai");
  await b.click(b.page.getByRole("button", { name: /^(Request AI notes|Request again)$/ }));
  await expect(b.page.getByText("Queued for the evaluation worker.")).toBeVisible();
  await b.hold(1600);
  manifest.event("worker run start");
  try {
    const log = execSync("pnpm --filter @veilprocure/worker once", { cwd: root, timeout: 300_000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    writeFileSync(resolve(FOOTAGE, "worker-once.log"), log);
  } catch (e) {
    manifest.event("worker run failed", (e as Error).message);
  }
  const [job] = await sql`
    select j.id, j.status, j.error_code, j.error_message, e.verified, e.model_id, e.signature_kind, e.signing_address,
           e.request_sha256, e.response_sha256, e.gateway_quote_sha256, e.model_quote_sha256, e.tcb_status, e.gpu_verdict, e.failure_reasons
    from evaluation_jobs j left join attestation_evidence e on e.evaluation_job_id = j.id
    where j.rfq_id = ${rfqId} and j.kind = 'ai' order by j.created_at desc limit 1`;
  manifest.set("aiJob", job ?? null);
  b.mark("S7 ai-notes");
  await b.page.reload();
  await b.hold(1600);
  if (job?.status === "succeeded" && job.verified) {
    await soft(manifest, "AI notes and evidence on camera", async () => {
      const notes = b.page.getByText("AI notes · recommendation only").first();
      await expect(notes).toBeVisible();
      await b.scrollTo(notes, 1800);
      await b.scrollBy(420, 3200);
      b.mark("S7 ai-evidence");
      await b.click(b.page.getByRole("link", { name: "View evidence" }).first());
      await expect(b.page.getByText(/VERIFIED under policy vp-nearai-1/)).toBeVisible();
      await b.hold(2800);
      await b.scrollBy(620, 2200);
      await b.scrollBy(720, 2200);
    });
    await b.goto(`/app/rfqs/${rfqId}/compare`, 1600);
  } else {
    manifest.event("AI notes not verified in this run; the film must use the dated 2026-10-30 record");
  }
  b.mark("S7 record-evaluation");
  await soft(manifest, "record evaluation", async () => {
    await b.click(b.page.getByRole("button", { name: "Record this evaluation" }));
    await expect(b.page.getByText("Saved to the audit trail.")).toBeVisible();
    await b.hold(1400);
  });

  // ---------------------------------------------------------------- award and escrow
  b.mark("S8 award");
  await soft(manifest, "scroll to award form", () => b.scrollTo(b.page.getByLabel("Escrow amount (testnet NEAR)"), 1400));
  await b.type(b.page.getByLabel("Escrow amount (testnet NEAR)"), ESCROW_NEAR);
  await b.type(b.page.getByLabel("Agreed work (single milestone)"), "WCAG 2.2 AA audit of the checkout flow with a prioritised findings report.", 22);
  await b.sign("Sign award", "award_supplier — buyer awards Clearline (rank 1)");
  await b.closeDialog();
  b.mark("S8 fund");
  await b.goto(`/app/rfqs/${rfqId}`, 2000);
  const fund = await b.sign("Fund escrow", `fund_award — ${ESCROW_NEAR} testnet NEAR attached; held by the contract`);
  await b.closeDialog();
  await b.page.reload();
  await b.hold(2400);
  void fund;

  // ---------------------------------------------------------------- spending controls (raw calls)
  b.mark("S9 attacks");
  const onchainId = rfqRow!.onchain_id;
  const call = (acct: string, method: string, tgas: bigint) =>
    loadAccount(acct).signAndSendTransaction({ receiverId: m.contract, actions: [actions.functionCall(method, { rfq_id: onchainId }, tgas * 10n ** 12n, 1n)], waitUntil: "FINAL", throwOnFailure: false });
  const attack1 = await call(m.outsider, "approve_release", 100n);
  expect(JSON.stringify((attack1 as { status: unknown }).status)).toContain("VP_NOT_BUYER");
  manifest.tx("attack — outsider calls approve_release: rejected VP_NOT_BUYER", txHashOf(attack1 as never), `${explorerBase}/txns/${txHashOf(attack1 as never)}`, "rpc");
  const attack2 = await call(m.supplierB, "accept_award", 30n);
  expect(JSON.stringify((attack2 as { status: unknown }).status)).toContain("VP_NOT_SUPPLIER");
  manifest.tx("attack — losing supplier calls accept_award: rejected VP_NOT_SUPPLIER", txHashOf(attack2 as never), `${explorerBase}/txns/${txHashOf(attack2 as never)}`, "rpc");

  // ---------------------------------------------------------------- acceptance, delivery, release
  a.mark("S9 accept");
  await a.goto(`/app/bids/${rfqId}`, 2200);
  await a.scrollBy(420, 1400);
  await a.sign("Accept award", "accept_award — Clearline accepts the funded award");
  await a.closeDialog();
  await a.page.reload();
  await a.hold(1600);
  a.mark("S9 delivery");
  await soft(manifest, "scroll to delivery", () => a.scrollTo(a.page.getByLabel("What did you deliver?"), 1200));
  await a.type(a.page.getByLabel("What did you deliver?"), "Delivered the findings report (test deliverable) with prioritised issues and remediation notes.", 22);
  await soft(manifest, "delivery attachment", async () => {
    await a.glide(a.page.getByText("Attach a file", { exact: false }));
    await a.page.locator('input[type="file"]').first().setInputFiles(resolve(ASSETS, "Clearline-findings-report-TEST.pdf"));
    await expect(a.page.getByText("Clearline-findings-report-TEST.pdf").first()).toBeVisible({ timeout: 30_000 });
    await a.hold(1600);
  });
  await a.sign("Anchor delivery on chain", "submit_delivery — hash of the delivery evidence anchored");
  await a.closeDialog();

  const before = await balance(m.supplierA);
  b.mark("S9 release");
  await b.goto(`/app/rfqs/${rfqId}`, 2000);
  await expect(b.page.getByText("Delivery evidence", { exact: true })).toBeVisible();
  await soft(manifest, "scroll to delivery evidence", () => b.scrollTo(b.page.getByText("Delivery evidence", { exact: true }), 2400));
  const release = await b.sign("Approve & release payment", "approve_release → transfer → on_payment_result — contract pays Clearline");
  await b.closeDialog();
  const after = await balance(m.supplierA);
  manifest.set("supplierBalance", { account: m.supplierA, beforeYocto: before.toString(), afterYocto: after.toString(), deltaNear: Number(((after - before) * 1000n) / NEAR) / 1000 });
  expect(after - before).toBe(ESCROW_YOCTO);
  void release;
  const again = await call(m.buyer, "approve_release", 100n);
  expect(JSON.stringify((again as { status: unknown }).status)).toMatch(/VP_NO_AWARD|VP_WRONG_AWARD_STATE/);
  manifest.tx("attack — buyer calls approve_release a second time: rejected (no double payout)", txHashOf(again as never), `${explorerBase}/txns/${txHashOf(again as never)}`, "rpc");

  // ---------------------------------------------------------------- records
  b.mark("S10 paid");
  await b.page.reload();
  await expect(b.page.getByText("Paid").first()).toBeVisible();
  await b.hold(2200);
  await soft(manifest, "scroll to history", async () => {
    await b.scrollTo(b.page.getByText("History", { exact: true }).first(), 2600);
    await b.scrollBy(420, 1600);
  });
  b.mark("S10 transactions");
  await b.goto("/app/transactions", 2600);
  await b.scrollBy(420, 1600);
  b.mark("S10 activity");
  await b.goto("/app/activity", 2600);
  b.mark("S10 dashboard");
  await b.goto("/app", 3200);
  a.mark("S10 supplier-dashboard");
  await a.goto("/app", 2800);
  b.mark("S10 security");
  await b.goto("/security", 2600);
  await b.scrollBy(760, 1800);
  const [award] = await sql<{ status: string }[]>`select status from awards where rfq_id = ${rfqId}`;
  manifest.set("awardStatus", award!.status);
  manifest.set("frames", { buyer: buyerCam.frames, supplierA: a.cam.frames, supplierB: sb.cam.frames });
  manifest.set("finishedAt", new Date().toISOString());
  await Promise.all([buyerCam.close(), a.cam.close(), sb.cam.close()]);
  expect(award!.status).toBe("paid");
});
