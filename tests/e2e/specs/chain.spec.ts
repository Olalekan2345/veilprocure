/**
 * Journey A (+ on-chain parts of Journey C) against the REAL NEAR testnet contract.
 * Three isolated browser sessions (buyer, supplier A, supplier B) drive the actual UI. Wallet
 * signatures are produced in this Node process with the labelled test accounts' keys
 * (~/.near-credentials) through the guarded E2E wallet bridge — the only part not exercised is a
 * third-party wallet's own popup. Every transaction hash is recorded to .local/testnet-journey.json.
 * Runs only when .local/testnet-accounts.json exists (see scripts/testnet).
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { actions } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { loadAccount, MANIFEST, readManifest, rpc, txHashOf } from "../../../scripts/testnet/lib";
import { latestLink, signIn, sql, testEmail } from "./helpers";

const enabled = existsSync(MANIFEST);
const journey: { step: string; txHash: string }[] = [];
const NEAR = 10n ** 24n;

test.afterAll(async () => {
  if (journey.length) writeFileSync(resolve(import.meta.dirname, "../../../.local/testnet-journey.json"), JSON.stringify({ at: new Date().toISOString(), journey }, null, 2));
  await sql.end({ timeout: 5 });
});

async function walletPage(browser: Browser, accountId: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
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
  return page;
}

/** Clicks a TxAction, reviews the preview, signs, and waits for server-side chain confirmation. */
async function signTx(page: Page, label: string | RegExp, step: string): Promise<string> {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await page.getByRole("button", { name: label }).first().click();
    await expect(dialog.getByRole("button", { name: "Sign with wallet" })).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 60_000 });
  await expect(dialog.getByText("NEAR testnet (no monetary value)")).toBeVisible();
  await dialog.getByRole("button", { name: "Sign with wallet" }).click();
  await expect(dialog.getByText("Confirmed on chain")).toBeVisible({ timeout: 120_000 });
  const href = await dialog.getByRole("link", { name: /View on explorer/ }).getAttribute("href");
  const txHash = href!.split("/txns/")[1]!;
  journey.push({ step, txHash });
  await dialog.getByRole("button", { name: "Close" }).click();
  return txHash;
}

async function bindWallet(page: Page, accountId: string) {
  await page.goto("/app/wallet");
  const bound = page.getByText(`Bound ${accountId}.`);
  const confirmMove = page.getByRole("button", { name: "Yes, continue" });
  await expect(async () => {
    await page.getByRole("button", { name: /Connect & bind wallet|Bind a different wallet/ }).click();
    await expect(bound.or(confirmMove)).toBeVisible({ timeout: 30_000 });
  }).toPass({ timeout: 120_000 });
  // A wallet bound to another user (e.g. a previous test run) moves only after explicit
  // confirmation — the account-takeover guard. Confirm it and expect a fresh signature check.
  if (await confirmMove.isVisible()) {
    await expect(page.getByText("This wallet is bound to another VeilProcure user")).toBeVisible();
    await confirmMove.click();
  }
  await expect(bound).toBeVisible({ timeout: 60_000 });
}

async function balance(accountId: string): Promise<bigint> {
  return BigInt((await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId })).amount);
}

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

test.describe.configure({ mode: "serial" });

test.skip(!enabled, "testnet accounts not provisioned");

