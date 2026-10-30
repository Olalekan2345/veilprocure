# Technical discovery

Recorded 2026-10-29 from live sources (not from memory). Re-verify before submission.

## Hackathon rules (https://nearhackathon.com/HACKATHON.md, read 2026-10-29)

| Item | Value as published |
|---|---|
| Hackathon start | 2026-11-01T00:00:00Z |
| Development window | From the 2026-10-19 announcement to 2026-11-14 (Q-001: "The window runs from then to 2026-11-14. Earlier commits are baseline.") |
| Deadline (repo public, submissions close) | 2026-11-14T23:59:00Z |
| Submissions accepted | 2026-11-01 → 2026-11-14 via `POST https://nearhackathon.com/api/applications` |
| Payload fields | `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress`, `projectUrl`, `demoUrl`, `idea`, `consent` (no other fields; `website` is a spam trap) |
| Testnet | Testnet-only projects are eligible except where an integration is mainnet-only. NEAR Intents has no testnet |
| Baseline marking | Dedicated branch, or tags `pre-hackathon` / `hackathon-submission`, plus a README section linking the diff |
| Track ids | `business` (primary candidate); `privacy`, `security`, `realworld` only if genuinely implemented |

This repository was created empty on 2026-10-29 (inside the window). There is no pre-hackathon code.

## NEAR protocol / tooling (verified)

| Item | Verified value | How |
|---|---|---|
| Testnet RPC | `https://test.rpc.fastnear.com` — `status` returned `chain_id: testnet`, protocol 88, node 2.14.0-rc.5, block 275331029 | live JSON-RPC call |
| Other public testnet RPCs | `https://archival-rpc.testnet.near.org`, `https://near-testnet.drpc.org`, `https://testnet-rpc.intea.rs` | docs.near.org/api/rpc/providers |
| Explorer | `https://testnet.nearblocks.io` (returns 403 to curl — bot protection; works in browsers); `https://explorer.testnet.near.org` returns 200 | live HTTP |
| Faucet | `https://near-faucet.io/` (200) | live HTTP |
| `near-sdk` | **5.30.0** (published 2026-10-27, `rust_version` 1.95) | crates.io API |
| `cargo-near` | **0.22.0** stable (0.23.0-rc.2 pre-release); Windows x86_64 MSVC binary, SHA-256 `c50ad7e3…bf122` verified against the release `.sha256` | GitHub releases |
| Rust toolchain | 1.99.1 stable, host `x86_64-pc-windows-gnu`, target `wasm32-unknown-unknown` | `rustc --version` |
| cargo-near wasm-opt flags | `--enable-nontrapping-float-to-int --enable-bulk-memory` (observed in build output) | build log |
| Wallet connector | `@hot-labs/near-connect` **0.12.0** — recommended by docs.near.org wallet-login guide; `NearConnector({ network: "testnet" })`, `signMessage({message, recipient, nonce: Uint8Array})`, `signAndSendTransaction({receiverId, actions:[{type:"FunctionCall", params}]})` | docs + package `.d.ts` |
| `near-api-js` | 7.4.0 (not needed in the app: the server uses plain JSON-RPC) | npm |

Docs drift noted: the NEAR wallet-login page builds a NEP-413 nonce with `Buffer.from(crypto.randomUUID())` (36 bytes); NEP-413 requires 32 bytes. VeilProcure uses 32 random bytes.

## NEAR AI Cloud (verified)

| Item | Value | Source |
|---|---|---|
| API base | `https://cloud-api.near.ai/v1` (OpenAI-compatible; `Authorization: Bearer`) | docs.near.ai/cloud/quickstart |
| Attestation | `GET /v1/attestation/report?model=…&provider=near&signing_algo=ecdsa&nonce=<64 hex>` with `x-no-aliasing: true` → `gateway_attestation`, `model_attestations[]` | docs …/gateway-attestation, …/model-attestations |
| report_data | bytes 0–31 signer binding (ecdsa: 20-byte address + 12 zero bytes), bytes 32–63 client nonce | docs …/reference/quote-nonce-signer |
| MRCONFIGID | `0x01 ‖ sha256(app_compose) ‖ 15 zero bytes` | same |
| RTMR3 | replay `imr==3` events: `sha384(u32le(type) ‖ ":" ‖ event ‖ ":" ‖ payload)`, extend from 48 zero bytes | same |
| GPU evidence | POST `nvidia_payload` to `https://nras.attestation.nvidia.com/v3/attest/gpu`; require `x-nvidia-overall-att-result: true`; payload nonce must equal ours | same |
| Response signature | `GET /v1/signature/{chat_id}?signing_algo=ecdsa` → `text`, `signature`, `signing_address`, `signature_kind`; `provider_tee` text = `<MODEL>:<sha256(req)>:<sha256(resp)>`, `gateway` text = `<sha256(req)>:<sha256(resp)>`; EIP-191 recovery | docs …/response-signatures |
| TDX verifier | `@phala/dcap-qvl` **0.7.0** (pure JS, Apache-2.0) — named by the NEAR AI docs | npm |
| Reference verifier | github.com/nearai/nearai-cloud-verifier (MIT; Python + TS) | GitHub |
| Model list | `GET /v1/models` is public (64 models on 2026-10-29). NEAR-operated TEE models (`owned_by: nearai`) with `structured_outputs`: `Qwen/Qwen3.8-27B`, `z-ai/glm-5.3-flash`, `Qwen/Qwen3.6-35B-A3B-FP8` | live call |

Docs drift noted: the quickstart example model `zai-org/GLM-5.1-FP8` is **not** in the live model list.

**Status: VERIFIED (2026-10-30).** Keys are created after purchasing credits at https://cloud.near.ai. `Qwen/Qwen3.8-27B` returned one model candidate whose attestation passed our policy, and two live evaluations verified end to end (`docs/AI_VERIFICATION.md`). Fallback candidate `z-ai/glm-5.3-flash` not tested.

## Local environment (this machine)

- Windows 11, Node 24.14.1, pnpm 9.15.4, Git 2.43, Python 3.12, PostgreSQL 17.10 binaries.
- No MSVC build tools, no Docker, no WSL assumed. Consequences:
  - Rust uses the GNU host toolchain (self-contained MinGW linker).
  - `cargo near build` works with `--no-abi` (ABI generation links a native DLL, which the GNU linker cannot do with near-sdk's unresolved host imports).
  - Reproducible (Docker) contract builds and `near-sandbox` are unavailable here; integration tests target real testnet.
  - near-sdk's `unit-testing` mock VM pulls C dependencies; the state machine therefore lives in a dependency-light `veilprocure-core` crate tested natively.
- Ports 54329/54330 are used by other local projects; VeilProcure's Postgres cluster uses 54341.

## Version pins (lockfiles are authoritative)

next 16.4.3 · react 19.3.1 · typescript 6.0.3 (7.0 is the native port; Next's type-check uses the JS API) · drizzle-orm 0.45.4 · drizzle-kit 0.31.11 · postgres 3.4.9 · zod 4.6.7 · tailwindcss 4.3.3 · vitest 5.0.5 · @playwright/test 1.64.1 · @noble/curves|hashes 2.4.0 · near-sdk =5.30.0 · borsh 1.x.
