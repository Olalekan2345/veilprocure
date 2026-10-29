# VeilProcure

**Private bids. Intelligent decisions. Payments you control.**

Small agencies and technology teams buying fixed-scope digital services (design, QA, security review, documentation, software) struggle to compare competing quotes fairly while keeping them confidential, and payment terms are easy to dispute. VeilProcure lets a buyer publish immutable evaluation rules (hashed on NEAR), collect **deadline-sealed** supplier quotes whose salted commitments are signed on chain by each supplier's wallet, verify every quote against its commitment after close, rank them with deterministic rules (optionally annotated by an attested NEAR AI Cloud model), and pay through a NEAR escrow contract that only releases to the selected supplier with the buyer's approval.

> **Public beta on NEAR testnet.** Testnet NEAR has no monetary value; settlement is economically non-binding. Quotes are protected by application controls and encryption, **not** hidden from the platform operator. The contract is **unaudited**.

## Current status (2026-10-29 — observed evidence only)

| Capability | Status |
|---|---|
| Accounts, orgs, roles, encrypted drafts, invitations, sealed-quote access control (RLS) | Built & verified locally (E2E + DB tests) |
| Rust escrow/commitment contract | Built & verified natively (37 tests); **not deployed** — awaiting approval |
| Wallet binding (NEP-413), publish/commit/award/fund/release flows | Built; **not verified on chain** (needs the deployed contract) |
| NEAR AI Cloud attested evaluation | Built; fail-closed paths verified; **live path blocked on an API key** |
| Hosted demo / public repo / X post | **TODO** — require the human's credentials and approval |

Full matrix: [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Test output: [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md).

## NEAR technologies used

| Technology | How | Status |
|---|---|---|
| NEAR smart contract (Rust, near-sdk 5.30.0) | RFQ policy commitments, invite-slot leaves, salted bid commitments, single-award escrow with async transfer + private callbacks | Built; testnet deployment pending approval |
| NEAR testnet RPC | Server verifies every reported transaction (signer, contract, method, args, deposit) and reads contract state as source of truth | Implemented |
| NEAR Connect (`@hot-labs/near-connect`) | Wallet connection, NEP-413 signed messages, transaction signing | Implemented; not yet exercised with a live wallet |
| NEAR AI Cloud | Attested private inference (TDX + NVIDIA evidence, response signatures) for advisory notes | Implemented; blocked on API key |
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
pnpm test:e2e                                   # 8 browser journeys (app running on :3000)
pnpm build:contract                             # WASM + SHA-256
```

## Deployed addresses

**TODO — nothing is deployed.** The testnet contract account, deployment transaction, and any hosted URL will be recorded in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) only after the human approves and performs/authorises them. Current local WASM SHA-256: `207b23c054421a9b7975320d7e8831498b0b49f77fde24dc5171d59f7e4bc941`.

## Judge walkthrough

“Do X → see Y” steps and the demo storyboard: [docs/JUDGE_WALKTHROUGH.md](docs/JUDGE_WALKTHROUGH.md). Steps requiring the contract or AI key are labelled and the app shows honest disabled states until they exist.

## Development chronology & baseline

- 2026-10-29: repository created empty (inside the hackathon window that began 2026-10-19); no pre-hackathon code exists. Discovery, contract, shared domain, database, web app, worker, tests and docs written this day.
- Baseline tags (`pre-hackathon`, `hackathon-submission`) will be added when commits are made.

## Attribution

Code written with Claude Code (Anthropic) under the direction of the project owner. Open-source dependencies (see lockfiles): Next.js, React, Tailwind CSS, Drizzle ORM, postgres.js, zod, lucide-react, @noble/hashes & @noble/curves, @phala/dcap-qvl (Apache-2.0), @hot-labs/near-connect, near-sdk-rs, borsh, Vitest, Playwright. Verification flow follows NEAR AI Cloud's public documentation and reference verifier (MIT).

## License

MIT — see [LICENSE](LICENSE).

## Mainnet readiness

Not ready. Required first: professional contract and application audit, KMS-managed keys, malware scanning, hosted backups/restore drills, monitoring, legal review of escrow, dispute timeout and callback-failure recovery. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
