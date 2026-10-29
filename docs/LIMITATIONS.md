# Limitations & production-readiness gap

VeilProcure is a **public testnet beta / functional prototype**. It is not production-ready for real-money procurement.

## Status matrix (observed evidence only)

| Capability | Status | Evidence / blocker |
|---|---|---|
| E-mail sign-in, sessions, orgs, roles, team invites | BUILT & VERIFIED (local) | E2E + DB tests |
| Encrypted RFQ drafts and rule builder | BUILT & VERIFIED (local) | E2E (ciphertext at rest) |
| Tenant isolation / sealed-quote RLS | BUILT & VERIFIED | `db.test.ts`, E2E IDOR |
| Contract state machine and escrow logic | BUILT & VERIFIED (native tests) | 37 Rust tests |
| Contract on NEAR testnet | BUILT & VERIFIED | `veilprocure-106725.testnet`, code hash verified (docs/DEPLOYMENTS.md) |
| Wallet binding (NEP-413) | BUILT & VERIFIED with real testnet keys (incl. rebind confirmation guard); not yet with a third-party wallet UI | on-chain E2E |
| Publish / bid commit / close / award / fund / accept / deliver / release on testnet | BUILT & VERIFIED | on-chain E2E, 12 txs (docs/TEST_EVIDENCE.md) |
| Refund / cancellation / dispute / failed-transfer retry on testnet | BUILT, NOT VERIFIED on chain | covered by contract tests only |
| Bid commitment construction & recomputation | BUILT & VERIFIED | cross-language vectors |
| Deterministic evaluation & ranking | BUILT & VERIFIED | shared tests |
| Confidential AI notes with attestation | BUILT, fail-closed VERIFIED; live path NOT VERIFIED | needs NEAR AI Cloud API key |
| Chain reconciler worker | BUILT & VERIFIED | projected an out-of-band `claim_after_review` (RFQ #2 → settled/paid) |
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
- The worker's reconciler updates statuses from chain state but does not yet write audit events (the web-side sync does).
- Automated on-chain tests sign through a guarded E2E wallet bridge with test keys, not through a third-party wallet popup.
- Reproducible (Docker) WASM builds were not possible on the development machine; the published hash is from a host build.

## Before any mainnet use

Independent contract and application security audit; KMS-managed keys; malware scanning; legal/regulatory review of escrow; incident response and support; backup/restore drills; nonce-based CSP; dispute timeout policy; callback-failure recovery.
