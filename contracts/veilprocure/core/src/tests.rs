#![cfg(test)]

use super::*;
use sha2::{Digest, Sha256};

const BUYER: &str = "buyer.testnet";
const SUP_A: &str = "alpha.testnet";
const SUP_B: &str = "beta.testnet";
const SUP_C: &str = "gamma.testnet";
const MALLORY: &str = "mallory.testnet";
const REVIEWER: &str = "reviewer.testnet";
const CONTRACT: &str = "veilprocure.testnet";
const T0: u64 = 1_700_000_000 * NS_PER_SEC;
const HOUR: u64 = 3600 * NS_PER_SEC;
const DEADLINE: u64 = T0 + HOUR;
const AMOUNT: u128 = 5 * ONE_NEAR;
const ACCEPT_WINDOW: u64 = 24 * HOUR;
const REVIEW_WINDOW: u64 = 72 * HOUR;

fn sha(bytes: &[u8]) -> Hash32 {
    Sha256::digest(bytes).into()
}
fn h(b: u8) -> Hash32 {
    [b; 32]
}
fn secret(account: &str) -> Hash32 {
    sha(format!("secret:{account}").as_bytes())
}
fn leaf(policy: &Hash32, account: &str) -> Hash32 {
    sha(&invite_leaf_preimage(policy, &secret(account)))
}
fn ctx(caller: &str, now_ns: u64, attached: u128) -> Ctx<'_> {
    Ctx { caller, now_ns, attached }
}
fn y(caller: &str, now_ns: u64) -> Ctx<'_> {
    ctx(caller, now_ns, ONE_YOCTO)
}

fn new_rfq() -> Rfq {
    let policy = h(0x11);
    let (rfq, out) = Rfq::create(
        1,
        &ctx(BUYER, T0, 0),
        policy,
        h(0x22),
        DEADLINE,
        vec![leaf(&policy, SUP_A), leaf(&policy, SUP_B)],
    )
    .unwrap();
    assert_eq!(out.event.name, "rfq_created");
    rfq
}

fn commit(rfq: &mut Rfq, supplier: &str, version: u32, c: u8, now: u64) -> Res<Outcome> {
    rfq.commit_bid(&ctx(supplier, now, 0), h(c), version, &secret(supplier), sha)
}

fn closed() -> Rfq {
    let mut rfq = new_rfq();
    commit(&mut rfq, SUP_A, 1, 0xA1, T0 + 10).unwrap();
    commit(&mut rfq, SUP_B, 1, 0xB1, T0 + 20).unwrap();
    rfq.close(&ctx(MALLORY, DEADLINE, 0)).unwrap();
    rfq
}

fn awarded(reviewer: Option<&str>) -> Rfq {
    let mut rfq = closed();
    rfq.award(&ctx(BUYER, DEADLINE + 1, 0), SUP_A, h(0x33), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, reviewer, CONTRACT)
        .unwrap();
    rfq
}

const FUND_AT: u64 = DEADLINE + 100;

fn funded(reviewer: Option<&str>) -> Rfq {
    let mut rfq = awarded(reviewer);
    let out = rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT)).unwrap();
    assert_eq!(out.escrow_in, AMOUNT);
    rfq
}

fn accepted(reviewer: Option<&str>) -> Rfq {
    let mut rfq = funded(reviewer);
    rfq.accept(&y(SUP_A, FUND_AT + 10)).unwrap();
    rfq
}

const DELIVERED_AT: u64 = FUND_AT + 1000;

fn delivered(reviewer: Option<&str>) -> Rfq {
    let mut rfq = accepted(reviewer);
    rfq.submit_delivery(&y(SUP_A, DELIVERED_AT), h(0x44)).unwrap();
    rfq
}

fn award(rfq: &Rfq) -> &Award {
    rfq.current_award().unwrap()
}

// ---------- cross-language vector ----------

#[test]
fn invite_leaf_matches_cross_language_vector() {
    // Computed independently with Python hashlib; asserted again in packages/shared tests.
    let pre = invite_leaf_preimage(&h(0x11), &h(0x22));
    assert_eq!(pre.len(), 86);
    assert_eq!(to_hex(&sha(&pre)), "948345eaecf2cf9117bb484de543c286d6157ee2faefcc0f4e704bd855e9e8ec");
}

#[test]
fn hex_roundtrip_and_malformed_input() {
    let hx = to_hex(&h(0xab));
    assert_eq!(parse_hash32(&hx).unwrap(), h(0xab));
    assert_eq!(parse_hash32(&hx.to_uppercase()).unwrap(), h(0xab));
    assert_eq!(parse_hash32("abc"), Err(Error::InvalidHash));
    assert_eq!(parse_hash32(&"zz".repeat(32)), Err(Error::InvalidHash));
    assert_eq!(parse_hash32(&"a".repeat(65)), Err(Error::InvalidHash));
    assert_eq!(parse_hash32(""), Err(Error::InvalidHash));
}

// ---------- create ----------

