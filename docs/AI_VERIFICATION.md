# Private AI verification

Status: **implemented, unit-tested and verified live against NEAR AI Cloud on 2026-10-30** (see below). The UI never shows a "verified" badge unless a stored evidence record has `verified = true`.

## Live verification (2026-10-30)

Model `Qwen/Qwen3.8-27B` via `https://cloud-api.near.ai`, policy `vp-nearai-1`, run on the developer machine with the project owner's API key.

**Attestation only** (`pnpm --filter @veilprocure/worker attest:check Qwen/Qwen3.8-27B`, sends no quote content): 1 model candidate; all 22 gateway and model checks passed. Gateway signer `0xb98a789cdc4817275f5155593ba73ef2a957e779`, model signer `0x835ab53d20294ef795906dff21ae4c045336aa26`, both TDX TCB `UpToDate`, NVIDIA NRAS overall result `true`.

**Full evaluation through the UI** (`VEIL_AI_LIVE=1 pnpm exec playwright test specs/ai-live.spec.ts`): the buyer of the on-chain journey RFQ #3 (two committed test quotes) requested AI notes; the worker ran once; all 27 checks passed (22 attestation, 4 signature, 1 output schema), notes appeared on the comparison page and the evidence page showed `VERIFIED under policy vp-nearai-1`. Run twice:

| Evaluation job | Signature | Request SHA-256 | Response SHA-256 | Model quote SHA-256 |
|---|---|---|---|---|
| `bdd53042-a1e7-4144-a8f7-ec72bc7684cf` (06:31 UTC) | `provider_tee`, `0x835ab53d…36aa26` | `d02c2951…956fcd` | `7e2da589…26824a` | `86384a8f…6b62b8` |
| `24d14755-4f8b-4a4b-bdab-512314c5bb5c` (06:36 UTC) | `provider_tee`, `0x835ab53d…36aa26` | `d02c2951…956fcd` | `b04d92ae…5c6d92` | `59878801…7222b` |

The request hash is identical across runs (same committed quotes, fixed prompt, canonical request bytes); each run fetched fresh attestation with a new nonce, so quote hashes differ.

Observed quality issue: the model refers to the anonymised labels (`Q1`, `Q2`) inside note text, which the buyer does not see, and once compared a quote with itself ("more than Q1" on Q1). Notes are shown verbatim as signed; they remain advisory and are labelled as such.

## Role of AI

AI produces **advisory qualitative notes** (strengths, concerns, ambiguities, each citing a quote field) after bidding closes. It never decides eligibility, never changes scores, cannot award and cannot move funds. Hard requirements are evaluated first by deterministic code (`packages/shared/src/evaluation.ts`).

## Verification policy `vp-nearai-1` (`apps/worker/src/attestation.ts`, `evaluate.ts`)

Before any quote content is sent:

1. Generate a fresh 32-byte nonce; `GET /v1/attestation/report?model=M&provider=near&signing_algo=ecdsa&nonce=N` with `x-no-aliasing: true`.
2. For the gateway report and **every** model candidate:
   - Intel DCAP verification of `intel_quote` with `@phala/dcap-qvl` (collateral from Phala PCCS by default);
   - TCB status in the accepted set (default `UpToDate,SWHardeningNeeded`, configurable via `NEARAI_ACCEPTED_TCB`; advisory ids recorded);
   - TD debug bit clear;
   - `report_data[0..32]` equals the signer binding (20-byte ecdsa address + 12 zero bytes) and `report_data[32..64]` equals our nonce; echoed `request_nonce` equals our nonce;
   - MRCONFIGID equals `0x01 ‖ sha256(app_compose) ‖ 15 zero bytes` (raw string, not re-serialised);
   - RTMR3 recomputed by replaying `imr==3` events equals the quote's RTMR3 (forged event digests rejected);
   - model candidates only: NVIDIA GPU evidence present, its nonce equals ours, NRAS returns `x-nvidia-overall-att-result: true`.
3. If no model candidate passes → job `failed`, evidence `verified=false`, **nothing sent**.

After inference (exact request bytes kept; response read raw with `Accept-Encoding: identity`):

4. `GET /v1/signature/{id}?model=M&signing_algo=ecdsa`.
5. Signed text must equal `M:sha256(request):sha256(response)` (`provider_tee`) or `sha256(request):sha256(response)` (`gateway`); unknown kinds rejected.
6. EIP-191 recovery of the signature must equal `signing_address`, which must match **exactly one** verified preflight signer of the right kind.
7. Output must parse against a fixed JSON schema; `source` limited to quote field names; text sanitised.

Only then are notes stored (encrypted) with `verified=true`. Stored evidence: model id, policy version, nonce, signer, signature kind/text/signature, request/response hashes, quote hashes, TCB status, GPU verdict, per-check results — never prompts or quote text.

## Known limits (from NEAR AI docs)

Instances of the same model share a signing key, so a matching signer does not prove the same serving instance produced the response. Attestation shows where inference ran, not that the notes are correct, unbiased or complete. Collateral comes from Phala's PCCS unless configured otherwise.

## Tests

`apps/worker/src/worker.test.ts`: not configured → `blocked` with zero network calls; unverifiable evidence → `ATTESTATION_FAILED` and `/chat/completions` never called; endpoint down → `ATTESTATION_UNAVAILABLE`; RTMR3 replay and forged digest; signer binding; EIP-191 recovery against an independently generated secp256k1 signature; schema rejects `source: "system"`; sanitiser strips bidi/control/markup.

## To run live

Set `NEARAI_API_KEY` and `NEARAI_MODEL=Qwen/Qwen3.8-27B` in `apps/worker/.env`. `pnpm --filter @veilprocure/worker attest:check` verifies attestation without sending content; `VEIL_AI_LIVE=1 pnpm exec playwright test specs/ai-live.spec.ts` (in `tests/e2e`, after the on-chain journey) runs a full evaluation and writes `.local/ai-live.json`.
