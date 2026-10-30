# Feasibility spikes

The brief requires three go/no-go spikes with real tool output. Status on 2026-10-30:

| # | Spike | Status | Evidence |
|---|---|---|---|
| 1 | Compile/deploy a Rust contract and call it from real testnet wallets | **DONE** — deployed to `veilprocure-106725.testnet`, called by 4 separate testnet accounts | `docs/DEPLOYMENTS.md`, `docs/TEST_EVIDENCE.md` |
| 2 | Verify one NEAR AI Cloud request + attestation/signature | **DONE** — `Qwen/Qwen3.8-27B`, all 27 checks passed on two live evaluations | `docs/AI_VERIFICATION.md` |
| 3 | Escrow transfer + callback to a second account | **DONE** — `approve_release` transfer + `on_payment_result` callback paid exactly 0.5 NEAR to a second account; `claim_after_review` likewise | `docs/TEST_EVIDENCE.md` |

## 1. Contract build (real output)

```
$ cargo near build non-reproducible-wasm --no-abi        # contracts/veilprocure/contract
• Running an optimize for size post-step with wasm-opt --enable-nontrapping-float-to-int --enable-bulk-memory...
✓ Contract successfully built! (in CARGO_NEAR_BUILD_ENVIRONMENT=host)
     -                Binary: …\contracts\veilprocure\target\near\veilprocure\veilprocure.wasm
     -                  Size: 205.0 KB (205048 bytes)
     - SHA-256 checksum hex : 207b23c054421a9b7975320d7e8831498b0b49f77fde24dc5171d59f7e4bc941
```

Rebuilding produced the identical hash. Without `--no-abi`, the ABI step fails on this Windows GNU toolchain with `ld: … undefined reference to 'log_utf8'` (native DLL link); ABI embedding is optional.

Deployed on 2026-10-29 after the project owner's approval: tx `BEtCcWWShjDeke1wK9F8qGSR5Cfdd2drEqWQE4AQErkf`, on-chain code hash verified equal to the local SHA-256.

## 2. NEAR AI Cloud

Implemented: `apps/worker/src/attestation.ts` and `evaluate.ts` follow the documented flow (see `docs/AI_VERIFICATION.md`). Unit tests prove fail-closed behaviour (no key → blocked with zero network calls; unverifiable attestation → the chat endpoint is never called). On 2026-10-30, with the owner's API key, two live evaluations of the on-chain journey's quotes passed every check (TDX quote + collateral, nonce and signer bindings, MRCONFIGID, RTMR3 replay, NVIDIA NRAS, `provider_tee` response signature bound to the verified model signer, output schema). Evidence: `docs/AI_VERIFICATION.md`.

## 3. Escrow and callbacks

`veilprocure-core` property test: 400 seeded random sequences × 60 operations, including forged/stale/replayed callbacks and failed transfers, asserting after every step: ledger == held principal, ≤ 1 pending transfer, ≤ 1 successful payout, destinations locked to the award's supplier (release) or the RFQ buyer (refund). On testnet, the async transfer + private callback path was exercised end to end (release paid exactly 0.5 NEAR; `claim_after_review` paid as well). A transfer to a non-existent account (`release_failed → retry`) has not yet been run on testnet; it remains covered by the core tests.
