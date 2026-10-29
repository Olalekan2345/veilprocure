/**
 * Creates the VeilProcure testnet accounts via the public faucet:
 *   contract  veilprocure-<id>.testnet          (hosts the escrow contract)
 *   test-only vp-<id>-test-{buyer,sup-a,sup-b,outsider}.testnet (labelled test identities)
 * Usage: pnpm --filter @veilprocure/scripts exec tsx testnet/create-accounts.ts
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { accountExists, createFaucetAccount, MANIFEST, readManifest, writeManifest, type Manifest } from "./lib";

const id = randomBytes(3).toString("hex");
const plan: Manifest = existsSync(MANIFEST)
  ? readManifest()
  : {
      createdAt: new Date().toISOString(),
      contract: `veilprocure-${id}.testnet`,
      buyer: `vp-${id}-test-buyer.testnet`,
      supplierA: `vp-${id}-test-sup-a.testnet`,
      supplierB: `vp-${id}-test-sup-b.testnet`,
      outsider: `vp-${id}-test-outsider.testnet`,
    };
writeManifest(plan);

for (const accountId of [plan.contract, plan.buyer, plan.supplierA, plan.supplierB, plan.outsider]) {
  if (await accountExists(accountId)) {
    console.log(`exists   ${accountId}`);
    continue;
  }
  await createFaucetAccount(accountId);
  console.log(`created  ${accountId}`);
}
console.log(`manifest ${MANIFEST}`);