#[test]
fn create_validates_inputs() {
    let p = h(0x11);
    let l = leaf(&p, SUP_A);
    let c = ctx(BUYER, T0, 0);
    assert_eq!(Rfq::create(1, &c, [0; 32], h(2), DEADLINE, vec![l]).unwrap_err(), Error::InvalidHash);
    assert_eq!(Rfq::create(1, &c, p, [0; 32], DEADLINE, vec![l]).unwrap_err(), Error::InvalidHash);
    assert_eq!(Rfq::create(1, &c, p, h(2), DEADLINE, vec![]).unwrap_err(), Error::NoInvites);
    assert_eq!(Rfq::create(1, &c, p, h(2), DEADLINE, vec![l, l]).unwrap_err(), Error::DuplicateInvite);
    assert_eq!(Rfq::create(1, &c, p, h(2), DEADLINE, vec![[0; 32]]).unwrap_err(), Error::InvalidHash);
    let many: Vec<Hash32> = (0..=MAX_SUPPLIERS as u8).map(|i| h(i + 1)).collect();
    assert_eq!(Rfq::create(1, &c, p, h(2), DEADLINE, many).unwrap_err(), Error::TooManyInvites);
    // deadline must be at least MIN_WINDOW in the future and within MAX_BIDDING_WINDOW
    assert_eq!(Rfq::create(1, &c, p, h(2), T0, vec![l]).unwrap_err(), Error::InvalidDeadline);
    assert_eq!(Rfq::create(1, &c, p, h(2), T0 + MIN_WINDOW_NS - 1, vec![l]).unwrap_err(), Error::InvalidDeadline);
    assert!(Rfq::create(1, &c, p, h(2), T0 + MIN_WINDOW_NS, vec![l]).is_ok());
    assert_eq!(
        Rfq::create(1, &c, p, h(2), T0 + MAX_BIDDING_WINDOW_NS + 1, vec![l]).unwrap_err(),
        Error::InvalidDeadline
    );
    // overflow of now + window is rejected rather than wrapping
    let late = ctx(BUYER, u64::MAX - 5, 0);
    assert_eq!(Rfq::create(1, &late, p, h(2), u64::MAX, vec![l]).unwrap_err(), Error::Overflow);
}

// ---------- bidding ----------

#[test]
fn invited_suppliers_commit_and_revise() {
    let mut rfq = new_rfq();
    let out = commit(&mut rfq, SUP_A, 1, 0xA1, T0 + 1).unwrap();
    assert_eq!(out.event.name, "bid_committed");
    assert_eq!(out.event.get("version"), Some("1"));
    commit(&mut rfq, SUP_A, 3, 0xA2, T0 + 2).unwrap();
    let bid = &rfq.bids[0];
    assert_eq!((bid.version, bid.revisions, bid.commitment), (3, 1, h(0xA2)));
    assert_eq!(bid.first_committed_at_ns, T0 + 1);
    assert_eq!(rfq.bids.len(), 1, "revision replaces, does not append");
}

#[test]
fn uninvited_or_wrong_secret_rejected() {
    let mut rfq = new_rfq();
    assert_eq!(commit(&mut rfq, SUP_C, 1, 1, T0 + 1).unwrap_err(), Error::NotInvited);
    assert_eq!(rfq.commit_bid(&ctx(SUP_A, T0 + 1, 0), h(1), 1, &h(0x99), sha).unwrap_err(), Error::NotInvited);
    assert!(rfq.bids.is_empty());
    // alpha bids; its secret is now public in the tx args. Mallory replays it: slot is bound.
    commit(&mut rfq, SUP_A, 1, 0xA1, T0 + 2).unwrap();
    let alpha_secret = secret(SUP_A);
    assert_eq!(
        rfq.commit_bid(&ctx(MALLORY, T0 + 3, 0), h(1), 1, &alpha_secret, sha).unwrap_err(),
        Error::InviteAlreadyUsed
    );
    // beta cannot take a second slot with alpha's secret either, nor switch slots later
    commit(&mut rfq, SUP_B, 1, 0xB1, T0 + 4).unwrap();
    assert_eq!(rfq.commit_bid(&ctx(SUP_B, T0 + 5, 0), h(1), 2, &alpha_secret, sha).unwrap_err(), Error::InviteAlreadyUsed);
    assert_eq!(rfq.bids.len(), 2);
}

#[test]
fn bearer_secret_binds_slot_to_first_user() {
    // Documented residual risk (docs/SECURITY_MODEL.md): an invite secret is a bearer token
    // until first use. Whoever uses it first owns the slot; the app flags any bidder account that
    // is not bound to the invited organization as ineligible.
    let mut rfq = new_rfq();
    let alpha_secret = secret(SUP_A);
    rfq.commit_bid(&ctx(MALLORY, T0 + 1, 0), h(1), 1, &alpha_secret, sha).unwrap();
    assert_eq!(commit(&mut rfq, SUP_A, 1, 0xA1, T0 + 2).unwrap_err(), Error::InviteAlreadyUsed);
    assert_eq!(rfq.bids[0].supplier, MALLORY);
    assert_eq!(rfq.bids[0].invite_leaf, leaf(&rfq.policy_hash, SUP_A));
}

