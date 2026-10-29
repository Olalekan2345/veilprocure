# Private AI verification

Status: **implemented and unit-tested; not yet exercised live (no NEAR AI Cloud API key).** The UI never shows a "verified" badge unless a stored evidence record has `verified = true`.

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

## To run live (needs the human)

Set `NEARAI_API_KEY` and `NEARAI_MODEL` (candidate `Qwen/Qwen3.8-27B`) in `apps/worker/.env`, then request AI notes on a closed RFQ. Record the evidence id and result in `docs/TEST_EVIDENCE.md`.
