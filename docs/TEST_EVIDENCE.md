# Test evidence

Actual results from the developer machine on **2026-10-29/30** (Windows 11, Node 24.14.1, rustc 1.99.1, PostgreSQL 17.10 local cluster). GitHub Actions CI (`.github/workflows/ci.yml`, repo Olalekan2345/veilprocure) passed on every push (jobs `contract` and `node`); runs before the 2026-10-30 author-e-mail rewrite list the earlier commit IDs (first build commit `9e69ec6`, now `5624799`). Coverage was not measured.

| Suite | Command | Result |
|---|---|---|
| Contract state machine (Rust) | `cd contracts/veilprocure && cargo test -p veilprocure-core` | `test result: ok. 37 passed; 0 failed` |
| Contract WASM build | `cd contracts/veilprocure/contract && cargo near build non-reproducible-wasm --no-abi` | built, 205,048 bytes, SHA-256 `207b23c0…bc941` (identical on rebuild) |
| Shared domain (commitments, policy, evaluation, money) | `pnpm --filter @veilprocure/shared test` | `Tests 22 passed (22)` |
| Database security on real Postgres | `pnpm --filter @veilprocure/db test` | `Tests 10 passed (10)` |
| Web security primitives | `pnpm --filter @veilprocure/web test` | `Tests 9 passed (9)` |
| Worker / AI fail-closed | `pnpm --filter @veilprocure/worker test` | `Tests 8 passed (8)` |
| Browser E2E (Chromium desktop + Pixel 7 mobile) | `pnpm test:e2e` (app on :3000) | `8 passed` |
| Browser E2E after the app-wide re-theme, 2026-11-10 | `playwright test specs/offchain.spec.ts specs/landing.spec.ts specs/app-theme.spec.ts` | `23 passed, 1 failed` — the link check timed out while the dev server compiled `/terms` under load; rerun alone: `1 passed (19.0s)`. Web unit tests `9 passed` |
| Typecheck | `tsc --noEmit` in shared, db, web, worker | 0 errors |

## What the tests prove

- **Contract**: every transition and its authorisation; exact funding (under/over/zero deposit); duplicate/replayed bid versions; late bids by chain time; early close; malformed hashes and hex; overflow of time windows; revision/round caps; supplier decline (funded and unfunded), no-response reclaim, mutual cancellation, disputes with narrow outcomes; failed receiver transfer → retry; stale, replayed, wrong-round and wrong-kind callbacks; and a 400-seed randomised property test of the money invariants.
- **Cross-language vectors**: invite leaf (Rust == TypeScript == Python) and bid commitment (TypeScript == independent Python, `scripts/vectors/bid_commitment_vector.py`).
- **Tamper evidence**: changing any bound field (network, contract, RFQ, supplier, version, price, schedule, attachments, salt) changes the commitment; length-prefixing prevents field-boundary ambiguity.
- **Database (veil_app role, RLS)**: supplier-to-supplier IDOR blocked by id; buyer sees nothing before close and only *committed* revisions after; another buyer sees nothing; no-context queries fail closed; committed quote content immutable even for its owner and the BYPASSRLS worker; audit log append-only; published policy fields frozen; a wallet bound to one user at a time.
- **Web**: envelope encryption AAD binding and tamper detection; download tokens bound to file/user/expiry; content sniffing rejects HTML/SVG/executables; path traversal in filenames; NEP-413 verification with real ed25519 signatures and rejection of altered recipient/nonce/message and of function-call keys; contract error surfacing; SQL parameters never logged.
- **Worker**: unconfigured AI is `blocked` with zero network calls; unverifiable attestation never reaches the model; RTMR3 replay/forgery; EIP-191 recovery; schema containment of injected sources.
- **E2E**: honest public pages; auth required for the workspace; sign-in links single-use and not consumed by GET prefetch; fresh buyer onboarding with zero-valued empty states, encrypted draft at rest, publish gating; cross-organisation IDOR returns 404 for view/edit/compare; API rejects cross-site and unauthenticated calls; sign-in rate limit; mobile navigation; the signed-in app uses the website theme (Manrope, heavy headings, green logo only, night-green primary button, no overflow at 1440/390 px, full-height phone menu).

## Bugs found by these tests (and fixed)