#[test]
fn buyer_cannot_bid_even_with_leaf() {
    let policy = h(0x11);
    let (mut rfq, _) =
        Rfq::create(1, &ctx(BUYER, T0, 0), policy, h(2), DEADLINE, vec![leaf(&policy, BUYER)]).unwrap();
    assert_eq!(rfq.commit_bid(&ctx(BUYER, T0 + 1, 0), h(1), 1, &secret(BUYER), sha).unwrap_err(), Error::BuyerCannotBid);
}

#[test]
fn bad_commitment_and_versions_rejected() {
    let mut rfq = new_rfq();
    assert_eq!(rfq.commit_bid(&ctx(SUP_A, T0, 0), [0; 32], 1, &secret(SUP_A), sha).unwrap_err(), Error::InvalidHash);
    assert_eq!(commit(&mut rfq, SUP_A, 0, 1, T0).unwrap_err(), Error::VersionNotIncreasing);
    commit(&mut rfq, SUP_A, 2, 1, T0).unwrap();
    // duplicate / replayed version
    assert_eq!(commit(&mut rfq, SUP_A, 2, 9, T0 + 1).unwrap_err(), Error::VersionNotIncreasing);
    assert_eq!(commit(&mut rfq, SUP_A, 1, 9, T0 + 1).unwrap_err(), Error::VersionNotIncreasing);
    assert_eq!(rfq.bids[0].commitment, h(1), "rejected revision leaves state untouched");
}

#[test]
fn revision_cap_enforced() {
    let mut rfq = new_rfq();
    commit(&mut rfq, SUP_A, 1, 1, T0).unwrap();
    for v in 2..=(MAX_REVISIONS + 1) {
        commit(&mut rfq, SUP_A, v, 1, T0).unwrap();
    }
    assert_eq!(commit(&mut rfq, SUP_A, MAX_REVISIONS + 2, 1, T0).unwrap_err(), Error::TooManyRevisions);
}

#[test]
fn late_bid_rejected_by_chain_time_even_before_close() {
    let mut rfq = new_rfq();
    assert_eq!(commit(&mut rfq, SUP_A, 1, 1, DEADLINE).unwrap_err(), Error::BiddingClosed);
    assert_eq!(commit(&mut rfq, SUP_A, 1, 1, DEADLINE + 1).unwrap_err(), Error::BiddingClosed);
    assert!(commit(&mut rfq, SUP_A, 1, 1, DEADLINE - 1).is_ok());
}

#[test]
fn withdraw_and_reinstate() {
    let mut rfq = new_rfq();
    assert_eq!(rfq.withdraw_bid(&y(SUP_A, T0)).unwrap_err(), Error::NoActiveBid);
    commit(&mut rfq, SUP_A, 1, 1, T0).unwrap();
    assert_eq!(rfq.withdraw_bid(&ctx(SUP_A, T0, 0)).unwrap_err(), Error::RequiresOneYocto);
    rfq.withdraw_bid(&y(SUP_A, T0 + 1)).unwrap();
    assert!(rfq.bids[0].withdrawn);
    assert_eq!(rfq.withdraw_bid(&y(SUP_A, T0 + 2)).unwrap_err(), Error::NoActiveBid);
    commit(&mut rfq, SUP_A, 2, 2, T0 + 3).unwrap();
    assert!(!rfq.bids[0].withdrawn);
    assert_eq!(rfq.withdraw_bid(&y(SUP_A, DEADLINE)).unwrap_err(), Error::BiddingClosed);
}

// ---------- close / cancel ----------

#[test]
fn early_close_rejected_late_close_permissionless() {
    let mut rfq = new_rfq();
    assert_eq!(rfq.close(&ctx(MALLORY, DEADLINE - 1, 0)).unwrap_err(), Error::DeadlineNotReached);
    let out = rfq.close(&ctx(MALLORY, DEADLINE, 0)).unwrap();
    assert_eq!(out.event.get("closed_by"), Some(MALLORY));
    assert_eq!(rfq.status, RfqStatus::Closed);
    assert_eq!(rfq.close(&ctx(BUYER, DEADLINE + 1, 0)).unwrap_err(), Error::RfqNotOpen);
    assert_eq!(commit(&mut rfq, SUP_A, 1, 1, DEADLINE - 1).unwrap_err(), Error::RfqNotOpen);
}

#[test]
fn buyer_cancellation_rules() {
    let mut rfq = new_rfq();
    assert_eq!(rfq.cancel(&y(MALLORY, T0)).unwrap_err(), Error::NotBuyer);
    assert_eq!(rfq.cancel(&ctx(BUYER, T0, 0)).unwrap_err(), Error::RequiresOneYocto);
    rfq.cancel(&y(BUYER, T0)).unwrap();
    assert_eq!(rfq.status, RfqStatus::Cancelled);
    assert_eq!(commit(&mut rfq, SUP_A, 1, 1, T0 + 1).unwrap_err(), Error::RfqNotOpen);

    let mut rfq = awarded(None);
    assert_eq!(rfq.cancel(&y(BUYER, DEADLINE + 5)).unwrap_err(), Error::RfqNotCancellable);
    rfq.revoke_award(&y(BUYER, DEADLINE + 6)).unwrap();
    rfq.cancel(&y(BUYER, DEADLINE + 7)).unwrap();
}

