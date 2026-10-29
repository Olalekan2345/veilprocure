# Limitations & production-readiness gap

VeilProcure is a **public testnet beta / functional prototype**. It is not production-ready for real-money procurement.

## Status matrix (observed evidence only)

| Capability | Status | Evidence / blocker |
|---|---|---|
| E-mail sign-in, sessions, orgs, roles, team invites | BUILT & VERIFIED (local) | E2E + DB tests |
| Encrypted RFQ drafts and rule builder | BUILT & VERIFIED (local) | E2E (ciphertext at rest) |
| Tenant isolation / sealed-quote RLS | BUILT & VERIFIED | `db.test.ts`, E2E IDOR |
| Contract state machine and escrow logic | BUILT & VERIFIED (native tests) | 37 Rust tests |
| Contract on NEAR testnet | BLOCKED | needs human deployment approval |
| Wallet binding (NEP-413) | BUILT, crypto VERIFIED in unit tests; not run with a real wallet | needs a testnet wallet session |
| Publish / bid commit / close / award / fund / accept / deliver / release / refund / dispute UI + server verification | BUILT BUT NOT VERIFIED | needs deployed contract |
| Bid commitment construction & recomputation | BUILT & VERIFIED | cross-language vectors |
| Deterministic evaluation & ranking | BUILT & VERIFIED | shared tests |
| Confidential AI notes with attestation | BUILT, fail-closed VERIFIED; live path NOT VERIFIED | needs NEAR AI Cloud API key |
| Chain reconciler worker | BUILT, runs; chain path NOT VERIFIED | needs deployed contract |
| Real e-mail delivery | BUILT (Resend adapter); NOT VERIFIED | needs provider key + verified sender |
| Hosted deployment, backups, monitoring | BLOCKED | needs host/DB/secret-manager credentials |
| NEAR Intents | OUT OF SCOPE | not integrated |

## Known limitations

- Operators can technically decrypt quotes (server-held KEK in an environment variable; no KMS).
- Attachments are not malware-scanned (quarantine-by-policy, never rendered).
- The contract is unaudited; a stuck callback has no recovery path; a dispute with no concession and no reviewer action has no timeout.
- Invite secrets are bearer tokens until first use; a validator could front-run a first commitment (the app flags unknown bidder wallets).
- Bidding is not anonymous: wallets and timings are public.
- One award and one milestone per RFQ; escrow in testnet NEAR only; the buyer converts the agreed price to NEAR manually.
- Buyer-side chain actions must be signed by the wallet that published the RFQ.
- CSP allows `'unsafe-inline'` scripts (Next.js without nonces).
- Local object storage only (S3-compatible adapter not implemented).
- Reproducible (Docker) WASM builds were not possible on the development machine; the published hash is from a host build.

## Before any mainnet use

Independent contract and application security audit; KMS-managed keys; malware scanning; legal/regulatory review of escrow; incident response and support; backup/restore drills; nonce-based CSP; dispute timeout policy; callback-failure recovery.
