/**
 * Shared steps for the testnet journeys (chain.spec.ts, chain-escrow.spec.ts). Wallet signatures
 * are produced in this Node process with the labelled test accounts' keys (~/.near-credentials)
 * through the guarded E2E wallet bridge; the server verifies everything against testnet RPC.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import { actions } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { loadAccount, rpc, txHashOf } from "../../../scripts/testnet/lib";
import { latestLink, signIn, sql, testEmail } from "./helpers";

export const NEAR = 10n ** 24n;
export type Journey = { step: string; txHash: string }[];

export async function walletPage(browser: Browser, accountId: string): Promise<Page> {
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
export async function signTx(page: Page, label: string | RegExp, step: string, journey: Journey): Promise<string> {
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

export async function bindWallet(page: Page, accountId: string) {
  await page.goto("/app/wallet");
  const bound = page.getByText(`Bound ${accountId}.`);
  const confirmMove = page.getByRole("button", { name: "Yes, continue" });
  const bindButton = page.getByRole("button", { name: "Bind this wallet" });
  // Two steps: connect (wallet popup), then bind (a separate click, so the signing popup is
  // user-initiated and not blocked by the browser).
  await expect(async () => {
    if (!(await bindButton.isVisible())) await page.getByRole("button", { name: "Connect wallet" }).click();
    await bindButton.click({ timeout: 10_000 });
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

export async function balance(accountId: string): Promise<bigint> {
  return BigInt((await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId })).amount);
}

export function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface Bidder {
  account: string;
  org: string;
  price: string;
  days: string;
  revs: string;
}

/**
 * Buyer signs in, creates an organisation, binds the wallet, drafts a request inviting the
 * bidders (deadline ~5 min ahead), publishes on chain; each bidder accepts the invitation,
 * binds a wallet and seals & commits a quote. Returns before the deadline.
 */
export async function openRequestWithBids(
  browser: Browser,
  journey: Journey,
  opts: { buyerAccount: string; buyerOrg: string; title: string; bidders: Bidder[]; reviewer?: string },
) {
  const buyer = await walletPage(browser, opts.buyerAccount);
  await signIn(buyer, testEmail("chain-buyer"));
  await buyer.goto("/app/onboarding");
  await buyer.getByText("I buy services").click();
  await buyer.getByLabel("Organisation name").fill(opts.buyerOrg);
  await buyer.getByRole("button", { name: "Create buyer organisation" }).click();
  await buyer.waitForURL("**/app");
  await bindWallet(buyer, opts.buyerAccount);

  await buyer.goto("/app/rfqs/new");
  await buyer.getByLabel("Title").fill(`${opts.title} ${Date.now().toString(36)}`);
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
  if (opts.reviewer) await buyer.getByLabel("Dispute reviewer (NEAR account)").fill(opts.reviewer);
  const emails = opts.bidders.map(() => testEmail("chain-sup"));
  for (const [i, email] of emails.entries()) {
    if (i > 0) await buyer.getByRole("button", { name: "Add supplier" }).click();
    await buyer.getByLabel(`Supplier e-mail ${i + 1}`, { exact: true }).fill(email);
  }
  const deadline = new Date(Date.now() + 5 * 60_000);
  deadline.setSeconds(0, 0);
  await buyer.getByLabel("Bid deadline").fill(localInput(deadline));
  await buyer.getByRole("button", { name: "Save & review" }).click();
  await buyer.waitForURL(new RegExp(`/app/rfqs/${rfqId}$`));
  await expect(buyer.getByText("All checks pass")).toBeVisible();

  await signTx(buyer, "Publish on NEAR testnet", "create_rfq (buyer publishes policy)", journey);
  await buyer.reload();
  await expect(buyer.getByText("Open for bids").first()).toBeVisible();
  const [rfqRow] = await sql<{ onchain_id: string }[]>`select onchain_id::text from rfqs where id = ${rfqId}`;
  expect(rfqRow!.onchain_id).toMatch(/^\d+$/);

  const supplierPages: Page[] = [];
  for (const [i, b] of opts.bidders.entries()) {
    const page = await walletPage(browser, b.account);
    supplierPages.push(page);
    const invite = await latestLink(emails[i]!, "/invite/");
    await signIn(page, emails[i]!, invite);
    await page.getByLabel("Company name").fill(b.org);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await page.waitForURL(`**/app/bids/${rfqId}`);
    await bindWallet(page, b.account);
    await page.goto(`/app/bids/${rfqId}`);
    await page.getByLabel(/Total price/).fill(b.price);
    await page.getByLabel("Delivery (days)").fill(b.days);
    await page.getByLabel("Revision rounds included").fill(b.revs);
    await page.getByLabel("Approach and scope").fill(`Manual and automated WCAG 2.2 AA review of every checkout step by ${b.org}.`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved and encrypted")).toBeVisible();
    await signTx(page, "Seal & commit bid", `commit_bid (${b.org})`, journey);
    await page.reload();
    await expect(page.getByText(/Sealed bid on chain \(v1\)/)).toBeVisible();
  }
  return { buyer, supplierPages, rfqId, onchainId: rfqRow!.onchain_id, deadline };
}

/** Waits until chain time has passed the deadline, closes bidding and checks every commitment. */
export async function closeAndVerify(buyer: Page, rfqId: string, deadline: Date, bids: number, journey: Journey) {
  const wait = deadline.getTime() - Date.now() + 20_000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Close bidding", "close_rfq", journey);
  await buyer.goto(`/app/rfqs/${rfqId}/compare`);
  await expect(buyer.getByText("Commitment verified")).toHaveCount(bids);
}