// ---------- award ----------

#[test]
fn award_requires_buyer_closed_rfq_and_active_bid() {
    let mut rfq = new_rfq();
    commit(&mut rfq, SUP_A, 1, 1, T0).unwrap();
    let c = ctx(BUYER, DEADLINE + 1, 0);
    assert_eq!(
        rfq.award(&c, SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(),
        Error::RfqNotClosed
    );
    let mut rfq = closed();
    let m = ctx(MALLORY, DEADLINE + 1, 0);
    assert_eq!(
        rfq.award(&m, MALLORY, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(),
        Error::NotBuyer
    );
    assert_eq!(
        rfq.award(&c, SUP_C, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(),
        Error::NoActiveBid
    );
    assert_eq!(rfq.award(&c, SUP_A, [0; 32], AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(), Error::InvalidHash);
    assert_eq!(rfq.award(&c, SUP_A, h(3), 0, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(), Error::InvalidAmount);
    assert_eq!(
        rfq.award(&c, SUP_A, h(3), MAX_AWARD_YOCTO + 1, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(),
        Error::InvalidAmount
    );
    assert_eq!(rfq.award(&c, SUP_A, h(3), AMOUNT, 1, REVIEW_WINDOW, None, CONTRACT).unwrap_err(), Error::InvalidWindow);
    assert_eq!(
        rfq.award(&c, SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, MAX_REVIEW_WINDOW_NS + 1, None, CONTRACT).unwrap_err(),
        Error::InvalidWindow
    );
    for bad in [BUYER, SUP_A, CONTRACT] {
        assert_eq!(
            rfq.award(&c, SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, Some(bad), CONTRACT).unwrap_err(),
            Error::ReviewerConflict
        );
    }
    let out = rfq.award(&c, SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, Some(REVIEWER), CONTRACT).unwrap();
    assert_eq!(out.event.get("amount_yocto"), Some(AMOUNT.to_string().as_str()));
    assert_eq!(rfq.status, RfqStatus::Awarded);
    assert_eq!(
        rfq.award(&c, SUP_B, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap_err(),
        Error::RfqNotClosed,
        "no second concurrent award"
    );
}

#[test]
fn withdrawn_bid_cannot_be_awarded() {
    let mut rfq = new_rfq();
    commit(&mut rfq, SUP_A, 1, 1, T0).unwrap();
    rfq.withdraw_bid(&y(SUP_A, T0 + 1)).unwrap();
    rfq.close(&ctx(BUYER, DEADLINE, 0)).unwrap();
    assert_eq!(
        rfq.award(&ctx(BUYER, DEADLINE, 0), SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT)
            .unwrap_err(),
        Error::NoActiveBid
    );
}

// ---------- funding ----------

#[test]
fn funding_requires_exact_deposit_from_buyer_once() {
    let mut rfq = awarded(None);
    assert_eq!(rfq.fund(&ctx(MALLORY, FUND_AT, AMOUNT)).unwrap_err(), Error::NotBuyer);
    assert_eq!(rfq.fund(&ctx(SUP_A, FUND_AT, AMOUNT)).unwrap_err(), Error::NotBuyer);
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT - 1)).unwrap_err(), Error::WrongDeposit);
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT + 1)).unwrap_err(), Error::WrongDeposit);
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT, 0)).unwrap_err(), Error::WrongDeposit);
    let out = rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT)).unwrap();
    assert_eq!((out.escrow_in, out.transfer.clone()), (AMOUNT, None));
    assert_eq!(award(&rfq).accept_by_ns, FUND_AT + ACCEPT_WINDOW);
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT + 1, AMOUNT)).unwrap_err(), Error::WrongAwardState, "no double funding");
    assert_eq!(rfq.escrowed(), AMOUNT);
}

#[test]
fn funding_before_award_or_after_revoke_rejected() {
    let mut rfq = closed();
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT)).unwrap_err(), Error::NoAward);
    let mut rfq = awarded(None);
    rfq.revoke_award(&y(BUYER, FUND_AT)).unwrap();
    assert_eq!(rfq.fund(&ctx(BUYER, FUND_AT, AMOUNT)).unwrap_err(), Error::NoAward);
}

// ---------- acceptance / decline / no response ----------

#[test]
fn only_selected_supplier_accepts_within_window() {
    let mut rfq = funded(None);
    assert_eq!(rfq.accept(&y(SUP_B, FUND_AT + 1)).unwrap_err(), Error::NotSupplier);
    assert_eq!(rfq.accept(&y(BUYER, FUND_AT + 1)).unwrap_err(), Error::NotSupplier);
    assert_eq!(rfq.accept(&ctx(SUP_A, FUND_AT + 1, 0)).unwrap_err(), Error::RequiresOneYocto);
    assert_eq!(rfq.accept(&y(SUP_A, FUND_AT + ACCEPT_WINDOW + 1)).unwrap_err(), Error::AcceptWindowExpired);
    rfq.accept(&y(SUP_A, FUND_AT + ACCEPT_WINDOW)).unwrap();
    assert_eq!(award(&rfq).status, AwardStatus::Accepted);
    assert_eq!(rfq.accept(&y(SUP_A, FUND_AT + 2)).unwrap_err(), Error::WrongAwardState);
}

