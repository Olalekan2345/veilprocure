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

## Web app — NOT DEPLOYED (Netlify + Neon prepared)

Runs locally only (`http://localhost:3000`). The owner chose **Netlify** (hosting, functions, Blobs) with **Neon** PostgreSQL and Gmail SMTP for e-mail. No hosted URL exists yet; nothing goes live without the owner's go-ahead.

### Hosting on Netlify (prepared, not yet run)

| Piece | How it runs on Netlify |
|---|---|
| Next.js app | Netlify's Next.js adapter; site package directory `apps/web`, base directory unset; build `pnpm --filter @veilprocure/web build` (`apps/web/netlify.toml`) |
| Encrypted uploads | Netlify Blobs store `veil-objects` (`STORAGE_BACKEND=netlify-blobs`); objects are sealed with the envelope key before they leave the app |
| Chain reconciler + intent expiry | Scheduled function `chain-sync`, every minute (≤ 30 s), worker role |
| Confidential AI jobs | Background function `ai-runner` (≤ 15 min), woken by the web app after a request (`AI_RUNNER_URL` + `WORKER_TRIGGER_SECRET`) and by `chain-sync` if jobs wait |
| Database | Neon PostgreSQL 17; `pnpm --filter @veilprocure/db provision:hosted` creates `veil_app` / `veil_worker`, migrates as the owner and writes pooled logins to `.local/hosted.env` (never committed) |
| Client IP for rate limits | `TRUST_PROXY_HEADERS=netlify` (Netlify's `x-nf-client-connection-ip`) |
| E-mail | `EMAIL_TRANSPORT=smtp` (Gmail app password), as verified locally |

**Neon — PROVISIONED (2026-10-30).** Project in AWS us-east-2 running PostgreSQL 18.6. `provision:hosted` created `veil_app` (NOBYPASSRLS) and `veil_worker` (BYPASSRLS), applied all migrations as `neondb_owner`, and confirmed each role's attribute by logging in through the pooled endpoint. The database security suite (`packages/db`, RLS + immutability) passed **10/10** against a temporary `veilprocure_test` database in the same project, then the test database was dropped (test timeout raised to 120 s: the default 5 s is too short for round trips from the development machine to us-east-2).

Environment (`node scripts/netlify-env.mjs --site <name>` prints the plan with secrets masked; `--apply` sets it through the Netlify CLI; secrets are marked secret, production context only, and the script confirms every key through the Netlify API afterwards): `APP_URL`, `DATABASE_URL`, `WORKER_DATABASE_URL`, `VEIL_MASTER_KEY` and `DOWNLOAD_TOKEN_SECRET` (fresh, not the local ones), `VEIL_KEY_ID`, `STORAGE_BACKEND`, `EMAIL_TRANSPORT`, `SMTP_*`, `EMAIL_FROM`, `TRUST_PROXY_HEADERS`, `NEAR_NETWORK`, `NEAR_RPC_URL`, `NEAR_EXPLORER_URL`, `NEAR_CONTRACT_ID`, `NEARAI_*`, `AI_RUNNER_URL`, `WORKER_TRIGGER_SECRET`. Never set `NEXT_PUBLIC_VEIL_E2E_WALLET`.
