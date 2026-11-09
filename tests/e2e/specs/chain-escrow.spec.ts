/**
 * Journey B against the REAL NEAR testnet contract: the escrow paths other than a plain release,
 * on one request over three award rounds (every refund returns the request to "closed"):
 *   1. award A → fund → A declines → the contract refunds the buyer;
 *   2. award B → fund → B accepts → buyer requests cancellation → B approves → refund;
 *   3. award A → fund → accept → deliver → buyer opens a dispute → the agreed reviewer (a third
 *      account acting on chain, outside the app, as reviewers do) releases to the supplier.
 * Each refund or release is triggered by the *other* party's transaction, so the receiver's balance
 * must rise by exactly the principal. Hashes go to .local/testnet-escrow-journey.json.
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { actions } from "near-api-js";
import { loadAccount, MANIFEST, readManifest, txHashOf } from "../../../scripts/testnet/lib";
import { balance, closeAndVerify, NEAR, openRequestWithBids, signTx, type Journey } from "./chain-helpers";
import { sql } from "./helpers";

const root = resolve(import.meta.dirname, "../../..");
const journey: Journey = [];
const PRINCIPAL = NEAR / 5n; // 0.2 testnet NEAR per round
const SUP_A = "Test Escrow Supplier A (e2e)";
const SUP_B = "Test Escrow Supplier B (e2e)";

test.afterAll(async () => {
  if (journey.length) writeFileSync(resolve(root, ".local/testnet-escrow-journey.json"), JSON.stringify({ at: new Date().toISOString(), journey }, null, 2));
});

test.skip(!existsSync(MANIFEST), "testnet accounts not provisioned");

async function awardTo(buyer: Page, rfqId: string, org: string, round: number) {
  await buyer.goto(`/app/rfqs/${rfqId}/compare`);
  const value = await buyer.locator("#award-quote option", { hasText: org }).getAttribute("value");
  await buyer.getByLabel("Eligible quote").selectOption(value!);
  await buyer.getByLabel("Escrow amount (testnet NEAR)").fill("0.2");
  await buyer.getByLabel("Agreed work (single milestone)").fill(`Round ${round}: WCAG 2.2 AA audit of the checkout flow with prioritised findings report.`);
  const reason = buyer.getByLabel("Reason for choosing a lower-ranked quote");
  if (await reason.isVisible()) await reason.fill("Escrow test: shorter delivery time for this round.");
  await signTx(buyer, "Sign award", `award_supplier round ${round} → ${org}`, journey);
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Fund escrow", `fund_award round ${round} (0.2 NEAR principal)`, journey);
}

async function awardStatus(rfqId: string, round: number): Promise<string | undefined> {
  const [row] = await sql<{ status: string }[]>`select status::text from awards where rfq_id = ${rfqId} and round = ${round}`;
  return row?.status;
}

test("Journey B on NEAR testnet: decline refund → mutual cancellation refund → dispute resolved by reviewer", async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const m = readManifest();
  const { buyer, supplierPages, rfqId, onchainId, deadline } = await openRequestWithBids(browser, journey, {
    buyerAccount: m.buyer,
    buyerOrg: "Test Escrow Buyer (e2e)",
    title: "E2E escrow paths",
    reviewer: m.outsider,
    bidders: [
      { account: m.supplierA, org: SUP_A, price: "1500", days: "14", revs: "2" },
      { account: m.supplierB, org: SUP_B, price: "1800", days: "10", revs: "1" },
    ],
  });
  const [supA, supB] = supplierPages as [Page, Page];
  await closeAndVerify(buyer, rfqId, deadline, 2, journey);

  // ---- Round 1: supplier A declines a funded award → full principal back to the buyer
  await awardTo(buyer, rfqId, SUP_A, 1);
  const beforeDecline = await balance(m.buyer);
  await supA.goto(`/app/bids/${rfqId}`);
  await signTx(supA, "Decline award", "decline_award round 1 → refund → on_refund_result", journey);
  expect((await balance(m.buyer)) - beforeDecline).toBe(PRINCIPAL);
  await expect.poll(() => awardStatus(rfqId, 1)).toBe("refunded");

  // ---- Round 2: accepted award cancelled by mutual agreement → full principal back to the buyer
  await awardTo(buyer, rfqId, SUP_B, 2);
  await supB.goto(`/app/bids/${rfqId}`);
  await signTx(supB, "Accept award", "accept_award round 2 (supplier B)", journey);
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Request cancellation", "request_cancel round 2 (buyer)", journey);
  const beforeCancel = await balance(m.buyer);
  await supB.goto(`/app/bids/${rfqId}`);
  await signTx(supB, "Approve cancellation", "approve_cancel round 2 (supplier B) → refund → on_refund_result", journey);
  expect((await balance(m.buyer)) - beforeCancel).toBe(PRINCIPAL);
  await expect.poll(() => awardStatus(rfqId, 2)).toBe("refunded");

  // ---- Round 3: delivered work disputed; only the agreed reviewer can decide it
  await awardTo(buyer, rfqId, SUP_A, 3);
  await supA.goto(`/app/bids/${rfqId}`);
  await signTx(supA, "Accept award", "accept_award round 3 (supplier A)", journey);
  await supA.reload();
  await supA.getByLabel("What did you deliver?").fill("Delivered the WCAG 2.2 AA findings report with 23 prioritised issues and remediation notes.");
  await signTx(supA, "Anchor delivery on chain", "submit_delivery round 3 (evidence hash)", journey);
  await buyer.goto(`/app/rfqs/${rfqId}`);
  await signTx(buyer, "Open dispute", "open_dispute round 3 (buyer)", journey);

  // A party to the dispute cannot decide it.
  const selfJudge = await loadAccount(m.buyer).signAndSendTransaction({
    receiverId: m.contract,
    actions: [actions.functionCall("resolve_dispute", { rfq_id: onchainId, outcome: "refund_to_buyer" }, 100n * 10n ** 12n, 1n)],
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  expect(JSON.stringify((selfJudge as { status: unknown }).status)).toContain("VP_NOT_REVIEWER");
  journey.push({ step: "attack: buyer resolve_dispute in own favour (rejected VP_NOT_REVIEWER)", txHash: txHashOf(selfJudge as never) });

  // The reviewer releases to the supplier, outside the app; the supplier receives exactly the principal.
  const beforeRelease = await balance(m.supplierA);
  const decision = await loadAccount(m.outsider).signAndSendTransaction({
    receiverId: m.contract,
    actions: [actions.functionCall("resolve_dispute", { rfq_id: onchainId, outcome: "release_to_supplier" }, 100n * 10n ** 12n, 1n)],
    waitUntil: "FINAL",
    throwOnFailure: false,
  });
  expect(JSON.stringify((decision as { status: unknown }).status)).not.toContain("Failure");
  journey.push({ step: "resolve_dispute round 3 by reviewer → release → on_payment_result", txHash: txHashOf(decision as never) });
  expect((await balance(m.supplierA)) - beforeRelease).toBe(PRINCIPAL);

  // ---- The app learns the outcome from the chain alone (worker reconciler), then shows it
  execSync("pnpm --filter @veilprocure/worker once", { cwd: root, stdio: "inherit", timeout: 180_000 });
  await expect.poll(() => awardStatus(rfqId, 3)).toBe("paid");
  const [rfq] = await sql<{ status: string }[]>`select status::text from rfqs where id = ${rfqId}`;
  expect(rfq!.status).toBe("settled");
  await buyer.reload();
  await expect(buyer.getByText("Paid").first()).toBeVisible();
});