#[test]
fn accept_unfunded_award_rejected() {
    let mut rfq = awarded(None);
    assert_eq!(rfq.accept(&y(SUP_A, FUND_AT)).unwrap_err(), Error::WrongAwardState);
}

#[test]
fn supplier_refusal_unfunded_returns_rfq_to_closed() {
    let mut rfq = awarded(None);
    let out = rfq.decline(&y(SUP_A, FUND_AT)).unwrap();
    assert!(out.transfer.is_none());
    assert_eq!(award(&rfq).status, AwardStatus::Declined);
    assert_eq!(rfq.status, RfqStatus::Closed);
    // buyer can now award the other bidder in round 2
    rfq.award(&ctx(BUYER, FUND_AT + 1, 0), SUP_B, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT)
        .unwrap();
    assert_eq!(award(&rfq).round, 2);
}

#[test]
fn supplier_refusal_after_funding_refunds_buyer() {
    let mut rfq = funded(None);
    let out = rfq.decline(&y(SUP_A, FUND_AT + 5)).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.amount, t.kind, t.attempt), (BUYER, AMOUNT, TransferKind::Refund, 1));
    assert_eq!(out.escrow_out, 0, "not counted as refunded until callback");
    let done = rfq.on_transfer_result(FUND_AT + 6, 1, 1, TransferKind::Refund, true);
    assert_eq!((done.event.name, done.escrow_out), ("transfer_succeeded", AMOUNT));
    assert_eq!(award(&rfq).status, AwardStatus::Refunded);
    assert_eq!(rfq.status, RfqStatus::Closed);
    assert_eq!(rfq.escrowed(), 0);
}

#[test]
fn no_response_reclaim_only_after_window() {
    let mut rfq = funded(None);
    assert_eq!(rfq.reclaim_unaccepted(&y(BUYER, FUND_AT + ACCEPT_WINDOW)).unwrap_err(), Error::AcceptWindowOpen);
    assert_eq!(rfq.reclaim_unaccepted(&y(MALLORY, FUND_AT + ACCEPT_WINDOW + 1)).unwrap_err(), Error::NotBuyer);
    let out = rfq.reclaim_unaccepted(&y(BUYER, FUND_AT + ACCEPT_WINDOW + 1)).unwrap();
    assert_eq!(out.transfer.unwrap().to, BUYER);
    // supplier can no longer accept once a refund is pending
    assert_eq!(rfq.accept(&y(SUP_A, FUND_AT + 2)).unwrap_err(), Error::WrongAwardState);
}

// ---------- delivery / release ----------

#[test]
fn delivery_only_by_supplier_after_acceptance() {
    let mut rfq = funded(None);
    assert_eq!(rfq.submit_delivery(&y(SUP_A, FUND_AT + 1), h(4)).unwrap_err(), Error::WrongAwardState);
    rfq.accept(&y(SUP_A, FUND_AT + 1)).unwrap();
    assert_eq!(rfq.submit_delivery(&y(BUYER, FUND_AT + 2), h(4)).unwrap_err(), Error::NotSupplier);
    assert_eq!(rfq.submit_delivery(&y(SUP_A, FUND_AT + 2), [0; 32]).unwrap_err(), Error::InvalidHash);
    let out = rfq.submit_delivery(&y(SUP_A, FUND_AT + 2), h(4)).unwrap();
    assert_eq!(out.event.get("evidence_hash"), Some(to_hex(&h(4)).as_str()));
    assert_eq!(award(&rfq).review_deadline_ns, FUND_AT + 2 + REVIEW_WINDOW);
    assert_eq!(rfq.submit_delivery(&y(SUP_A, FUND_AT + 3), h(5)).unwrap_err(), Error::WrongAwardState, "evidence is immutable");
}

#[test]
fn release_happy_path_pays_once() {
    let mut rfq = delivered(None);
    assert_eq!(rfq.approve_release(&y(SUP_A, DELIVERED_AT + 1)).unwrap_err(), Error::NotBuyer);
    assert_eq!(rfq.approve_release(&y(MALLORY, DELIVERED_AT + 1)).unwrap_err(), Error::NotBuyer);
    assert_eq!(rfq.approve_release(&ctx(BUYER, DELIVERED_AT + 1, 0)).unwrap_err(), Error::RequiresOneYocto);
    let out = rfq.approve_release(&y(BUYER, DELIVERED_AT + 1)).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.amount, t.kind, t.round, t.attempt), (SUP_A, AMOUNT, TransferKind::Release, 1, 1));
    assert_eq!(award(&rfq).status, AwardStatus::ReleasePending);
    // duplicate click while pending: rejected, no second transfer
    assert_eq!(rfq.approve_release(&y(BUYER, DELIVERED_AT + 2)).unwrap_err(), Error::WrongAwardState);
    assert_eq!(rfq.retry_transfer(&y(BUYER, DELIVERED_AT + 2)).unwrap_err(), Error::WrongAwardState);
    let done = rfq.on_transfer_result(DELIVERED_AT + 3, 1, 1, TransferKind::Release, true);
    assert_eq!(done.escrow_out, AMOUNT);
    assert_eq!(award(&rfq).status, AwardStatus::Paid);
    assert_eq!(rfq.status, RfqStatus::Settled);
    // after payment: nothing can schedule another transfer
    assert_eq!(rfq.approve_release(&y(BUYER, DELIVERED_AT + 4)).unwrap_err(), Error::NoAward);
    assert_eq!(rfq.retry_transfer(&y(BUYER, DELIVERED_AT + 4)).unwrap_err(), Error::NoAward);
    // replayed callback is ignored as stale
    let replay = rfq.on_transfer_result(DELIVERED_AT + 5, 1, 1, TransferKind::Release, true);
    assert_eq!((replay.event.name, replay.escrow_out), ("stale_callback", 0));
}

