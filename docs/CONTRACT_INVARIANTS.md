# Contract invariants

Contract: `contracts/veilprocure` — `veilprocure-core` (pure state machine, 37 native tests) + `veilprocure` (near-sdk 5.30.0 wrapper). **Unaudited. Testnet only.** Do not use for real funds.

## State machine

```
RFQ:    Open ──close (chain time ≥ deadline, anyone)──► Closed ──award──► Awarded ──paid──► Settled
          └─cancel (buyer)─► Cancelled ◄─cancel (buyer, no active award)─┘   │
                                     Closed ◄── revoked / declined / refunded ─┘

Award:  Awarded ─fund (exact amount, buyer)─► Funded ─accept (supplier, ≤ accept_by)─► Accepted
          │ revoke (buyer) / decline (supplier) ──► Revoked / Declined (no funds moved)
        Funded ─decline (supplier) or reclaim (buyer, > accept_by)─► RefundPending
        Accepted ─submit_delivery(evidence_hash)─► Delivered
        Delivered ─approve_release (buyer)  or  claim_after_review (supplier, > review deadline)─► ReleasePending
        Accepted|Delivered ─open_dispute (needs agreed reviewer)─► Disputed
        Disputed ─resolve_dispute (reviewer: release_to_supplier | refund_to_buyer)─► Release/RefundPending
        Disputed ─approve_release (buyer, only if delivery exists)─► ReleasePending
        Accepted|Delivered|Disputed ─request_cancel (A) + approve_cancel (other party)─► RefundPending
        ReleasePending ─callback ok─► Paid           ─callback fail─► ReleaseFailed ─retry─► ReleasePending
        RefundPending  ─callback ok─► Refunded       ─callback fail─► RefundFailed  ─retry─► RefundPending
```

## Invariants and where they are enforced

| # | Invariant (brief §7) | Enforcement | Test(s) |
|---|---|---|---|
| 1 | Escrow never exceeds liabilities; principal never mixed with storage | Principal enters only via `fund_award` with `attached == amount` and asserts no storage growth; storage is charged by measured `storage_usage` delta on create/commit/award with excess refunded; global `escrow_liabilities` ledger; `get_escrow_summary` exposes balance vs liabilities + storage | `funding_requires_exact_deposit_from_buyer_once`, randomized ledger test |
| 2 | Nobody funds another buyer's award by accident | `fund` requires `caller == rfq.buyer` | same |
| 3 | No payout without funded, delivered award and designated supplier | release only from `Delivered` (or `Disputed` with delivery) | `release_requires_delivery` |
| 4 | ≤ 1 successful disbursement; ≤ 1 pending transfer | statuses `*Pending` block every transfer-scheduling method; `Paid` is terminal and moves the RFQ to `Settled` | `release_happy_path_pays_once`, randomized test (`paid_count ≤ 1`, pending flag) |
| 5 | Callbacks authenticated and bound to an attempt | `#[private]` (predecessor == contract) + `(round, attempt, kind)` must equal the current award's pending transfer; otherwise `stale_callback` event, no state change | `callback_for_wrong_round_is_stale`, `stale_callback_from_previous_round…`, randomized forged callbacks |
| 6 | Failed transfers are not "paid" and are recoverable | callback failure → `ReleaseFailed`/`RefundFailed`; `retry_transfer` by either party, same destination and amount | `rejected_receiver_transfer_is_recoverable_and_never_double_pays`, `refund_failure_is_retryable` |
| 7 | Amount and destination locked after funding | no method changes `amount`/`supplier`; release → `award.supplier`, refund → `rfq.buyer` only | randomized test asserts destinations |
| 8 | Chain time for deadlines | `env::block_timestamp()`; bids rejected at `now ≥ deadline` even before `close_rfq` | `late_bid_rejected_by_chain_time_even_before_close` |
| 9 | Access from predecessor, never payload | wrapper derives caller from `predecessor_account_id`; invite slots are recomputed from the secret and bound to the first account that uses them | `uninvited_or_wrong_secret_rejected`, `bearer_secret_binds_slot_to_first_user` |
| 10 | Bounded storage / gas | ≤ 20 invite slots, ≤ 20 revisions, ≤ 5 award rounds, account ids ≤ 64, `list_rfqs` ≤ 20; transfer methods require ≥ 40 TGas; callback has 15 TGas static | `create_validates_inputs`, `revision_cap_enforced`, `reaward_after_refund_and_round_cap` |
| 11 | No admin sweep | there is no owner, no admin method, no upgrade method; NEAR sent directly to the contract account is not withdrawable by anyone | code review |
| 12 | Dispute rules match code | reviewer optional, fixed at award (published in policy, accepted by supplier); outcomes exactly two; buyer may concede only after delivery | `reviewer_resolves_with_narrow_outcomes_only`, `dispute_requires_agreed_reviewer`, `buyer_may_concede_dispute_only_after_delivery` |

Every money-moving or commitment method requires ≥ 1 yoctoNEAR so that a wallet must confirm it with a full-access key (function-call keys cannot attach deposits). The 1 yocto is retained as dust and never counted as a liability.

## Async behaviour (honest notes)

- NEAR cross-contract calls are not atomic. A transfer is scheduled after the state change to `*Pending` is committed; the callback runs in a later receipt. If the transfer fails, the refund of the attached amount to the contract arrives via a system refund receipt; principal stays accounted for as a liability.
- If a callback itself failed (it is small and has 15 TGas reserved), the award would remain `*Pending`. There is no recovery method for that case; it is a known residual risk to address before any mainnet use.
- `promise_result_checked(0, 0)` returns `Err(TooLong)` for a *successful* promise with a non-empty result; the wrapper treats `TooLong` as success and only `Failed` as failure.

## Residual risks

Unaudited code; the contract account's own full-access key can redeploy code (deploy to a fresh sub-account and consider deleting its keys after verification — requires a human decision); bearer invite secrets can be front-run by a validator before first use (the app then flags the unknown bidder wallet); no automatic timeout for an unresolved dispute when neither party concedes.