1. Invite leaf binding lived in the wrapper (untestable) → moved into the core.
2. `promise_result_checked(0, 0)` would treat a successful promise with output as failure → explicit `TooLong` handling.
3. Error logging leaked SQL parameters (e-mails, ciphertext) → redacted summaries.
4. Raw SQL `Date` parameter broke the rate limiter → ISO string with cast.
5. `X-Forwarded-For` was trusted unconditionally (rate-limit bypass) → only with `TRUST_PROXY_HEADERS=true`.
6. Workspace navigation stayed stale after creating an organisation → layout revalidation.


## On-chain journey (NEAR testnet, real UI) — PASSED

`pnpm --filter @veilprocure/e2e exec playwright test specs/chain.spec.ts --project desktop` → **`1 passed (6.8m)`** on 2026-10-29 23:17 UTC against contract `veilprocure-106725.testnet`.

Three isolated browser sessions (buyer, supplier A, supplier B) drove the real UI: e-mail sign-in, organisations, NEP-413 wallet binding (verified server-side against testnet RPC), RFQ rule builder, publication, invitation acceptance by the invited e-mail only, quote drafting, sealing and committing, buyer blind before deadline (comparison refused; competitor gets 404), close after **chain-time** deadline, both commitments recomputed and **verified**, ranking, award, funding, acceptance, delivery anchoring, release. Wallet signatures were produced in the test process with the labelled test accounts' keys through a guarded E2E bridge (only active when `NEXT_PUBLIC_VEIL_E2E_WALLET=1` and the harness injects it; refused in production). The third-party wallet popup itself is the one component not exercised.

