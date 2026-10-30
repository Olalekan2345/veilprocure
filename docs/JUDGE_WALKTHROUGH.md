# Judge walkthrough

Steps marked **[chain]** use the deployed testnet contract `veilprocure-106725.testnet` (set `NEAR_CONTRACT_ID`); without it the app shows "On-chain actions are disabled on this server" instead of pretending. They were verified end to end by `tests/e2e/specs/chain.spec.ts`. Steps marked **[AI]** need a NEAR AI Cloud key on the worker; they were verified live by `tests/e2e/specs/ai-live.spec.ts`. `pnpm --filter @veilprocure/worker attest:check` lets anyone with a key re-run the attestation checks without sending content.

## Run locally

```bash
pnpm install
node scripts/dev-db.mjs start        # project-local PostgreSQL on 127.0.0.1:54341
node scripts/setup-env.mjs           # writes apps/web/.env.local + apps/worker/.env (local secrets)
pnpm db:migrate                      # MIGRATION_DATABASE_URL from .local/db.env
pnpm dev                             # http://localhost:3000
pnpm worker                          # optional: reconciler + AI jobs
```
(`pnpm db:migrate` reads `MIGRATION_DATABASE_URL`; export it from `.local/db.env` first.)

## Do X → see Y

| Do | See |
|---|---|
| Open `/` | Product explanation, testnet banner, disclosure map; no logos, testimonials or counters |
| Sign in with any e-mail | Honest "e-mail delivery is not configured" notice; link appears at `/dev/mailbox` (dev only) |
| Open the link, click Continue | Signed in; onboarding explains buyer vs supplier |
| Create a buyer organisation | Dashboard with zeros and "Create your first request" |
| New request → fill scope, rules, weights, suppliers → Save & review | "Ready to publish?" with concrete blockers (deadline, wallet, contract) |
| Sign in as a *different* user and open the first request's URL | 404 — the request is invisible to other organisations |
| `/app/wallet` → Connect & bind **[wallet]** | NEP-413 challenge signed in the wallet; bound only after signature + full-access-key check |
| Publish on NEAR testnet **[chain]** | Preview (signer, contract, method, args, deposit, gas) → wallet → "Checking on NEAR testnet" → policy hash + explorer link |
| Invite link (dev mailbox) as the invited supplier → accept → write quote → Seal & commit **[chain]** | Immutable revision, salted commitment on chain, downloadable receipt with salt |
| Buyer opens the request before the deadline | Commitments only (wallet, version, hash, time); contents sealed |
| After the deadline: Close bidding **[chain]** → Open comparison | Each quote "Commitment verified" (recomputed vs chain), pass/fail per rule with basis, exact-arithmetic ranking |
| Request AI notes **[AI]**, then run the worker | "Attestation and signature verified" with per-quote notes citing quote fields; "View evidence" lists 27 passing checks. Without a key: "unavailable — nothing was sent"; failed checks: "UNVERIFIED — notes withheld" |
| Award → Fund escrow → (supplier) Accept → Anchor delivery → (buyer) Approve & release **[chain]** | Award status follows the contract; escrow transactions with explorer links; payout only after the callback confirms |
| Click "Approve & release" twice | Second attempt rejected (`WRONG_AWARD_STATE` / contract `VP_WRONG_AWARD_STATE`) |
| `/app/activity` | Hash-chained audit trail with tx links |

## Two-to-three-minute demo storyboard (record only what works live)

1. Problem (0–20s): a buyer comparing confidential quotes — open a real draft.
2. Publish (20–40s): rules + on-chain policy hash **[chain]**.
3. Confidentiality (40–70s): two supplier sessions commit; show a competitor's 404 and the buyer's sealed view.
4. Verified AI (70–110s): comparison with integrity checks; AI notes only if verified **[AI]** — otherwise show the honest blocked state.
5. Money (110–145s): award, fund, accept, deliver, release; explorer receipt **[chain]**.
6. Safety (145–170s): double release rejected; testnet beta caveat.
