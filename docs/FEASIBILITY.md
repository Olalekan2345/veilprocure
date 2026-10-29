# Feasibility spikes

The brief requires three go/no-go spikes with real tool output. Status on 2026-10-29:

| # | Spike | Status | Evidence |
|---|---|---|---|
| 1 | Compile/deploy a Rust contract and call it from real testnet wallets | **Compile: DONE. Deploy/call: BLOCKED on human approval** | below |
| 2 | Verify one NEAR AI Cloud request + attestation/signature | **BLOCKED: no NEAR AI Cloud API key** | verifier implemented and unit-tested; no live request made |
| 3 | Escrow transfer + callback to a second account | **Logic: DONE (unit/property tests). On-chain: BLOCKED on approval** | below |

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

Not yet done: no testnet account was created and nothing was deployed. The human must approve (a) which testnet account hosts the contract (a fresh sub-account is recommended so no other contract is overwritten), (b) faucet-funded account creation and ~2–3 testnet NEAR of storage for a 205 KB WASM. See `docs/DEPLOYMENTS.md` for the exact commands.

## 2. NEAR AI Cloud

Implemented: `apps/worker/src/attestation.ts` and `evaluate.ts` follow the documented flow (see `docs/AI_VERIFICATION.md`). Unit tests prove fail-closed behaviour (no key → blocked with zero network calls; unverifiable attestation → the chat endpoint is never called). **No live attested completion has been obtained** because no API key is available. Nothing in the UI claims a verified result.

## 3. Escrow and callbacks

`veilprocure-core` property test: 400 seeded random sequences × 60 operations, including forged/stale/replayed callbacks and failed transfers, asserting after every step: ledger == held principal, ≤ 1 pending transfer, ≤ 1 successful payout, destinations locked to the award's supplier (release) or the RFQ buyer (refund). Real async transfer + callback behaviour on testnet (including a transfer to a non-existent account to exercise `release_failed → retry`) is the first integration test to run after deployment approval.