#[test]
fn release_requires_delivery() {
    let mut rfq = accepted(None);
    assert_eq!(rfq.approve_release(&y(BUYER, FUND_AT + 20)).unwrap_err(), Error::WrongAwardState);
    let mut rfq = funded(None);
    assert_eq!(rfq.approve_release(&y(BUYER, FUND_AT + 20)).unwrap_err(), Error::WrongAwardState);
}

#[test]
fn rejected_receiver_transfer_is_recoverable_and_never_double_pays() {
    let mut rfq = delivered(None);
    rfq.approve_release(&y(BUYER, DELIVERED_AT + 1)).unwrap();
    let failed = rfq.on_transfer_result(DELIVERED_AT + 2, 1, 1, TransferKind::Release, false);
    assert_eq!((failed.event.name, failed.escrow_out), ("transfer_failed", 0));
    assert_eq!(award(&rfq).status, AwardStatus::ReleaseFailed);
    assert_eq!(rfq.escrowed(), AMOUNT, "principal still accounted for");
    // stranger cannot retry; parties can, and destination stays the supplier
    assert_eq!(rfq.retry_transfer(&y(MALLORY, DELIVERED_AT + 3)).unwrap_err(), Error::NotParty);
    let out = rfq.retry_transfer(&y(SUP_A, DELIVERED_AT + 3)).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.attempt), (SUP_A, 2));
    // stale callback of attempt 1 arrives late: ignored, cannot mark paid
    let stale = rfq.on_transfer_result(DELIVERED_AT + 4, 1, 1, TransferKind::Release, true);
    assert_eq!(stale.event.name, "stale_callback");
    assert_eq!(award(&rfq).status, AwardStatus::ReleasePending);
    // wrong kind for the current attempt is ignored too
    let wrong_kind = rfq.on_transfer_result(DELIVERED_AT + 4, 1, 2, TransferKind::Refund, true);
    assert_eq!(wrong_kind.event.name, "stale_callback");
    let ok = rfq.on_transfer_result(DELIVERED_AT + 5, 1, 2, TransferKind::Release, true);
    assert_eq!(ok.escrow_out, AMOUNT);
    assert_eq!(award(&rfq).status, AwardStatus::Paid);
}

#[test]
fn callback_for_wrong_round_is_stale() {
    let mut rfq = delivered(None);
    rfq.approve_release(&y(BUYER, DELIVERED_AT + 1)).unwrap();
    assert_eq!(rfq.on_transfer_result(DELIVERED_AT + 2, 2, 1, TransferKind::Release, true).event.name, "stale_callback");
    assert_eq!(award(&rfq).status, AwardStatus::ReleasePending);
}

#[test]
fn claim_after_review_window() {
    let mut rfq = delivered(None);
    let deadline = award(&rfq).review_deadline_ns;
    assert_eq!(rfq.claim_after_review(&y(SUP_A, deadline)).unwrap_err(), Error::ReviewWindowOpen);
    assert_eq!(rfq.claim_after_review(&y(BUYER, deadline + 1)).unwrap_err(), Error::NotSupplier);
    let out = rfq.claim_after_review(&y(SUP_A, deadline + 1)).unwrap();
    assert_eq!(out.transfer.unwrap().to, SUP_A);
}

// ---------- mutual cancellation ----------

#[test]
fn mutual_cancellation_requires_counterparty() {
    let mut rfq = accepted(None);
    assert_eq!(rfq.approve_cancel(&y(BUYER, FUND_AT + 20)).unwrap_err(), Error::NoCancelRequest);
    assert_eq!(rfq.request_cancel(&y(MALLORY, FUND_AT + 20)).unwrap_err(), Error::NotParty);
    rfq.request_cancel(&y(BUYER, FUND_AT + 20)).unwrap();
    assert_eq!(rfq.request_cancel(&y(SUP_A, FUND_AT + 21)).unwrap_err(), Error::CancelAlreadyRequested);
    assert_eq!(rfq.approve_cancel(&y(BUYER, FUND_AT + 21)).unwrap_err(), Error::CannotApproveOwnRequest);
    assert_eq!(rfq.approve_cancel(&y(MALLORY, FUND_AT + 21)).unwrap_err(), Error::NotParty);
    let out = rfq.approve_cancel(&y(SUP_A, FUND_AT + 22)).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.kind), (BUYER, TransferKind::Refund));
}

