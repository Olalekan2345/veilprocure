# VeilProcure

**Private bids. Intelligent decisions. Payments you control.**

Small agencies and technology teams buying fixed-scope digital services (design, QA, security review, documentation, software) struggle to compare competing quotes fairly while keeping them confidential, and payment terms are easy to dispute. VeilProcure lets a buyer publish immutable evaluation rules (hashed on NEAR), collect **deadline-sealed** supplier quotes whose salted commitments are signed on chain by each supplier's wallet, verify every quote against its commitment after close, rank them with deterministic rules (optionally annotated by an attested NEAR AI Cloud model), and pay through a NEAR escrow contract that only releases to the selected supplier with the buyer's approval.

> **Public beta on NEAR testnet.** Testnet NEAR has no monetary value; settlement is economically non-binding. Quotes are protected by application controls and encryption, **not** hidden from the platform operator. The contract is **unaudited**.

## Current status (2026-10-30 — observed evidence only)

| Capability | Status |
|---|---|
| Accounts, orgs, roles, encrypted drafts, invitations, sealed-quote access control (RLS) | Built & verified locally (E2E + DB tests) |
| Rust escrow/commitment contract | Deployed to NEAR testnet [`veilprocure-106725.testnet`](https://testnet.nearblocks.io/address/veilprocure-106725.testnet); 37 native tests |
| Full buyer → 2 suppliers → payout journey on testnet | **Verified**: 12 real transactions through the UI, exact +0.5 NEAR payout, attacks rejected ([evidence](docs/TEST_EVIDENCE.md)) |
| Refund / dispute / failed-transfer retry on chain | Built and unit-tested; not yet run on testnet |
| NEAR AI Cloud attested evaluation | **Verified live**: `Qwen/Qwen3.8-27B`, all 27 attestation/signature/schema checks passed on two evaluations ([evidence](docs/AI_VERIFICATION.md)) |
| Hosted app | **Live** at https://veilprocure.netlify.app (Netlify + Neon + Gmail SMTP); sign-in, onboarding and encrypted drafts verified on the live site ([deployments](docs/DEPLOYMENTS.md)) |
| Public repo / X post | **TODO** — repo is private on GitHub; publishing and the X post need the owner |

Full matrix: [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Test output: [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## NEAR technologies used

| Technology | How | Status |
|---|---|---|
| NEAR smart contract (Rust, near-sdk 5.30.0) | RFQ policy commitments, invite-slot leaves, salted bid commitments, single-award escrow with async transfer + private callbacks | Live on testnet: `veilprocure-106725.testnet` |
| NEAR testnet RPC | Server verifies every reported transaction (signer, contract, method, args, deposit) and reads contract state as source of truth | Implemented |
| NEAR Connect (`@hot-labs/near-connect`) | Wallet connection, NEP-413 signed messages, transaction signing | Implemented; automated tests sign via a guarded test bridge, not the popup |
| NEAR AI Cloud | Attested private inference (TDX + NVIDIA evidence, response signatures) for advisory notes | Verified live (local worker) |
| NEAR Intents | — | Not used |

## Architecture

```
Buyer browser + wallet ─┐                      ┌─ Supplier browser + wallet
                        ▼                      ▼
             Next.js 16 app (server actions, route handlers)
   authz by server-resolved org · zod · rate limits · audit (hash-chained)
        │ veil_app role (RLS)            │ encrypted blobs
        ▼                                ▼
   PostgreSQL 17  ◄── veil_worker ──  Worker (reconciler + AI jobs)
   envelope-encrypted fields               │ attestation → inference → signature
        │                                  ▼
        │                         NEAR AI Cloud (TEE models)
        ▼
   NEAR testnet contract  ◄── wallets sign every on-chain step (server never holds keys)
   policy hash · invite leaves · bid commitments · award · escrow · transfers
```

Disclosure map — **on chain (public, permanent):** policy/terms hashes, salted invite leaves, salted bid commitments, bidder wallet ids, versions and times, award recipient and amount, agreement/delivery-evidence hashes, statuses, transfers. **Never on chain:** quote text, prices, files, names, e-mails, scope.

Details: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) · [docs/CONTRACT_INVARIANTS.md](docs/CONTRACT_INVARIANTS.md) · [docs/AI_VERIFICATION.md](docs/AI_VERIFICATION.md)

## Repository layout

```
apps/web            Next.js app: public site, buyer & supplier workspaces, API routes
apps/worker         Chain reconciler + confidential AI evaluation (fail-closed)
packages/shared     Commitments, canonical JSON, policy, deterministic evaluation, money, envelope format
packages/db         Drizzle schema, SQL migrations (RLS, immutability triggers), DB security tests
contracts/veilprocure  core/ (pure state machine + tests), contract/ (near-sdk wrapper)
tests/e2e           Playwright journeys (desktop + mobile)
scripts             Local Postgres, env generation, contract build, test vectors
docs                Discovery, feasibility, security, invariants, AI, tests, deployments, limits
```

## Run it locally

Requirements: Node ≥ 22.12, pnpm 9, PostgreSQL 17 binaries (`PG_BIN` if not in the default Windows path), Rust stable + `wasm32-unknown-unknown` + cargo-near 0.22 (contract only).

```bash
pnpm install
node scripts/dev-db.mjs start     # project-local PostgreSQL, generated passwords in .local/
node scripts/setup-env.mjs        # apps/web/.env.local, apps/worker/.env (local secrets; never committed)
pnpm db:migrate
pnpm dev                          # http://localhost:3000 ; sign-in links appear at /dev/mailbox
pnpm worker                       # optional
```

Configuration reference: [.env.example](.env.example). The server refuses to start with a descriptive list of any missing or invalid variable.

## Test

```bash
pnpm test:contract                              # 37 Rust tests (state machine + 400-seed property test)
pnpm --filter @veilprocure/shared test          # 22 (incl. cross-language vectors)
pnpm --filter @veilprocure/db test              # 10 against real Postgres (RLS, immutability)
pnpm --filter @veilprocure/web test             # 9 security primitives
pnpm --filter @veilprocure/worker test          # 8 AI fail-closed
pnpm --filter @veilprocure/worker attest:check  # live NEAR AI attestation only; sends no quote content (needs NEARAI_API_KEY)
pnpm test:e2e                                   # 8 off-chain journeys + on-chain Journey A (needs .local/testnet-accounts.json)
VEIL_AI_LIVE=1 pnpm test:e2e -- ai-live         # live attested AI evaluation of the journey's quotes (spends credits)
pnpm build:contract                             # WASM + SHA-256
```

## Deployed addresses

| What | Where |
|---|---|
| Contract (NEAR testnet) | [`veilprocure-106725.testnet`](https://testnet.nearblocks.io/address/veilprocure-106725.testnet) |
| Deploy tx | [`BEtCcWWS…ErkF`](https://testnet.nearblocks.io/txns/BEtCcWWShjDeke1wK9F8qGSR5Cfdd2drEqWQE4AQErkf) — code hash `3BnxCPhb…ZwbN` = SHA-256 `207b23c0…bc941` of the WASM built from this repo |
| Example payout tx | [`HY2vAtUm…5Pc6`](https://testnet.nearblocks.io/txns/HY2vAtUmsp2Vft7BsxNTJMWBe8vNk2GcSTzXeQDs5Pc6) (`approve_release` → transfer → `on_payment_result`) |
| Hosted app | https://veilprocure.netlify.app — Netlify (Next.js + worker functions + Blobs), Neon PostgreSQL, Gmail SMTP |

Details and all journey transactions: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md), [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## Judge walkthrough

“Do X → see Y” steps and the demo storyboard: [docs/JUDGE_WALKTHROUGH.md](docs/JUDGE_WALKTHROUGH.md). Steps requiring the contract or AI key are labelled and the app shows honest disabled states when they are not configured.

## Development chronology & baseline

- 2026-10-29: repository created empty (inside the hackathon window that began 2026-10-19); no pre-hackathon code exists. Discovery, contract, shared domain, database, web app, worker, tests and docs written this day.
- 2026-10-29/30: testnet deployment and on-chain journey.
- Baseline: tag `pre-hackathon` marks the empty initial commit; `hackathon-submission` will mark the submitted commit. Diff: `git diff pre-hackathon..hackathon-submission`.

## Attribution

Code written with Claude Code (Anthropic) under the direction of the project owner. Open-source dependencies (see lockfiles): Next.js, React, Tailwind CSS, Drizzle ORM, postgres.js, zod, lucide-react, @noble/hashes & @noble/curves, @phala/dcap-qvl (Apache-2.0), @hot-labs/near-connect, Nodemailer, near-sdk-rs, borsh, Vitest, Playwright. Verification flow follows NEAR AI Cloud's public documentation and reference verifier (MIT).

## License

MIT — see [LICENSE](LICENSE).

## Mainnet readiness

Not ready. Required first: professional contract and application audit, KMS-managed keys, malware scanning, hosted backups/restore drills, monitoring, legal review of escrow, dispute timeout and callback-failure recovery. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
