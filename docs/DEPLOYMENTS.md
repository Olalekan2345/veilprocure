# Deployments

## Testnet contract — NOT DEPLOYED

No account has been created and nothing has been deployed. Deployment needs explicit human approval of the target account and spending (testnet NEAR only).

Built artifact (local, reproducible on this machine):

| Field | Value |
|---|---|
| Source | `contracts/veilprocure` (core + contract), version 0.1.0 |
| Build command | `cd contracts/veilprocure/contract && cargo near build non-reproducible-wasm --no-abi` |
| Toolchain | rustc 1.99.1 (x86_64-pc-windows-gnu), cargo-near 0.22.0, near-sdk 5.30.0 |
| WASM | `contracts/veilprocure/target/near/veilprocure/veilprocure.wasm`, 205,048 bytes |
| SHA-256 | `207b23c054421a9b7975320d7e8831498b0b49f77fde24dc5171d59f7e4bc941` |

### Proposed procedure (after approval)

The near-cli-rs command lines below follow its documented pattern but have **not been run** on this machine (near-cli-rs is not installed yet). Confirm each against `near --help` of the installed version before executing.

1. Install near-cli-rs (prebuilt release binary, checksum-verified) and create a funded testnet account owned by the human, e.g. `<name>.testnet`.
2. Create a dedicated sub-account for the contract (e.g. `veilprocure.<name>.testnet`) so no existing contract is overwritten, funded with ~3 testnet NEAR (≈2.1 NEAR storage for 205 KB plus margin).
3. `near contract deploy veilprocure.<name>.testnet use-file <wasm> without-init-call network-config testnet sign-with-keychain send` (state initialises by `Default`; no init call needed).
4. Verify: `near contract call-function as-read-only veilprocure.<name>.testnet get_config json-args {} network-config testnet now` and compare the on-chain code hash with the SHA-256 above.
5. Set `NEAR_CONTRACT_ID` in `apps/web/.env.local` and `apps/worker/.env`.
6. Record here: account, deploy tx hash, code hash, date.

Optional hardening (human decision): after verification, delete the contract account's full-access key so the code can never be changed (also removes any ability to fix bugs).

## Web app — NOT DEPLOYED

Runs locally only (`http://localhost:3000`). Hosting requires human-approved choices and credentials: host (e.g. Vercel/Fly/Render), managed PostgreSQL, secret storage for `VEIL_MASTER_KEY`/`DOWNLOAD_TOKEN_SECRET`, an e-mail provider with a verified sender (Resend is integrated), private object storage (local disk adapter only today), domain and support address. No URL exists yet.
