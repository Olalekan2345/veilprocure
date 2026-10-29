/**
 * Deploys the built WASM to the manifest's contract account and verifies the on-chain code hash
 * equals the local SHA-256. Usage: tsx testnet/deploy.ts
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { baseEncode } from "near-api-js";
import { EXPLORER, loadAccount, readManifest, REPO_ROOT, rpc, txHashOf, writeManifest } from "./lib";

const m = readManifest();
const wasm = readFileSync(join(REPO_ROOT, "contracts/veilprocure/target/near/veilprocure/veilprocure.wasm"));
const sha = createHash("sha256").update(wasm).digest();
const contract = loadAccount(m.contract);

const expected = baseEncode(new Uint8Array(sha));
const onChainHash = async () =>
  rpc<{ hash: string }>("query", { request_type: "view_code", finality: "final", account_id: m.contract }).then((c) => c.hash).catch(() => null);

const balance = await contract.getBalance();
console.log(`deployer ${m.contract} balance ${balance} yocto`);
let tx = m.deployTx ?? "";
if ((await onChainHash()) === expected) {
  console.log("identical code already deployed; skipping");
} else {
  tx = txHashOf((await contract.deployContract(new Uint8Array(wasm))) as never);
  console.log(`deploy tx ${tx}  ${EXPLORER}/txns/${tx}`);
}
// The deploy returns before finality; wait until the final state shows the new code.
let hash: string | null = null;
for (let i = 0; i < 20 && hash !== expected; i++) {
  hash = await onChainHash();
  if (hash !== expected) await new Promise((r) => setTimeout(r, 1500));
}
const code = { hash: hash ?? "none" };
if (code.hash !== expected) throw new Error(`code hash mismatch: chain ${code.hash} local ${expected}`);
console.log(`code hash verified ${code.hash} (sha256 ${sha.toString("hex")})`);

const cfg = await contract.provider.callFunction({ contractId: m.contract, method: "get_config", args: {} });
console.log("get_config", JSON.stringify(cfg));
writeManifest({ ...m, deployTx: tx, codeHashBase58: code.hash, wasmSha256: sha.toString("hex") });