#[test]
fn cancel_request_can_be_withdrawn_by_requester_only() {
    let mut rfq = accepted(None);
    rfq.request_cancel(&y(SUP_A, FUND_AT + 20)).unwrap();
    assert_eq!(rfq.withdraw_cancel_request(&y(BUYER, FUND_AT + 21)).unwrap_err(), Error::NotParty);
    rfq.withdraw_cancel_request(&y(SUP_A, FUND_AT + 21)).unwrap();
    assert_eq!(rfq.approve_cancel(&y(BUYER, FUND_AT + 22)).unwrap_err(), Error::NoCancelRequest);
}

#[test]
fn refund_failure_is_retryable() {
    let mut rfq = accepted(None);
    rfq.request_cancel(&y(BUYER, FUND_AT + 20)).unwrap();
    rfq.approve_cancel(&y(SUP_A, FUND_AT + 21)).unwrap();
    rfq.on_transfer_result(FUND_AT + 22, 1, 1, TransferKind::Refund, false);
    assert_eq!(award(&rfq).status, AwardStatus::RefundFailed);
    let out = rfq.retry_transfer(&y(BUYER, FUND_AT + 23)).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.kind, t.attempt), (BUYER, TransferKind::Refund, 2));
    rfq.on_transfer_result(FUND_AT + 24, 1, 2, TransferKind::Refund, true);
    assert_eq!(award(&rfq).status, AwardStatus::Refunded);
}

// ---------- disputes ----------

#[test]
fn dispute_requires_agreed_reviewer() {
    let mut rfq = delivered(None);
    assert_eq!(rfq.open_dispute(&y(BUYER, DELIVERED_AT + 1)).unwrap_err(), Error::NoReviewer);
}

#[test]
fn reviewer_resolves_with_narrow_outcomes_only() {
    let mut rfq = delivered(Some(REVIEWER));
    assert_eq!(rfq.resolve_dispute(&y(REVIEWER, DELIVERED_AT + 1), DisputeOutcome::RefundToBuyer).unwrap_err(), Error::WrongAwardState);
    assert_eq!(rfq.open_dispute(&y(MALLORY, DELIVERED_AT + 1)).unwrap_err(), Error::NotParty);
    rfq.open_dispute(&y(BUYER, DELIVERED_AT + 1)).unwrap();
    assert_eq!(award(&rfq).status, AwardStatus::Disputed);
    // supplier cannot claim after review while disputed
    let deadline = award(&rfq).review_deadline_ns;
    assert_eq!(rfq.claim_after_review(&y(SUP_A, deadline + 1)).unwrap_err(), Error::WrongAwardState);
    for not_reviewer in [BUYER, SUP_A, MALLORY] {
        assert_eq!(
            rfq.resolve_dispute(&y(not_reviewer, DELIVERED_AT + 2), DisputeOutcome::ReleaseToSupplier).unwrap_err(),
            Error::NotReviewer
        );
    }
    let out = rfq.resolve_dispute(&y(REVIEWER, DELIVERED_AT + 2), DisputeOutcome::RefundToBuyer).unwrap();
    let t = out.transfer.unwrap();
    assert_eq!((t.to.as_str(), t.amount), (BUYER, AMOUNT), "reviewer cannot choose destination or amount");
}

#[test]
fn buyer_may_concede_dispute_only_after_delivery() {
    let mut rfq = accepted(Some(REVIEWER));
    rfq.open_dispute(&y(SUP_A, FUND_AT + 20)).unwrap();
    assert_eq!(rfq.approve_release(&y(BUYER, FUND_AT + 21)).unwrap_err(), Error::NoDelivery);
    let mut rfq = delivered(Some(REVIEWER));
    rfq.open_dispute(&y(SUP_A, DELIVERED_AT + 1)).unwrap();
    let out = rfq.approve_release(&y(BUYER, DELIVERED_AT + 2)).unwrap();
    assert_eq!(out.transfer.unwrap().to, SUP_A);
}

// ---------- re-award after refund ----------

