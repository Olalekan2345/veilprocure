/**
 * Exercises the "deemed acceptance" path on testnet: the awarded supplier claims payment after
 * the buyer's review window elapsed. Reads chain state first and refuses unless the contract
 * reports the award as delivered and past its review deadline.
 * Usage: tsx testnet/claim-after-review.ts <rfqOnchainId> <supplierAccountId>
 */
import { actions } from "near-api-js";
import { EXPLORER, loadAccount, readManifest, rpc, txHashOf } from "./lib";

const [rfqId, supplier] = process.argv.slice(2);
if (!rfqId || !supplier) throw new Error("usage: claim-after-review.ts <rfqOnchainId> <supplierAccountId>");
const m = readManifest();

async function view<T>(method: string, args: object): Promise<T> {
  const r = await rpc<{ result: number[] }>("query", { request_type: "call_function", finality: "final", account_id: m.contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T;
}

const rfq = await view<{ awards: { supplier: string; status: string; review_deadline_ns: string; amount_yocto: string }[] }>("get_rfq", { rfq_id: rfqId });
const award = rfq.awards.at(-1)!;
const deadlineMs = Number(BigInt(award.review_deadline_ns) / 1_000_000n);
console.log(`award: ${award.status}, supplier ${award.supplier}, review deadline ${new Date(deadlineMs).toISOString()}`);
if (award.status !== "delivered" || award.supplier !== supplier || Date.now() <= deadlineMs + 5_000) throw new Error("not claimable");

const balance = async () => BigInt((await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: supplier })).amount);
const before = await balance();
const res = await loadAccount(supplier).signAndSendTransaction({
  receiverId: m.contract,
  actions: [actions.functionCall("claim_after_review", { rfq_id: rfqId }, 100n * 10n ** 12n, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
const after = await balance();
const tx = txHashOf(res as never);
const status = (await view<{ awards: { status: string }[] }>("get_rfq", { rfq_id: rfqId })).awards.at(-1)!.status;
console.log(`claim tx ${tx} ${EXPLORER}/txns/${tx}`);
console.log(`award status now: ${status}; supplier balance delta: ${after - before} yocto (principal ${award.amount_yocto}, minus gas paid by the supplier)`);
