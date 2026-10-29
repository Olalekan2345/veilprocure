# Test evidence

Actual results from the developer machine on **2026-10-29** (Windows 11, Node 24.14.1, rustc 1.99.1, PostgreSQL 17.10 local cluster). No CI run exists yet (the repository is not published); the workflow is in `.github/workflows/ci.yml`. Coverage was not measured.

| Suite | Command | Result |
|---|---|---|
| Contract state machine (Rust) | `cd contracts/veilprocure && cargo test -p veilprocure-core` | `test result: ok. 37 passed; 0 failed` |
| Contract WASM build | `cd contracts/veilprocure/contract && cargo near build non-reproducible-wasm --no-abi` | built, 205,048 bytes, SHA-256 `207b23c0…bc941` (identical on rebuild) |
| Shared domain (commitments, policy, evaluation, money) | `pnpm --filter @veilprocure/shared test` | `Tests 22 passed (22)` |
| Database security on real Postgres | `pnpm --filter @veilprocure/db test` | `Tests 10 passed (10)` |
| Web security primitives | `pnpm --filter @veilprocure/web test` | `Tests 9 passed (9)` |
| Worker / AI fail-closed | `pnpm --filter @veilprocure/worker test` | `Tests 8 passed (8)` |
| Browser E2E (Chromium desktop + Pixel 7 mobile) | `pnpm test:e2e` (app on :3000) | `8 passed` |
| Typecheck | `tsc --noEmit` in shared, db, web, worker | 0 errors |

## What the tests prove

- **Contract**: every transition and its authorisation; exact funding (under/over/zero deposit); duplicate/replayed bid versions; late bids by chain time; early close; malformed hashes and hex; overflow of time windows; revision/round caps; supplier decline (funded and unfunded), no-response reclaim, mutual cancellation, disputes with narrow outcomes; failed receiver transfer → retry; stale, replayed, wrong-round and wrong-kind callbacks; and a 400-seed randomised property test of the money invariants.
- **Cross-language vectors**: invite leaf (Rust == TypeScript == Python) and bid commitment (TypeScript == independent Python, `scripts/vectors/bid_commitment_vector.py`).
- **Tamper evidence**: changing any bound field (network, contract, RFQ, supplier, version, price, schedule, attachments, salt) changes the commitment; length-prefixing prevents field-boundary ambiguity.
- **Database (veil_app role, RLS)**: supplier-to-supplier IDOR blocked by id; buyer sees nothing before close and only *committed* revisions after; another buyer sees nothing; no-context queries fail closed; committed quote content immutable even for its owner and the BYPASSRLS worker; audit log append-only; published policy fields frozen; a wallet bound to one user at a time.
- **Web**: envelope encryption AAD binding and tamper detection; download tokens bound to file/user/expiry; content sniffing rejects HTML/SVG/executables; path traversal in filenames; NEP-413 verification with real ed25519 signatures and rejection of altered recipient/nonce/message and of function-call keys; contract error surfacing; SQL parameters never logged.
- **Worker**: unconfigured AI is `blocked` with zero network calls; unverifiable attestation never reaches the model; RTMR3 replay/forgery; EIP-191 recovery; schema containment of injected sources.
- **E2E**: honest public pages; auth required for the workspace; sign-in links single-use and not consumed by GET prefetch; fresh buyer onboarding with zero-valued empty states, encrypted draft at rest, publish gating; cross-organisation IDOR returns 404 for view/edit/compare; API rejects cross-site and unauthenticated calls; sign-in rate limit; mobile navigation.

## Bugs found by these tests (and fixed)

1. Invite leaf binding lived in the wrapper (untestable) → moved into the core.
2. `promise_result_checked(0, 0)` would treat a successful promise with output as failure → explicit `TooLong` handling.
3. Error logging leaked SQL parameters (e-mails, ciphertext) → redacted summaries.
4. Raw SQL `Date` parameter broke the rate limiter → ISO string with cast.
5. `X-Forwarded-For` was trusted unconditionally (rate-limit bypass) → only with `TRUST_PROXY_HEADERS=true`.
6. Workspace navigation stayed stale after creating an organisation → layout revalidation.

## Not yet tested (blocked)

Testnet deployment and every on-chain journey (A03, A05–A08, A13–A18, Journey C contract calls, Journey D on chain) — blocked on deployment approval. Live attested NEAR AI inference (A10/A11 live) — blocked on an API key. Real e-mail delivery — no provider credentials. Backup/restore — no hosted database.