#[test]
fn reaward_after_refund_and_round_cap() {
    let mut rfq = closed();
    for round in 1..=MAX_AWARD_ROUNDS as u32 {
        let now = DEADLINE + round as u64 * 100;
        rfq.award(&ctx(BUYER, now, 0), SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap();
        rfq.fund(&ctx(BUYER, now + 1, AMOUNT)).unwrap();
        rfq.decline(&y(SUP_A, now + 2)).unwrap();
        rfq.on_transfer_result(now + 3, round, 1, TransferKind::Refund, true);
        assert_eq!(rfq.status, RfqStatus::Closed);
    }
    assert_eq!(
        rfq.award(&ctx(BUYER, DEADLINE + 10_000, 0), SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT)
            .unwrap_err(),
        Error::TooManyAwardRounds
    );
    assert_eq!(rfq.escrowed(), 0);
}

#[test]
fn stale_callback_from_previous_round_cannot_touch_new_award() {
    let mut rfq = funded(None);
    rfq.decline(&y(SUP_A, FUND_AT + 1)).unwrap();
    rfq.on_transfer_result(FUND_AT + 2, 1, 1, TransferKind::Refund, true);
    rfq.award(&ctx(BUYER, FUND_AT + 3, 0), SUP_B, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, None, CONTRACT).unwrap();
    rfq.fund(&ctx(BUYER, FUND_AT + 4, AMOUNT)).unwrap();
    rfq.decline(&y(SUP_B, FUND_AT + 5)).unwrap(); // round 2, attempt 1 pending
    let stale = rfq.on_transfer_result(FUND_AT + 6, 1, 1, TransferKind::Refund, true);
    assert_eq!(stale.event.name, "stale_callback");
    assert_eq!(award(&rfq).status, AwardStatus::RefundPending);
}

// ---------- randomized invariant check ----------

/// Small deterministic PRNG so the property test needs no extra dependency.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[(self.next() as usize) % xs.len()]
    }
}

#[test]
fn randomized_sequences_preserve_money_invariants() {
    let callers = [BUYER, SUP_A, SUP_B, MALLORY, REVIEWER];
    for seed in 0..400u64 {
        let mut rng = Lcg(seed.wrapping_mul(0x9E3779B97F4A7C15) ^ 0xDEAD_BEEF);
        let mut rfq = closed();
        let mut now = DEADLINE + 1;
        let mut ledger: i128 = 0; // escrow_in - escrow_out as seen by the wrapper
        let mut paid_count = 0;
        let mut pending: Option<Transfer> = None;
        for _ in 0..60 {
            now += (rng.next() % (40 * HOUR)) + 1;
            let caller = *rng.pick(&callers);
            let op = rng.next() % 16;
            let res = match op {
                0 => rfq.award(&ctx(caller, now, 0), SUP_A, h(3), AMOUNT, ACCEPT_WINDOW, REVIEW_WINDOW, Some(REVIEWER), CONTRACT),
                1 => rfq.fund(&ctx(caller, now, if rng.next() % 2 == 0 { AMOUNT } else { AMOUNT - 1 })),
                2 => rfq.accept(&y(caller, now)),
                3 => rfq.decline(&y(caller, now)),
                4 => rfq.reclaim_unaccepted(&y(caller, now)),
                5 => rfq.submit_delivery(&y(caller, now), h(9)),
                6 => rfq.approve_release(&y(caller, now)),
                7 => rfq.claim_after_review(&y(caller, now)),
                8 => rfq.retry_transfer(&y(caller, now)),
                9 => rfq.request_cancel(&y(caller, now)),
                10 => rfq.approve_cancel(&y(caller, now)),
                11 => rfq.open_dispute(&y(caller, now)),
                12 => rfq.resolve_dispute(&y(caller, now), if rng.next() % 2 == 0 { DisputeOutcome::RefundToBuyer } else { DisputeOutcome::ReleaseToSupplier }),
                13 => rfq.revoke_award(&y(caller, now)),
                _ => {
                    // deliver a callback: either for the real pending transfer or a forged/stale one
                    let (round, attempt, kind) = match (&pending, rng.next() % 3) {
                        (Some(t), 0 | 1) => (t.round, t.attempt, t.kind),
                        _ => ((rng.next() % 3) as u32, (rng.next() % 3) as u32, if rng.next() % 2 == 0 { TransferKind::Release } else { TransferKind::Refund }),
                    };
                    let success = rng.next() % 3 != 0;
                    let out = rfq.on_transfer_result(now, round, attempt, kind, success);
                    if out.event.name != "stale_callback" {
                        pending = None;
                    }
                    Ok(out)
                }
            };
            if let Ok(out) = res {
                ledger += out.escrow_in as i128 - out.escrow_out as i128;
                if let Some(t) = out.transfer {
                    assert!(pending.is_none(), "seed {seed}: second transfer scheduled while one pending");
                    // destination is always the locked supplier (release) or the buyer (refund)
                    let a = rfq.current_award().unwrap();
                    match t.kind {
                        TransferKind::Release => assert_eq!(t.to, a.supplier),
                        TransferKind::Refund => assert_eq!(t.to, BUYER),
                    }
                    assert_eq!(t.amount, a.amount);
                    pending = Some(t);
                }
                if out.event.name == "transfer_succeeded" && out.event.get("transfer_kind") == Some("release") {
                    paid_count += 1;
                }
            }
            assert!(paid_count <= 1, "seed {seed}: paid more than once");
            assert_eq!(ledger, rfq.escrowed() as i128, "seed {seed}: ledger diverged from held principal");
            let holding = rfq.awards.iter().filter(|a| a.status.holds_principal()).count();
            assert!(holding <= 1, "seed {seed}: more than one award holds principal");
            let pend = rfq
                .awards
                .iter()
                .filter(|a| matches!(a.status, AwardStatus::ReleasePending | AwardStatus::RefundPending))
                .count();
            assert_eq!(pend, pending.is_some() as usize, "seed {seed}: pending flag diverged");
        }
    }
}