test("Journey A on NEAR testnet: publish → sealed bids → close → verify → award → escrow → payout", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const m = readManifest();
  const buyerEmail = testEmail("chain-buyer");
  const supAEmail = testEmail("chain-sup-a");
  const supBEmail = testEmail("chain-sup-b");

  // ---- Buyer: sign in, organisation, wallet binding (NEP-413 verified against testnet RPC)
  const buyer = await walletPage(browser, m.buyer);
  await signIn(buyer, buyerEmail);
  await buyer.goto("/app/onboarding");
  await buyer.getByText("I buy services").click();
  await buyer.getByLabel("Organisation name").fill("Test Chain Buyer (e2e)");
  await buyer.getByRole("button", { name: "Create buyer organisation" }).click();
  await buyer.waitForURL("**/app");
  await bindWallet(buyer, m.buyer);

  // ---- Buyer: draft with rules, two suppliers, short testnet windows
  await buyer.goto("/app/rfqs/new");
  await buyer.getByLabel("Title").fill(`E2E chain audit ${Date.now().toString(36)}`);
  await buyer.getByRole("button", { name: "Create draft" }).click();
  await buyer.waitForURL(/\/edit$/);
  const rfqId = buyer.url().split("/").at(-2)!;
  await buyer.getByLabel("Scope of work").fill("Audit the checkout flow against WCAG 2.2 AA and deliver a prioritised findings report.");
  await buyer.getByLabel("Deliverable 1", { exact: true }).fill("Findings report (PDF)");
  await buyer.getByLabel("Maximum price").fill("2000");
  await buyer.getByLabel("Max delivery (days)").fill("21");
  await buyer.getByRole("button", { name: "Add requirement" }).click();
  await buyer.getByLabel("Requirement 1", { exact: true }).fill("WCAG 2.2 AA audit experience");
  await buyer.getByLabel("Supplier acceptance window").selectOption("5");
  await buyer.getByLabel("Your review window").selectOption("5");
  await buyer.getByLabel("Supplier e-mail 1", { exact: true }).fill(supAEmail);
  await buyer.getByRole("button", { name: "Add supplier" }).click();
  await buyer.getByLabel("Supplier e-mail 2", { exact: true }).fill(supBEmail);
  const deadline = new Date(Date.now() + 5 * 60_000);
  deadline.setSeconds(0, 0);
  await buyer.getByLabel("Bid deadline").fill(localInput(deadline));
  await buyer.getByRole("button", { name: "Save & review" }).click();
  await buyer.waitForURL(new RegExp(`/app/rfqs/${rfqId}$`));
  await expect(buyer.getByText("All checks pass")).toBeVisible();

  // ---- Publish: policy hash + invite leaves on chain
  await signTx(buyer, "Publish on NEAR testnet", "create_rfq (buyer publishes policy)");
  await buyer.reload();
  await expect(buyer.getByText("Open for bids").first()).toBeVisible();
  const [rfqRow] = await sql<{ onchain_id: string; policy_hash: string }[]>`select onchain_id::text, policy_hash from rfqs where id = ${rfqId}`;
  expect(rfqRow!.onchain_id).toMatch(/^\d+$/);

  // ---- Suppliers: accept invitation (only the invited e-mail), bind wallet, seal & commit
  const quotes = [
    { email: supAEmail, account: m.supplierA, org: "Test Supplier A (e2e)", price: "1500", days: "14", revs: "2" },
    { email: supBEmail, account: m.supplierB, org: "Test Supplier B (e2e)", price: "1800", days: "10", revs: "1" },
  ];
  const supplierPages: Page[] = [];
  for (const q of quotes) {
    const page = await walletPage(browser, q.account);
    supplierPages.push(page);
    const invite = await latestLink(q.email, "/invite/");
    await signIn(page, q.email, invite);
    await page.getByLabel("Company name").fill(q.org);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(`**/app/bids/${rfqId}`);
    await bindWallet(page, q.account);
    await page.goto(`/app/bids/${rfqId}`);
    await page.getByLabel(/Total price/).fill(q.price);
    await page.getByLabel("Delivery (days)").fill(q.days);
    await page.getByLabel("Revision rounds included").fill(q.revs);
    await page.getByLabel("Approach and scope").fill(`Manual and automated WCAG 2.2 AA review of every checkout step by ${q.org}.`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved and encrypted")).toBeVisible();
    await signTx(page, "Seal & commit bid", `commit_bid (${q.org})`);
    await page.reload();
    await expect(page.getByText(/Sealed bid on chain \(v1\)/)).toBeVisible();
  }

  // ---- Before the deadline: buyer is blind, competitor cannot open the buyer's request
  await buyer.goto(`/app/rfqs/${rfqId}/compare`);
  await expect(buyer.getByText("Quotes stay sealed until bidding has closed on chain.")).toBeVisible();
  const competitor = await supplierPages[1]!.goto(`/app/rfqs/${rfqId}`);
  expect(competitor?.status()).toBe(404);

  // ---- Wait for chain time to pass the deadline, then close on chain
  const wait = deadline.getTime() - Date.now() + 20_000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Close bidding", "close_rfq");

  // ---- After close: both commitments recomputed and verified against chain
  await buyer.goto(`/app/rfqs/${rfqId}/compare`);
  await expect(buyer.getByText("Commitment verified")).toHaveCount(2);
  await expect(buyer.getByRole("cell", { name: "1" }).first()).toBeVisible();

  // ---- Award rank 1 (0.5 testnet NEAR), fund escrow
  await buyer.getByLabel("Escrow amount (testnet NEAR)").fill("0.5");
  await buyer.getByLabel("Agreed work (single milestone)").fill("WCAG 2.2 AA audit of the checkout flow with prioritised findings report.");
  await signTx(buyer, "Sign award", "award_supplier");
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Fund escrow", "fund_award (0.5 NEAR principal)");

  // ---- On-chain attacker checks (Journey C): outsider and the losing supplier are rejected
  const outsider = loadAccount(m.outsider);
  const onchainId = rfqRow!.onchain_id;
  const attack = await outsider.signAndSendTransaction({ receiverId: m.contract, actions: [actions.functionCall("approve_release", { rfq_id: onchainId }, 100n * 10n ** 12n, 1n)], waitUntil: "FINAL", throwOnFailure: false });
  expect(JSON.stringify((attack as { status: unknown }).status)).toContain("VP_NOT_BUYER");
  journey.push({ step: "attack: outsider approve_release (rejected VP_NOT_BUYER)", txHash: txHashOf(attack as never) });
  const loser = loadAccount(m.supplierB);
  const steal = await loser.signAndSendTransaction({ receiverId: m.contract, actions: [actions.functionCall("accept_award", { rfq_id: onchainId }, 30n * 10n ** 12n, 1n)], waitUntil: "FINAL", throwOnFailure: false });
  expect(JSON.stringify((steal as { status: unknown }).status)).toContain("VP_NOT_SUPPLIER");
  journey.push({ step: "attack: losing supplier accept_award (rejected VP_NOT_SUPPLIER)", txHash: txHashOf(steal as never) });

  // ---- Winning supplier (A, cheapest): accept and anchor delivery
  const supA = supplierPages[0]!;
  await supA.goto(`/app/bids/${rfqId}`);
  await signTx(supA, "Accept award", "accept_award (supplier A)");
  await supA.reload();
  await supA.getByLabel("What did you deliver?").fill("Delivered the WCAG 2.2 AA findings report with 23 prioritised issues and remediation notes.");
  await signTx(supA, "Anchor delivery on chain", "submit_delivery (evidence hash)");

  // ---- Buyer releases; supplier balance increases by exactly the principal
  const before = await balance(m.supplierA);
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await expect(buyer.getByText("Delivery evidence", { exact: true })).toBeVisible();
  await signTx(buyer, "Approve & release payment", "approve_release → transfer → on_payment_result");
  const after = await balance(m.supplierA);
  expect(after - before).toBe(NEAR / 2n);

  // ---- No double payout: a second release by the buyer is rejected by the contract
  const again = await loadAccount(m.buyer).signAndSendTransaction({ receiverId: m.contract, actions: [actions.functionCall("approve_release", { rfq_id: onchainId }, 100n * 10n ** 12n, 1n)], waitUntil: "FINAL", throwOnFailure: false });
  expect(JSON.stringify((again as { status: unknown }).status)).toMatch(/VP_NO_AWARD|VP_WRONG_AWARD_STATE/);
  journey.push({ step: "attack: second approve_release after payout (rejected)", txHash: txHashOf(again as never) });

  // ---- Records reflect chain truth
  await buyer.reload();
  await expect(buyer.getByText("Paid").first()).toBeVisible();
  const [award] = await sql<{ status: string }[]>`select status from awards where rfq_id = ${rfqId}`;
  expect(award!.status).toBe("paid");
  const txs = await sql<{ n: number }[]>`select count(*)::int as n from escrow_transactions where rfq_id = ${rfqId} and status = 'confirmed'`;
  expect(txs[0]!.n).toBeGreaterThanOrEqual(5);
});
