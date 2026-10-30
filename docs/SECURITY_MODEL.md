# Security & privacy model

Exact claim: **supplier quotes are deadline-sealed with audited access controls.** They are not cryptographically unreadable before the deadline, and they are not private from the platform operator.

## Threat model

| Actor | Can see | Cannot do | Controls (where) |
|---|---|---|---|
| Other suppliers | Their own quotes; public chain data (who bid, when) | Read or modify a competitor's quote, before or after close | Server authz by resolved org (`server/authz.ts`, `services/supplier.ts`); Postgres RLS on `quotes`, `quote_revisions`, `private_attachments` (`packages/db/migrations/0001_guards.sql`); tested in `db.test.ts` and E2E IDOR |
| Buyer before deadline | That commitments exist (wallet, version, hash, time) | Read quote rows | RLS returns no rows until the RFQ is `closed`/`awarded`/`settled`, which is only set from verified chain state; comparison service refuses before close |
| Buyer after close | Committed revisions of its own RFQ | See superseded drafts; edit any quote | RLS `status = 'committed'` + read-only policy |
| Another organisation / outsider | Nothing private | Open RFQs, edits, comparisons, files (404) | `loadBuyerRfq` checks membership, returns 404; E2E `IDOR` test |
| Compromised browser session | What that user can see | Move wallet funds without the wallet | HttpOnly SameSite=Lax cookies (`__Host-` + Secure in production); every chain action signed in the user's own wallet with a 1-yocto full-access confirmation |
| Malicious uploads | — | Execute content in the app | Content sniffed server-side (PDF/PNG/JPEG/plain text only; HTML/SVG/scripts rejected), 10 MB cap, encrypted before storage, never rendered inline, `Content-Disposition: attachment`, `nosniff`, `CSP: sandbox`. **Not malware-scanned** (documented quarantine policy; UI says "not malware-scanned") |
| Malicious AI instructions inside quotes | — | Change rules, eligibility, scores, awards or payments | AI runs after deterministic evaluation, has no tools, fixed system prompt, quotes passed as JSON data, schema-constrained output with sources restricted to quote fields, sanitised; output is advisory only and cannot reach any money path |
| Rogue back-office staff / compromised operator | **Could decrypt quotes** (keys are server-side) | Alter committed quote content (DB trigger), rewrite audit history (append-only + hash chain), move escrow (no admin method in contract) | Least-privilege DB roles; encrypted fields with per-record keys and row/tenant-bound AAD; hash-chained audit log verified in the operator console |
| RPC / chain observers | Wallet ids, salted hashes, amounts, statuses, timings | Recover quote contents from commitments | 256-bit secret salt per revision; no plaintext, names, e-mails or file URLs on chain |
| Payment recipient | Their award | Redirect funds or claim another award | Destination locked at award; contract tests |
| AI provider | Committed quote text, only if attestation verified | — | Fail-closed attestation policy (`docs/AI_VERIFICATION.md`) |

Trusted: VeilProcure server operators and key holders; Postgres host; Intel/NVIDIA attestation roots (for AI); NEAR testnet validators; the contract code (unaudited).

## Data protection

- **Envelope encryption** (`packages/shared/src/envelope-node.ts`): AES-256-GCM per value with a fresh DEK, DEK wrapped by a KEK; AAD = canonical `{table, id, org}` so ciphertext cannot be moved between rows or tenants (unit-tested). KEK is an environment variable in this build — **not KMS-managed**. KMS wrap/unwrap is the first production hardening step.
- Encrypted: RFQ drafts, frozen policies, pending publications, invite secrets, quote drafts, revision payloads and salts, attachment names and blobs, agreements, delivery notes, AI notes.
- Plaintext (needed for listing/integrity): RFQ titles, categories, deadlines, statuses, hashes, wallet ids, amounts.
- **Logs** never include quote content, tokens, secrets, signed URLs or SQL parameters (`safeErrorSummary`, unit-tested).

## Identity

- Sign-in (two interchangeable proofs of e-mail ownership, then the same session path):
  - **Privy e-mail code** (when `PRIVY_APP_ID` is set; primary in hosted use). The browser obtains Privy's identity token with the one-time code; the server verifies it independently — ES256 signature against the app's published JWKS (`auth.privy.io/api/v1/apps/<id>/jwks.json`, key id required, one refresh on rotation), `iss = privy.io`, `aud` = our app id, unexpired, issued within the last 10 minutes, `sub` a Privy DID, exactly one linked `email` account. No Privy secret exists on our servers. The SDK runs with in-memory storage and no cookies, and signs out of Privy once our session exists, so no Privy tokens persist on our origin. Server-action origin checks prevent login CSRF; attempts are rate limited per IP.
  - **E-mail link** (`EMAIL_TRANSPORT=resend`, or the dev mailbox locally): 32-byte tokens stored hashed, 15-minute expiry, single use, consumed only by POST (link scanners cannot burn them).
  - Sessions: random token in an HttpOnly cookie; only its SHA-256 is stored. Audit event `auth.signed_in` records the method.
- Wallet binding: NEP-413 signed message with a server nonce (32 bytes), recipient = site host, account, user e-mail, network and expiry inside the message; signature verified with ed25519; the key must be a **full-access** key of the account on testnet (RPC `view_access_key`); challenge is single-use and expires in 10 minutes. A wallet bound to another user moves only after explicit confirmation, and the previous owner is notified.
- CSRF: Server Actions are POST-only with Origin/Host checking by Next.js; JSON route handlers check `Origin` explicitly. Rate limits are Postgres-backed; proxy headers are trusted only with `TRUST_PROXY_HEADERS=true`.

## Transactions

The server prepares every transaction (`tx_intents`) and the UI previews exactly: network, signer, contract, method, arguments, deposit and gas. After signing, the server verifies the finalised transaction matches the intent (signer, receiver, method, canonical args, deposit) and re-reads contract state before changing any record. Duplicate clicks reuse the same open intent; the contract rejects any second transfer.

## Headers

CSP (`frame-ancestors 'none'`, `object-src 'none'`, same-origin scripts/styles with `'unsafe-inline'`), `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive Permissions-Policy, HSTS in production. A nonce-based script CSP is a follow-up.

## Not done (blocks a "production" claim)

Professional contract audit; KMS-managed keys; malware scanning; backups and restore test on a hosted database; error monitoring with redaction; penetration test; legal review.
