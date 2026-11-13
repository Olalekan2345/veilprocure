# VeilProcure explainer — transaction and AI evidence

Everything the film shows as a blockchain or AI result is listed here with a way to check it independently. Network: **NEAR testnet** (test tokens, no monetary value). Contract: [`veilprocure-106725.testnet`](https://testnet.nearblocks.io/address/veilprocure-106725.testnet) (unaudited). Nothing in the film touched mainnet.

## How the footage was produced

- **App:** the VeilProcure web app at commit `d6c467f` (plus the film's test files), run locally with Next.js against the real testnet contract, the real NEAR testnet RPC and the real NEAR AI Cloud. The page design is identical to https://veilprocure.netlify.app.
- **Browser:** Chromium driven by Playwright (`tests/e2e/specs/film.spec.ts`) at a human pace. A pointer is drawn in the page at the real mouse position because headless capture has none; the Next.js development badge is hidden. Frames are lossless 1920 × 1080 PNG captured through the DevTools screencast. No frame was edited; zooms, labels and captions are added in the edit on top of the frames.
- **Signing:** each signature was produced with a labelled testnet test account's key (`~/.near-credentials`) through the app's guarded end-to-end wallet bridge, enabled only by `NEXT_PUBLIC_VEIL_E2E_WALLET=1`; the server refuses that setting in production. The app's own transaction preview, "Sign with wallet" button, pending and "Confirmed on chain" states are the real product flow. A third-party wallet's own pop-up does not appear on screen.
- **E-mail:** sign-in and invitation links were delivered to the app's development mailbox (`EMAIL_TRANSPORT=dev-mailbox`) instead of real inboxes; every address is a reserved `.test` domain.
- **People and companies:** all test identities, labelled on screen: *Northwind Studio (test buyer)*, *Clearline Accessibility (test supplier)*, *Harbor Digital (test supplier)*. No customer, testimonial or statistic appears in the film.
- **Explorer pages:** `testnet.nearblocks.io` returns a Cloudflare bot check to automated browsers, so the film does not show explorer pages. Each payment scene instead shows the result of querying NEAR testnet RPC (`EXPERIMENTAL_tx_status` on `https://rpc.testnet.near.org`), labelled as such, with the explorer link printed for viewers to open themselves.

Approval: the project owner approved the testnet transactions, the three deliberate rejected calls and one paid NEAR AI Cloud call on 2026-11-11, and approved each retry after the first two attempts failed (below).

## The filmed journey (attempt 3, recorded 2026-11-11 23:45 → 2026-11-12 00:16 UTC)

Request "Checkout accessibility audit (test request)": on-chain RFQ **#9**, policy hash `709cc13db099e5f28efd3182d4f57e7d1d552beaf13fa1727076a7e9d160215d`, priced in testnet NEAR (maximum 2 NEAR, 21 days, mandatory capability "WCAG 2.2 AA audit experience", weights price 60 % / delivery 30 % / revisions 10 %), bid deadline 2026-11-12 00:06:00 UTC (chain time).

Test quotations entered on camera: Clearline 1.2 NEAR, 14 days, 2 revision rounds (with a test PDF proposal); Harbor Digital 1.5 NEAR, 10 days, 1 revision round.

Checked against NEAR testnet RPC on 2026-11-12 00:22:50 UTC (`.local/video/footage/rpc-verification.json`):

| # | Step | Method | Signer | Attached | Result (RPC) | Block | Time (UTC) | Transaction |
|---|---|---|---|---|---|---|---|---|
| 1 | Buyer publishes the frozen rules (policy hash + one invite leaf per supplier) | `create_rfq` | vp-106725-test-buyer.testnet | 0.05 (storage) | Success | 277284804 | 2026-11-11 23:49:11 | [BeLsJWBjAmSm3zD1VXXiMGgXe2BNEkE6Y6ZBrfEoeoKQ](https://testnet.nearblocks.io/txns/BeLsJWBjAmSm3zD1VXXiMGgXe2BNEkE6Y6ZBrfEoeoKQ) |
| 2 | Clearline seals its quote (salted commitment) | `commit_bid` | vp-106725-test-sup-a.testnet | 0.01 (storage) | Success | 277285042 | 2026-11-11 23:51:35 | [3WF6hPo9WcnNmAMvzbfMQ98oUHJSeTDT7ewZXU9k853n](https://testnet.nearblocks.io/txns/3WF6hPo9WcnNmAMvzbfMQ98oUHJSeTDT7ewZXU9k853n) |
| 3 | Harbor Digital seals its quote | `commit_bid` | vp-106725-test-sup-b.testnet | 0.01 (storage) | Success | 277285274 | 2026-11-11 23:53:47 | [CJdDfcN6fegr9LdCujNzU655vW2ug3BDB8U2hhkT3nJd](https://testnet.nearblocks.io/txns/CJdDfcN6fegr9LdCujNzU655vW2ug3BDB8U2hhkT3nJd) |
| 4 | Buyer closes bidding after the chain-time deadline | `close_rfq` | vp-106725-test-buyer.testnet | — | Success | 277286612 | 2026-11-12 00:07:04 | [9j1XshnBtxn1TVHeFuRH8xnaUEa6cLKjedYHU4pLfYTE](https://testnet.nearblocks.io/txns/9j1XshnBtxn1TVHeFuRH8xnaUEa6cLKjedYHU4pLfYTE) |
| 5 | Buyer awards Clearline (rank 1) | `award_supplier` | vp-106725-test-buyer.testnet | 0.02 (storage) | Success | 277286994 | 2026-11-12 00:10:54 | [64LdSTA2Cg4zhLbQH5qb12qwnP1dZRRoDoKHhQ52ysAQ](https://testnet.nearblocks.io/txns/64LdSTA2Cg4zhLbQH5qb12qwnP1dZRRoDoKHhQ52ysAQ) |
| 6 | Buyer funds the escrow with the winning quote | `fund_award` | vp-106725-test-buyer.testnet | **1.2 NEAR** | Success | 277287053 | 2026-11-12 00:11:30 | [ATdXAHnWUrzAvX2AmMS4LZng5YYDQTZecz7EbWaTUrtg](https://testnet.nearblocks.io/txns/ATdXAHnWUrzAvX2AmMS4LZng5YYDQTZecz7EbWaTUrtg) |
| 7 | *Test:* an outsider tries to release the escrow | `approve_release` | vp-106725-test-outsider.testnet | 1 yoctoNEAR | **Rejected `VP_NOT_BUYER`** | 277287101 | 2026-11-12 00:11:58 | [An7onatrWWfooU4EnHBYvGsKfufb7uQ7crJhrNckrp1G](https://testnet.nearblocks.io/txns/An7onatrWWfooU4EnHBYvGsKfufb7uQ7crJhrNckrp1G) |
| 8 | *Test:* the losing supplier tries to accept the award | `accept_award` | vp-106725-test-sup-b.testnet | 1 yoctoNEAR | **Rejected `VP_NOT_SUPPLIER`** | 277287109 | 2026-11-12 00:12:02 | [AL3icH5wwLGYSmadtbE3895yWGgCDFcp8QdAwepCfo6c](https://testnet.nearblocks.io/txns/AL3icH5wwLGYSmadtbE3895yWGgCDFcp8QdAwepCfo6c) |
| 9 | Clearline accepts the funded award | `accept_award` | vp-106725-test-sup-a.testnet | 1 yoctoNEAR | Success | 277287176 | 2026-11-12 00:12:39 | [AZhjcy91jSKy4Y1KLvmWUPzhduTwQ8cEFqXncAd9dZXW](https://testnet.nearblocks.io/txns/AZhjcy91jSKy4Y1KLvmWUPzhduTwQ8cEFqXncAd9dZXW) |
| 10 | Clearline anchors the delivery-evidence hash | `submit_delivery` | vp-106725-test-sup-a.testnet | 1 yoctoNEAR | Success | 277287327 | 2026-11-12 00:14:03 | [8i5xTuJJtxg2eftYZjM4eefa112iavXoCDeVmr3ufqS2](https://testnet.nearblocks.io/txns/8i5xTuJJtxg2eftYZjM4eefa112iavXoCDeVmr3ufqS2) |
| 11 | Buyer approves; the contract pays Clearline (`approve_release` → transfer → `on_payment_result`) | `approve_release` | vp-106725-test-buyer.testnet | 1 yoctoNEAR | Success | 277287425 | 2026-11-12 00:15:01 | [Dutg14DupfC7vA8Ziv9iyK5G3Fp15M5u94rLo6qjhMob](https://testnet.nearblocks.io/txns/Dutg14DupfC7vA8Ziv9iyK5G3Fp15M5u94rLo6qjhMob) |
| 12 | *Test:* the buyer tries to release a second time | `approve_release` | vp-106725-test-buyer.testnet | 1 yoctoNEAR | **Rejected `VP_NO_AWARD`** (no double payout) | 277287469 | 2026-11-12 00:15:27 | [DfmEVoUASQJp56mYabXAcCpeGRDLaH5uYgWHZAofa6oH](https://testnet.nearblocks.io/txns/DfmEVoUASQJp56mYabXAcCpeGRDLaH5uYgWHZAofa6oH) |

Rows 7, 8 and 12 were sent **directly to the contract from the test process** (not through app buttons), to show that the contract itself enforces who may move the money. They are labelled that way in the film.

**Payout check (RPC `view_account`, finality final):** `vp-106725-test-sup-a.testnet` held 12.187598 NEAR before the release and 13.387598 NEAR after it: **+1.2 NEAR exactly**, the escrowed principal. The supplier pays no gas for the release because the buyer signs it.

**App records after the run:** award status `paid`; the request's audit trail and the Transactions page list the confirmed escrow transactions (shown in the film's closing scenes).

## AI evaluation (one paid NEAR AI Cloud call, this request)

Requested by the buyer on camera after bidding closed; the worker (`pnpm --filter @veilprocure/worker once`) ran once.

| Field | Value |
|---|---|
| Evaluation job | `18b2be2c-60b3-49b7-a379-1d633ae90589` — status **succeeded**, `verified = true`, no failure reasons |
| Model | `Qwen/Qwen3.8-27B` via `https://cloud-api.near.ai`, policy `vp-nearai-1` |
| Signature | `provider_tee`, signing address `0x835ab53d20294ef795906dff21ae4c045336aa26` |
| Attestation | Intel TDX TCB status **UpToDate**; NVIDIA NRAS: **overall attestation true** |
| Gateway quote SHA-256 | `5e0a184f290cd7f816b01c4998ce6fd1b88fe4d5fdf1abbe3ccb8c558f3f8720` |
| Model quote SHA-256 | `e23c55f020be039ac5f5f1a51b52ba2cf3befc55d90bfc164bbf1086d03281ee` |
| Request SHA-256 | `7345f03824893b12d755f9310e12453598976be7fe4f19d89df6dc6965a77084` |
| Response SHA-256 | `8abaacf9771317ad745515830d44486e5805d0943b73e66c6c91206777caf6d2` |

**What this proves:** the quotes were sent only after the gateway and model attestations verified (TEE hardware quotes, NVIDIA GPU attestation), and the response that was shown is the one signed inside that attested environment for this request. **What it does not prove:** that the AI's comments are correct or fair. The notes are advisory; the ranking comes from the published rules, and awarding and paying are separate wallet-signed buyer actions the AI cannot perform. The same pipeline's earlier live verification is recorded in `docs/AI_VERIFICATION.md` (2026-10-30).

## Earlier filming attempts (also real testnet transactions)

| Attempt | What happened | Transactions |
|---|---|---|
| 1 (2026-11-11) | Published RFQ #7; the bid deadline (7 min) was too short for filming pace, so Clearline's bid arrived late and the contract rejected it. Nothing else was signed. | `create_rfq` [58QTf8ry9h9zXqv7BqWhbn224eim1UU7w8ReEk2R7Niw](https://testnet.nearblocks.io/txns/58QTf8ry9h9zXqv7BqWhbn224eim1UU7w8ReEk2R7Niw); `commit_bid` rejected `VP_BIDDING_CLOSED` [CRaqPxh6FRMNq1pXWwRWYrDbJhyWDMwiFY6HmszD4e4q](https://testnet.nearblocks.io/txns/CRaqPxh6FRMNq1pXWwRWYrDbJhyWDMwiFY6HmszD4e4q) |
| 2 (2026-11-11) | Published RFQ #8; the filming script then stalled on the supplier invitation (a reused test e-mail already had an organisation) and was stopped after the deadline. Nothing else was signed. | `create_rfq` [HYDR4BUSN8XKU8Pv4U92ofmAo75mJMq39mLv17DkZK5B](https://testnet.nearblocks.io/txns/HYDR4BUSN8XKU8Pv4U92ofmAo75mJMq39mLv17DkZK5B) |

Checked against NEAR testnet RPC (`.local/video/attempts-rpc-verification.json`): `58QTf8ry…` Success, block 277279373, 2026-11-11 22:55:05 UTC; `CRaqPxh6…` failed `VP_BIDDING_CLOSED`, block 277279793, 22:59:14 UTC; `HYDR4BUS…` Success, block 277281198, 23:13:04 UTC.

RFQ #7 and #8 remain on chain as abandoned test requests with no funds in escrow. None of their footage is used in the film.

## Reproducing the checks

```bash
# every transaction above, against public RPC
node .local/video/verify-rpc.mjs            # reads the film manifest, writes rpc-verification.json
# or one by one
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"EXPERIMENTAL_tx_status","params":{"tx_hash":"ATdXAHnWUrzAvX2AmMS4LZng5YYDQTZecz7EbWaTUrtg","sender_account_id":"vp-106725-test-buyer.testnet","wait_until":"FINAL"}}'
```

The filming script is `tests/e2e/specs/film.spec.ts` (opt-in with `VEIL_FILM=1`; `VEIL_FILM=dry` rehearses without signing).
