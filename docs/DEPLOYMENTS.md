# Deployments

## Testnet contract — DEPLOYED (2026-10-29, approved by the project owner)

| Field | Value |
|---|---|
| Network | NEAR testnet |
| Contract account | [`veilprocure-106725.testnet`](https://testnet.nearblocks.io/address/veilprocure-106725.testnet) (faucet-created; no other contract on it) |
| Deploy transaction | [`BEtCcWWShjDeke1wK9F8qGSR5Cfdd2drEqWQE4AQErkf`](https://testnet.nearblocks.io/txns/BEtCcWWShjDeke1wK9F8qGSR5Cfdd2drEqWQE4AQErkf) |
| On-chain code hash (base58) | `3BnxCPhbD5bdWXuq9aBYk4pabbZqmBfUAWZgcwX3ZwbN` — verified equal to the local WASM SHA-256 below via RPC `view_code` |
| Contract version | 0.1.0 (`get_config` → `contract_version: "0.1.0"`, event schema 1.0.0) |
| Initialisation | `Default` state, no init call, no owner |
| Tooling | `scripts/testnet/create-accounts.ts`, `scripts/testnet/deploy.ts` (near-api-js 7.4.0) |

Note: the first run of `deploy.ts` deployed the identical WASM, then failed its verification step because it queried `final` state before the deploy finalised; the second run redeployed the same bytes and verified. Both transactions are visible in the account history; the script now waits for finality and skips identical redeploys.

The contract account's full-access key is in the operator's local keychain (`~/.near-credentials/testnet/`), so the code can still be redeployed by that key holder — a documented trust assumption. Labelled test accounts used by the automated on-chain journey: `vp-106725-test-buyer.testnet`, `vp-106725-test-sup-a.testnet`, `vp-106725-test-sup-b.testnet`, `vp-106725-test-outsider.testnet`.

Built artifact (local, reproducible on this machine):

| Field | Value |
|---|---|
| Source | `contracts/veilprocure` (core + contract), version 0.1.0 |
| Build command | `cd contracts/veilprocure/contract && cargo near build non-reproducible-wasm --no-abi` |
| Toolchain | rustc 1.99.1 (x86_64-pc-windows-gnu), cargo-near 0.22.0, near-sdk 5.30.0 |
| WASM | `contracts/veilprocure/target/near/veilprocure/veilprocure.wasm`, 205,048 bytes |
| SHA-256 | `207b23c054421a9b7975320d7e8831498b0b49f77fde24dc5171d59f7e4bc941` |

### Reproducing the deployment

Used: `pnpm --filter @veilprocure/scripts exec tsx testnet/create-accounts.ts` then `… testnet/deploy.ts`.

Alternative with near-cli-rs (not used here; the command lines follow its documented pattern but were **not run** — confirm against `near --help` first):

1. Install near-cli-rs (prebuilt release binary, checksum-verified) and create a funded testnet account owned by the human, e.g. `<name>.testnet`.
2. Create a dedicated sub-account for the contract (e.g. `veilprocure.<name>.testnet`) so no existing contract is overwritten, funded with ~3 testnet NEAR (≈2.1 NEAR storage for 205 KB plus margin).
3. `near contract deploy veilprocure.<name>.testnet use-file <wasm> without-init-call network-config testnet sign-with-keychain send` (state initialises by `Default`; no init call needed).
4. Verify: `near contract call-function as-read-only veilprocure.<name>.testnet get_config json-args {} network-config testnet now` and compare the on-chain code hash with the SHA-256 above.
5. Set `NEAR_CONTRACT_ID` in `apps/web/.env.local` and `apps/worker/.env`.
6. Record here: account, deploy tx hash, code hash, date.

Optional hardening (human decision): after verification, delete the contract account's full-access key so the code can never be changed (also removes any ability to fix bugs).

## Web app — NOT DEPLOYED

Runs locally only (`http://localhost:3000`). Hosting requires human-approved choices and credentials: host (e.g. Vercel/Fly/Render), managed PostgreSQL, secret storage for `VEIL_MASTER_KEY`/`DOWNLOAD_TOKEN_SECRET`, an e-mail provider with a verified sender (Resend is integrated), private object storage (local disk adapter only today), domain and support address. No URL exists yet.
