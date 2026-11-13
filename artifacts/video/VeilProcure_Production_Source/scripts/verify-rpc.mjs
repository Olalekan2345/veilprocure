// Independent check of every transaction in the film manifest against NEAR testnet RPC:
// status, signer, receiver, method, attached deposit, block, timestamp. Writes footage/rpc-verification.json.
import { readFileSync, writeFileSync } from "node:fs";
const dir = "C:/Users/USER/Desktop/VeilProcure/.local/video/footage";
const m = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
const rpc = async (method, params) => (await (await fetch("https://rpc.testnet.near.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json());
const yocto = (s) => (Number(BigInt(s) / 10n ** 20n) / 10000).toFixed(4);
const out = [];
for (const tx of m.txs) {
  const signer = tx.step.includes("outsider") ? m.accounts.outsider : tx.step.includes("losing supplier") ? m.accounts.supplierB : tx.step.startsWith("commit_bid") ? (tx.cam === "supplierA" ? m.accounts.supplierA : m.accounts.supplierB) : tx.cam === "supplierA" ? m.accounts.supplierA : m.accounts.buyer;
  const r = await rpc("EXPERIMENTAL_tx_status", { tx_hash: tx.txHash, sender_account_id: signer, wait_until: "FINAL" });
  if (!r.result) { out.push({ step: tx.step, txHash: tx.txHash, error: r.error }); continue; }
  const t = r.result.transaction; const fc = t.actions.find((a) => a.FunctionCall)?.FunctionCall;
  const status = r.result.status; const failure = status.Failure ? JSON.stringify(status.Failure).match(/VP_[A-Z_]+/)?.[0] ?? "Failure" : "SuccessValue" in status ? "Success" : JSON.stringify(status).slice(0, 40);
  const receiptFailures = (r.result.receipts_outcome ?? []).map((o) => JSON.stringify(o.outcome.status).match(/VP_[A-Z_]+/)?.[0]).filter(Boolean);
  const block = await rpc("block", { block_id: r.result.transaction_outcome.block_hash });
  out.push({ step: tx.step, txHash: tx.txHash, explorer: tx.explorer, signer: t.signer_id, receiver: t.receiver_id, method: fc?.method_name, depositNear: fc ? yocto(fc.deposit) : null, status: receiptFailures[0] ?? failure, block: block.result?.header.height, at: block.result ? new Date(Number(BigInt(block.result.header.timestamp) / 1000000n)).toISOString() : null });
  console.log(`${(receiptFailures[0] ?? failure).padEnd(22)} ${(fc?.method_name ?? "").padEnd(16)} ${t.signer_id.padEnd(34)} deposit ${fc ? yocto(fc.deposit) : "-"}  ${tx.txHash}`);
}
writeFileSync(`${dir}/rpc-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), rpc: "https://rpc.testnet.near.org", contract: m.accounts.contract, txs: out }, null, 2));