| # | Step | Transaction |
|---|---|---|
| 1 | create_rfq (buyer publishes policy) | [`762JXoufXFzq…`](https://testnet.nearblocks.io/txns/762JXoufXFzqnEwSGY139nuPrLBtR5NWbbR8ScwqfUid) |
| 2 | commit_bid (Test Supplier A (e2e)) | [`7N1oDjDxV1B6…`](https://testnet.nearblocks.io/txns/7N1oDjDxV1B6ZoKvp522XNiDPjFVUERX43J9J7gi6W6E) |
| 3 | commit_bid (Test Supplier B (e2e)) | [`FVcUHZaYCLA9…`](https://testnet.nearblocks.io/txns/FVcUHZaYCLA9SYyyMw2gNHZtoea7fo3wUk4Bs6n2sG4V) |
| 4 | close_rfq | [`Dw8bJGSqyDY7…`](https://testnet.nearblocks.io/txns/Dw8bJGSqyDY7MmRKfsSRgXGf8VoxAzwQmTvpCoFVCytB) |
| 5 | award_supplier | [`2yJetkiyadnU…`](https://testnet.nearblocks.io/txns/2yJetkiyadnUVDExFaFBs17tH41QcZBqsyTQp8ksfj1m) |
| 6 | fund_award (0.5 NEAR principal) | [`F35kVCkhibyZ…`](https://testnet.nearblocks.io/txns/F35kVCkhibyZ75JGpjDPXnfJxLVSsQLFo6pyXumBypzi) |
| 7 | attack: outsider approve_release (rejected VP_NOT_BUYER) | [`G1UXpWLfseYv…`](https://testnet.nearblocks.io/txns/G1UXpWLfseYvLqtxULyQwBNWiDveu8guZpjA2XCdybAt) |
| 8 | attack: losing supplier accept_award (rejected VP_NOT_SUPPLIER) | [`7qhSwCMQwrTg…`](https://testnet.nearblocks.io/txns/7qhSwCMQwrTg8Lt1wf6FpJV2hkj7SNgFv7JPQjQaM6xj) |
| 9 | accept_award (supplier A) | [`5SeKqH8QMKbL…`](https://testnet.nearblocks.io/txns/5SeKqH8QMKbLJpyAZPhhq48MbTZvxRZJqVjKC5EjbyeV) |
| 10 | submit_delivery (evidence hash) | [`AuNb8RoXAU2t…`](https://testnet.nearblocks.io/txns/AuNb8RoXAU2tUvue1NETKCajg89VMqmQWRViCYQ7qh1N) |
| 11 | approve_release → transfer → on_payment_result | [`HY2vAtUmsp2V…`](https://testnet.nearblocks.io/txns/HY2vAtUmsp2Vft7BsxNTJMWBe8vNk2GcSTzXeQDs5Pc6) |
| 12 | attack: second approve_release after payout (rejected) | [`9AuUcmzwBoNQ…`](https://testnet.nearblocks.io/txns/9AuUcmzwBoNQa8Ffr1XkaBvpo1uwYjMmEYk3FwUXJSSY) |

Assertions that passed: supplier A's balance rose by **exactly 500000000000000000000000 yocto (0.5 NEAR)** across the release; the database award status is `paid` with ≥ 5 confirmed escrow transactions; outsider `approve_release` failed with `VP_NOT_BUYER`; the losing supplier's `accept_award` failed with `VP_NOT_SUPPLIER`; a second `approve_release` after payout was rejected.

### Additional on-chain paths

- **Deemed acceptance + reconciler**: in an earlier run's leftover award (RFQ #2, delivered, review window elapsed), supplier A called `claim_after_review` directly: [`7ejt5E3N…`](https://testnet.nearblocks.io/txns/7ejt5E3NNBN65QZwPuzg9eEoitmG2kyDi8vir325D1xM) → contract status `paid`, supplier +0.5 NEAR minus its own gas (499522328072973399999999 yocto net). The worker (`--once`) then reported `reconciled 2 chain change(s)` and the database showed RFQ `settled`, award `paid` — projected from chain state with no UI involvement.
- **Wallet rebind guard**: re-running the journey with new users made the app require explicit confirmation ("This wallet is bound to another VeilProcure user") before moving the test wallets; the test confirms it and a fresh NEP-413 signature is verified.

### Bugs found by the on-chain run (fixed)

7. The success dialog called `router.refresh()` immediately; on the RFQ page this unmounted the dialog (the Publish card disappears) and hid the confirmation receipt. Refresh now happens when the user closes the dialog.

## Live NEAR AI evaluation (A10/A11)

`VEIL_AI_LIVE=1 pnpm exec playwright test specs/ai-live.spec.ts` — **1 passed (1.7 min), rerun 1 passed (1.5 min)** on 2026-10-30. Buyer requested AI notes on RFQ #3 in the UI → `pnpm --filter @veilprocure/worker once` → job `succeeded`, evidence `verified = true` (model `Qwen/Qwen3.8-27B`, `provider_tee` signer `0x835ab53d20294ef795906dff21ae4c045336aa26`, TCB `UpToDate`, NRAS `true`) → notes visible on the comparison page → evidence page `VERIFIED under policy vp-nearai-1` with 27 passing checks. Job ids and hashes: `docs/AI_VERIFICATION.md`.

## Live e-mail sign-in (Gmail SMTP)

2026-10-30, local app with `EMAIL_TRANSPORT=smtp` (`smtp.gmail.com:465`, TLS, app password for the project's own `veilprocure@gmail.com`): `transporter.verify()` succeeded; a sign-in request from the UI showed "Check your inbox" and the outbox row became `sent` at 12:02:11 UTC with Gmail message id `<a60476a4-f765-cd66-ae9d-015302a9a0ed@gmail.com>`. The project owner received the e-mail and opened the link: the login token was consumed at 12:05:00 UTC (by POST, single use) and `auth.signed_in` was recorded at 12:05:01 UTC.

## Escrow paths on NEAR testnet (Journey B, real UI) — PASSED

`pnpm --filter @veilprocure/e2e exec playwright test specs/chain-escrow.spec.ts` → **`1 passed (9.2m)`** on 2026-11-09 (21:41 UTC) against `veilprocure-106725.testnet`. One request with two sealed bids and a dispute reviewer (`vp-106725-test-outsider.testnet`), three award rounds — every refund returns the request to "closed" so the buyer can re-award:

1. **Decline refund:** award A → fund 0.2 NEAR → supplier A declines → the contract refunds the buyer. Buyer balance rose by **exactly 0.2 NEAR**; award round 1 `refunded`.
2. **Mutual cancellation:** award B → fund → B accepts → buyer requests cancellation → B approves → refund. Buyer balance rose by **exactly 0.2 NEAR**; award round 2 `refunded`.
3. **Dispute decided by the reviewer:** award A → fund → accept → delivery anchored → buyer opens a dispute. The buyer's own `resolve_dispute` was **rejected (`VP_NOT_REVIEWER`)**; the reviewer, acting on chain outside the app, released to the supplier: supplier A balance rose by **exactly 0.2 NEAR**. The worker reconciler then projected the outcome from chain state alone (`reconciled 2 chain change(s)`): award round 3 `paid`, request `settled`, buyer page shows "Paid".

| # | Step | Transaction |
|---|---|---|
| 1 | create_rfq (buyer publishes policy) | [`H8YqSR2MVkcX…`](https://testnet.nearblocks.io/txns/H8YqSR2MVkcXEEwo21qRhhVFCiCoweG1WshDfpNhKMij) |
| 2 | commit_bid (Test Escrow Supplier A (e2e)) | [`3jVyCRtNCFuW…`](https://testnet.nearblocks.io/txns/3jVyCRtNCFuWUq88BZnrgBnqqkLJyKLuJ6nwH18iNBtE) |
| 3 | commit_bid (Test Escrow Supplier B (e2e)) | [`Evxz4iGcCXZw…`](https://testnet.nearblocks.io/txns/Evxz4iGcCXZwEJsupwDsDgsUx5hZk4PkGG6texVz6PQm) |
| 4 | close_rfq | [`Bui7XmsPsGtN…`](https://testnet.nearblocks.io/txns/Bui7XmsPsGtNdEUyGw62rfNynMeSpkcsCjPLnpoBHcpQ) |
| 5 | award_supplier round 1 → Test Escrow Supplier A (e2e) | [`3z1ca8YyWQ9i…`](https://testnet.nearblocks.io/txns/3z1ca8YyWQ9iHnHdVjpkaKctubkwNQ9BFRW2wxWLbnER) |
| 6 | fund_award round 1 (0.2 NEAR principal) | [`9BzqqojAaJRS…`](https://testnet.nearblocks.io/txns/9BzqqojAaJRS7qb9rZmMLFaxyoCBLBDyVo7jyeAiQKxQ) |
| 7 | decline_award round 1 → refund → on_refund_result | [`AihYcEdik3Mz…`](https://testnet.nearblocks.io/txns/AihYcEdik3MzXaFsRXq9erWjtKqx2a9XsUAx9SPLbu8a) |
| 8 | award_supplier round 2 → Test Escrow Supplier B (e2e) | [`7WqZYpFw4u9B…`](https://testnet.nearblocks.io/txns/7WqZYpFw4u9BCmKd22KnD8eagVg1Gt8HQnDFN7q25eAT) |
| 9 | fund_award round 2 (0.2 NEAR principal) | [`6RsWfFP2EBB4…`](https://testnet.nearblocks.io/txns/6RsWfFP2EBB48Zh5UembEkMAjv9bionKyyuhCgz5uY1Y) |
| 10 | accept_award round 2 (supplier B) | [`22dWxHfs6Nk8…`](https://testnet.nearblocks.io/txns/22dWxHfs6Nk8byESXi4T8sGuqtofyuXCuc3uQYQCw4Jv) |
| 11 | request_cancel round 2 (buyer) | [`F3oW3nrdtFUY…`](https://testnet.nearblocks.io/txns/F3oW3nrdtFUYgaFc3kUNfML3u8fiTDhTrLe4UvwFaudW) |
| 12 | approve_cancel round 2 (supplier B) → refund → on_refund_result | [`7C3wYFZoYhaM…`](https://testnet.nearblocks.io/txns/7C3wYFZoYhaMrKiU7EpS5VyaZk2Ya4D5W7t1FTE6NyuB) |
| 13 | award_supplier round 3 → Test Escrow Supplier A (e2e) | [`EnGkZhGY6h98…`](https://testnet.nearblocks.io/txns/EnGkZhGY6h98Jxk2uRA3LmGbVRbLfb42HDRd5iLEs5NG) |
| 14 | fund_award round 3 (0.2 NEAR principal) | [`Ccdj3TzTeTrd…`](https://testnet.nearblocks.io/txns/Ccdj3TzTeTrdrErLXzhXjaoCkk1Bu2Pi9vuiw3nYN4Mr) |
| 15 | accept_award round 3 (supplier A) | [`56Dvd1t9RkWA…`](https://testnet.nearblocks.io/txns/56Dvd1t9RkWAeCyyoWpdg4zXcEix5cjZ7nNJYi43TnAV) |
| 16 | submit_delivery round 3 (evidence hash) | [`FiS3MkUib17C…`](https://testnet.nearblocks.io/txns/FiS3MkUib17CyvFyRKkfyZqpcMszndiYwyMyQoP5Ki3P) |
| 17 | open_dispute round 3 (buyer) | [`FJuD2m42WAU4…`](https://testnet.nearblocks.io/txns/FJuD2m42WAU4X7GMsYVJ3mYvqnvbcuwsgjSJjuTK96d4) |
| 18 | attack: buyer resolve_dispute in own favour (rejected VP_NOT_REVIEWER) | [`G65cddaFxSov…`](https://testnet.nearblocks.io/txns/G65cddaFxSovvFupPXFpmw6664q8kHENGxsPKK48mFPW) |
| 19 | resolve_dispute round 3 by reviewer → release → on_payment_result | [`GttSVbqUwayv…`](https://testnet.nearblocks.io/txns/GttSVbqUwayvZQsdGgAK3KsosepEnSgzDVqJKxcBVdtr) |

Journey A was re-run the same day after the wallet-connect pull request (two-step Connect → Bind): **`1 passed (7.8m)`**, 12 transactions, exact 0.5 NEAR payout and the three attacks rejected again (create_rfq [`BftZ1YGTvnCD…`](https://testnet.nearblocks.io/txns/BftZ1YGTvnCD8kcv594e7pTmyJvyCsqrC3aFAy8Sgko5), commit_bid [`HDThHyYfMGvc…`](https://testnet.nearblocks.io/txns/HDThHyYfMGvchaX9Lvuigjx2dMxoS5fimvfbQcy7UVc2), commit_bid [`4vsnpNFnWs6N…`](https://testnet.nearblocks.io/txns/4vsnpNFnWs6NtZe4eHQYcbvjYqqfLWUe7roAP5bnad9x), close_rfq [`9DuR1qjmbBS8…`](https://testnet.nearblocks.io/txns/9DuR1qjmbBS872kQ2GYEzYVvJiVP9SXi2F9veR3D4Dak), award_supplier [`6DY1aP2mJcq7…`](https://testnet.nearblocks.io/txns/6DY1aP2mJcq7Hg32ZDoHyerREQmMCS8hZJCG6rSgbXDG), fund_award [`9WrXKqiPWyXp…`](https://testnet.nearblocks.io/txns/9WrXKqiPWyXpdkT4GocegBHYqTkfhMUgR5VF32sdF2vG), attack: [`8mVTev7VadLY…`](https://testnet.nearblocks.io/txns/8mVTev7VadLYrdMtreprptHNg3WE5QGMkjicGkHxd6Vz), attack: [`4xE8SPYrT9m5…`](https://testnet.nearblocks.io/txns/4xE8SPYrT9m5Ncasz6PztS249g9MSkFkbWk7YHk9ARJa), accept_award [`CN8WzEpXNKVe…`](https://testnet.nearblocks.io/txns/CN8WzEpXNKVeiFMQdyU6DCkWwHwRaBmBeFZ2NHAo9yYy), submit_delivery [`aoSR69vBFDK6…`](https://testnet.nearblocks.io/txns/aoSR69vBFDK6CNBCDXbxBAr97vnc6mcTn4hAZ7TuV9T), approve_release [`BThEo2UwPv6P…`](https://testnet.nearblocks.io/txns/BThEo2UwPv6PCScgiE1gATrGBYrjbzC3RVoTTM2CDxdF), attack: [`8MgtxqYHMx2P…`](https://testnet.nearblocks.io/txns/8MgtxqYHMx2P7LqoHUK8mobtSq2TkzNoQ94xv7VdkMba)).

## Not yet tested (blocked or pending)

- On-chain failed-transfer → retry (A17) and `reclaim_unaccepted` / `claim_after_review` through the UI — covered by contract unit/property tests (`claim_after_review` was run directly on testnet on 2026-10-29); a failing transfer cannot be induced safely on testnet.
- A third-party wallet's own UI (NEAR Connect popup) with a human — not automatable here.
- Supplier/team invitation e-mails over SMTP (same transport as the verified sign-in e-mail). Backup/restore — no hosted database.
