//! VeilProcure NEAR contract — thin host wrapper around `veilprocure-core`.
//!
//! Responsibilities of this layer only:
//! * derive the caller from `predecessor_account_id` (never from arguments);
//! * read chain time and the attached deposit;
//! * persist RFQs with explicit `storage_write`, charging measured storage to the caller;
//! * keep the global escrow ledger (`escrow_liabilities`);
//! * schedule transfers returned by the core, followed by a `#[private]` callback.
//!
//! There is no owner, no admin and no method that can move funds anywhere other than the
//! locked supplier (release) or the RFQ buyer (refund). See docs/CONTRACT_INVARIANTS.md.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, Map, Value};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseError, PromiseOrValue};
use veilprocure_core::{self as core, Ctx, Rfq, TransferKind};

pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const EVENT_STANDARD: &str = "veilprocure";
/// Gas reserved for the transfer-result callback.
pub const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(15);
/// Methods that schedule a transfer require at least this much prepaid gas so the callback can
/// always be scheduled and executed.
pub const MIN_GAS_FOR_TRANSFER: Gas = Gas::from_tgas(40);
/// Maximum RFQs returned by `list_rfqs`.
pub const MAX_PAGE: u32 = 20;

const RFQ_PREFIX: u8 = b'r';

fn rfq_key(id: u64) -> [u8; 9] {
    let mut key = [0u8; 9];
    key[0] = RFQ_PREFIX;
    key[1..].copy_from_slice(&id.to_le_bytes());
    key
}

fn ok<T>(res: core::Res<T>) -> T {
    res.unwrap_or_else(|e| env::panic_str(&format!("{}: {}", e.code(), e.message())))
}

fn hash_arg(hex: &str) -> core::Hash32 {
    ok(core::parse_hash32(hex))
}

fn host_sha256(bytes: &[u8]) -> core::Hash32 {
    env::sha256_array(bytes)
}

fn yocto(amount: NearToken) -> u128 {
    amount.as_yoctonear()
}

/// Emits a NEP-297 event: `EVENT_JSON:{"standard","version","event","data":[{...}]}`.
fn emit(event: &core::Event) {
    let mut data = Map::new();
    for (k, v) in &event.fields {
        data.insert((*k).to_string(), Value::String(v.clone()));
    }
    let payload = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": core::SCHEMA_VERSION,
        "event": event.name,
        "data": [Value::Object(data)],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[near(contract_state)]
#[derive(Default)]
pub struct Contract {
    rfq_count: u64,
    /// Sum of principal currently held for all awards (funded and not yet paid/refunded).
    escrow_liabilities: u128,
    total_escrow_in: u128,
    total_escrow_out: u128,
}

#[near(serializers = [json])]
pub struct BidView {
    pub supplier: String,
    pub invite_leaf: String,
    pub commitment: String,
    pub version: u32,
    pub revisions: u32,
    pub first_committed_at_ns: U64,
    pub committed_at_ns: U64,
    pub withdrawn: bool,
}

#[near(serializers = [json])]
pub struct AwardView {
    pub round: u32,
    pub supplier: String,
    pub agreement_hash: String,
    pub amount_yocto: U128,
    pub reviewer: Option<String>,
    pub accept_window_ns: U64,
    pub review_window_ns: U64,
    pub status: String,
    pub awarded_at_ns: U64,
    pub funded_at_ns: U64,
    pub accept_by_ns: U64,
    pub accepted_at_ns: U64,
    pub delivered_at_ns: U64,
    pub review_deadline_ns: U64,
    pub settled_at_ns: U64,
    pub evidence_hash: Option<String>,
    pub attempt: u32,
    pub cancel_requested_by: String,
    pub dispute_opened_by: String,
}

#[near(serializers = [json])]
pub struct RfqView {
    pub id: U64,
    pub buyer: String,
    pub status: String,
    pub policy_hash: String,
    pub terms_hash: String,
    pub created_at_ns: U64,
    pub deadline_ns: U64,
    pub closed_at_ns: U64,
    pub invite_leaves: Vec<String>,
    pub bids: Vec<BidView>,
    pub awards: Vec<AwardView>,
    pub escrowed_yocto: U128,
}

#[near(serializers = [json])]
pub struct InviteCheck {
    pub valid: bool,
    pub bound_to: Option<String>,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub contract_version: String,
    pub event_standard: String,
    pub event_version: String,
    pub max_suppliers: u32,
    pub max_revisions: u32,
    pub max_award_rounds: u32,
    pub min_window_ns: U64,
    pub max_bidding_window_ns: U64,
    pub max_accept_window_ns: U64,
    pub max_review_window_ns: U64,
    pub max_award_yocto: U128,
    pub storage_byte_cost_yocto: U128,
    pub min_gas_for_transfer: U64,
}

#[near(serializers = [json])]
pub struct EscrowSummary {
    pub rfq_count: U64,
    pub escrow_liabilities_yocto: U128,
    pub total_escrow_in_yocto: U128,
    pub total_escrow_out_yocto: U128,
    pub account_balance_yocto: U128,
    pub storage_usage_bytes: U64,
    pub storage_locked_yocto: U128,
}

fn hash_hex(h: &core::Hash32) -> String {
    core::to_hex(h)
}

impl From<&core::Rfq> for RfqView {
    fn from(r: &core::Rfq) -> Self {
        RfqView {
            id: U64(r.id),
            buyer: r.buyer.clone(),
            status: r.status.as_str().to_string(),
            policy_hash: hash_hex(&r.policy_hash),
            terms_hash: hash_hex(&r.terms_hash),
            created_at_ns: U64(r.created_at_ns),
            deadline_ns: U64(r.deadline_ns),
            closed_at_ns: U64(r.closed_at_ns),
            invite_leaves: r.invite_leaves.iter().map(hash_hex).collect(),
            bids: r
                .bids
                .iter()
                .map(|b| BidView {
                    supplier: b.supplier.clone(),
                    invite_leaf: hash_hex(&b.invite_leaf),
                    commitment: hash_hex(&b.commitment),
                    version: b.version,
                    revisions: b.revisions,
                    first_committed_at_ns: U64(b.first_committed_at_ns),
                    committed_at_ns: U64(b.committed_at_ns),
                    withdrawn: b.withdrawn,
                })
                .collect(),
            awards: r
                .awards
                .iter()
                .map(|a| AwardView {
                    round: a.round,
                    supplier: a.supplier.clone(),
                    agreement_hash: hash_hex(&a.agreement_hash),
                    amount_yocto: U128(a.amount),
                    reviewer: a.reviewer.clone(),
                    accept_window_ns: U64(a.accept_window_ns),
                    review_window_ns: U64(a.review_window_ns),
                    status: a.status.as_str().to_string(),
                    awarded_at_ns: U64(a.awarded_at_ns),
                    funded_at_ns: U64(a.funded_at_ns),
                    accept_by_ns: U64(a.accept_by_ns),
                    accepted_at_ns: U64(a.accepted_at_ns),
                    delivered_at_ns: U64(a.delivered_at_ns),
                    review_deadline_ns: U64(a.review_deadline_ns),
                    settled_at_ns: U64(a.settled_at_ns),
                    evidence_hash: if a.delivered_at_ns == 0 { None } else { Some(hash_hex(&a.evidence_hash)) },
                    attempt: a.attempt,
                    cancel_requested_by: a.cancel_requested_by.as_str().to_string(),
                    dispute_opened_by: a.dispute_opened_by.as_str().to_string(),
                })
                .collect(),
            escrowed_yocto: U128(r.escrowed()),
        }
    }
}

impl Contract {
    fn read_rfq(&self, id: u64) -> Option<Rfq> {
        env::storage_read(&rfq_key(id)).map(|bytes| {
            borsh::from_slice(&bytes).unwrap_or_else(|_| env::panic_str("VP_CORRUPT_STATE"))
        })
    }

    fn load_rfq(&self, id: u64) -> Rfq {
        self.read_rfq(id).unwrap_or_else(|| env::panic_str("VP_RFQ_NOT_FOUND: no RFQ with this id"))
    }

    fn write_rfq(&self, rfq: &Rfq) {
        let bytes = borsh::to_vec(rfq).unwrap_or_else(|_| env::panic_str("VP_SERIALIZE"));
        env::storage_write(&rfq_key(rfq.id), &bytes);
    }

    /// Charges the storage growth since `before` to `payer` out of `attached` and refunds the
    /// rest. At most one yoctoNEAR (the full-access-key confirmation) is retained as dust.
    fn charge_storage(&self, before: u64, attached: u128, payer: &AccountId) {
        let used = env::storage_usage().saturating_sub(before) as u128;
        let cost = used
            .checked_mul(yocto(env::storage_byte_cost()))
            .unwrap_or_else(|| env::panic_str("VP_OVERFLOW"));
        if attached < cost {
            env::panic_str(&format!(
                "VP_INSUFFICIENT_STORAGE_DEPOSIT: attach at least {cost} yoctoNEAR for {used} bytes"
            ));
        }
        let refund = attached - cost;
        if refund > core::ONE_YOCTO {
            Promise::new(payer.clone()).transfer(NearToken::from_yoctonear(refund)).detach();
        }
    }

    fn apply_ledger(&mut self, out: &core::Outcome) {
        if out.escrow_in > 0 {
            self.escrow_liabilities = self
                .escrow_liabilities
                .checked_add(out.escrow_in)
                .unwrap_or_else(|| env::panic_str("VP_OVERFLOW"));
            self.total_escrow_in = self.total_escrow_in.saturating_add(out.escrow_in);
        }
        if out.escrow_out > 0 {
            self.escrow_liabilities = self
                .escrow_liabilities
                .checked_sub(out.escrow_out)
                .unwrap_or_else(|| env::panic_str("VP_LEDGER_UNDERFLOW"));
            self.total_escrow_out = self.total_escrow_out.saturating_add(out.escrow_out);
        }
    }

    /// Runs a non-storage-growing transition and schedules its transfer, if any.
    fn transition(
        &mut self,
        rfq_id: u64,
        f: impl FnOnce(&mut Rfq, &Ctx) -> core::Res<core::Outcome>,
    ) -> PromiseOrValue<bool> {
        let caller = env::predecessor_account_id();
        let ctx = Ctx {
            caller: caller.as_str(),
            now_ns: env::block_timestamp(),
            attached: yocto(env::attached_deposit()),
        };
        let mut rfq = self.load_rfq(rfq_id);
        let out = ok(f(&mut rfq, &ctx));
        let before = env::storage_usage();
        self.write_rfq(&rfq);
        require!(env::storage_usage() <= before, "VP_UNEXPECTED_STORAGE_GROWTH");
        self.apply_ledger(&out);
        emit(&out.event);
        match out.transfer {
            Some(t) => PromiseOrValue::Promise(self.schedule_transfer(rfq_id, t)),
            None => PromiseOrValue::Value(true),
        }
    }

    fn schedule_transfer(&self, rfq_id: u64, t: core::Transfer) -> Promise {
        require!(
            env::prepaid_gas() >= MIN_GAS_FOR_TRANSFER,
            "VP_INSUFFICIENT_GAS: attach at least 40 TGas so the transfer callback can run"
        );
        let to: AccountId = t.to.parse().unwrap_or_else(|_| env::panic_str("VP_INVALID_ACCOUNT"));
        let callback = Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_CALLBACK);
        let callback = match t.kind {
            TransferKind::Release => callback.on_payment_result(U64(rfq_id), t.round, t.attempt),
            TransferKind::Refund => callback.on_refund_result(U64(rfq_id), t.round, t.attempt),
        };
        Promise::new(to).transfer(NearToken::from_yoctonear(t.amount)).then(callback)
    }

    fn settle_callback(&mut self, rfq_id: u64, round: u32, attempt: u32, kind: TransferKind) -> bool {
        require!(env::promise_results_count() == 1, "VP_BAD_CALLBACK");
        // A transfer succeeded iff its receipt did not fail. `TooLong` means it succeeded with a
        // non-empty result we chose not to read; anything else (Failed) is a failure.
        let success = match env::promise_result_checked(0, 0) {
            Ok(_) | Err(PromiseError::TooLong(_)) => true,
            Err(_) => false,
        };
        let mut rfq = self.load_rfq(rfq_id);
        let out = rfq.on_transfer_result(env::block_timestamp(), round, attempt, kind, success);
        if out.event.name != "stale_callback" {
            self.write_rfq(&rfq);
            self.apply_ledger(&out);
        }
        emit(&out.event);
        success && out.event.name == "transfer_succeeded"
    }
}

#[near]
impl Contract {
    // ------------------------------------------------------------------ RFQ lifecycle

    /// Buyer publishes an RFQ policy commitment. Attach a storage deposit (see `get_config`);
    /// any excess beyond measured storage cost is refunded. Returns the new RFQ id.
    #[payable]
    pub fn create_rfq(
        &mut self,
        policy_hash: String,
        terms_hash: String,
        deadline_ns: U64,
        invite_leaves: Vec<String>,
    ) -> U64 {
        require!(invite_leaves.len() <= core::MAX_SUPPLIERS, "VP_TOO_MANY_INVITES: too many invited suppliers");
        let caller = env::predecessor_account_id();
        let attached = yocto(env::attached_deposit());
        require!(attached >= core::ONE_YOCTO, "VP_INSUFFICIENT_STORAGE_DEPOSIT: attach a storage deposit");
        let leaves = invite_leaves.iter().map(|h| hash_arg(h)).collect();
        let id = self.rfq_count.checked_add(1).unwrap_or_else(|| env::panic_str("VP_OVERFLOW"));
        let ctx = Ctx { caller: caller.as_str(), now_ns: env::block_timestamp(), attached };
        let (rfq, out) =
            ok(Rfq::create(id, &ctx, hash_arg(&policy_hash), hash_arg(&terms_hash), deadline_ns.0, leaves));
        self.rfq_count = id;
        let before = env::storage_usage();
        self.write_rfq(&rfq);
        self.charge_storage(before, attached, &caller);
        emit(&out.event);
        U64(id)
    }

    /// Invited supplier commits (or revises with a higher version) its salted quote commitment
    /// before the deadline. Requires at least 1 yoctoNEAR (wallet confirmation); the first
    /// commit must also cover its storage.
    #[payable]
    pub fn commit_bid(&mut self, rfq_id: U64, commitment: String, version: u32, invite_secret: String) {
        let caller = env::predecessor_account_id();
        let attached = yocto(env::attached_deposit());
        require!(attached >= core::ONE_YOCTO, "VP_REQUIRES_ONE_YOCTO: attach at least 1 yoctoNEAR");
        let ctx = Ctx { caller: caller.as_str(), now_ns: env::block_timestamp(), attached };
        let mut rfq = self.load_rfq(rfq_id.0);
        let secret = hash_arg(&invite_secret);
        let out = ok(rfq.commit_bid(&ctx, hash_arg(&commitment), version, &secret, host_sha256));
        let before = env::storage_usage();
        self.write_rfq(&rfq);
        self.charge_storage(before, attached, &caller);
        emit(&out.event);
    }

    #[payable]
    pub fn withdraw_bid(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.withdraw_bid(ctx))
    }

    /// Permissionless once chain time reaches the deadline. Smart contracts do not wake up on
    /// their own; the app's worker (or anyone) calls this.
    pub fn close_rfq(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.close(ctx))
    }

    #[payable]
    pub fn cancel_rfq(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.cancel(ctx))
    }

    // ------------------------------------------------------------------ award & escrow

    /// Buyer awards a supplier with an active bid. Attach a storage deposit for the award
    /// record; excess is refunded. Amount and destination are fixed from here on.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn award_supplier(
        &mut self,
        rfq_id: U64,
        supplier_id: AccountId,
        agreement_hash: String,
        amount_yocto: U128,
        accept_window_ns: U64,
        review_window_ns: U64,
        reviewer_id: Option<AccountId>,
    ) {
        let caller = env::predecessor_account_id();
        let attached = yocto(env::attached_deposit());
        require!(attached >= core::ONE_YOCTO, "VP_INSUFFICIENT_STORAGE_DEPOSIT: attach a storage deposit");
        let ctx = Ctx { caller: caller.as_str(), now_ns: env::block_timestamp(), attached };
        let mut rfq = self.load_rfq(rfq_id.0);
        let contract_id = env::current_account_id();
        let out = ok(rfq.award(
            &ctx,
            supplier_id.as_str(),
            hash_arg(&agreement_hash),
            amount_yocto.0,
            accept_window_ns.0,
            review_window_ns.0,
            reviewer_id.as_ref().map(|r| r.as_str()),
            contract_id.as_str(),
        ));
        let before = env::storage_usage();
        self.write_rfq(&rfq);
        self.charge_storage(before, attached, &caller);
        emit(&out.event);
    }

    #[payable]
    pub fn revoke_award(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.revoke_award(ctx))
    }

    /// Buyer attaches exactly the awarded principal (storage was paid at award time).
    #[payable]
    pub fn fund_award(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.fund(ctx))
    }

    #[payable]
    pub fn accept_award(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.accept(ctx))
    }

    #[payable]
    pub fn decline_award(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.decline(ctx))
    }

    #[payable]
    pub fn reclaim_unaccepted(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.reclaim_unaccepted(ctx))
    }

    #[payable]
    pub fn submit_delivery(&mut self, rfq_id: U64, evidence_hash: String) -> PromiseOrValue<bool> {
        let evidence = hash_arg(&evidence_hash);
        self.transition(rfq_id.0, |rfq, ctx| rfq.submit_delivery(ctx, evidence))
    }

    #[payable]
    pub fn approve_release(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.approve_release(ctx))
    }

    #[payable]
    pub fn claim_after_review(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.claim_after_review(ctx))
    }

    #[payable]
    pub fn retry_transfer(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.retry_transfer(ctx))
    }

    #[payable]
    pub fn request_cancel(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.request_cancel(ctx))
    }

    #[payable]
    pub fn withdraw_cancel_request(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.withdraw_cancel_request(ctx))
    }

    #[payable]
    pub fn approve_cancel(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.approve_cancel(ctx))
    }

    #[payable]
    pub fn open_dispute(&mut self, rfq_id: U64) -> PromiseOrValue<bool> {
        self.transition(rfq_id.0, |rfq, ctx| rfq.open_dispute(ctx))
    }

    /// `outcome` is exactly "release_to_supplier" or "refund_to_buyer".
    #[payable]
    pub fn resolve_dispute(&mut self, rfq_id: U64, outcome: String) -> PromiseOrValue<bool> {
        let outcome = match outcome.as_str() {
            "release_to_supplier" => core::DisputeOutcome::ReleaseToSupplier,
            "refund_to_buyer" => core::DisputeOutcome::RefundToBuyer,
            _ => env::panic_str("VP_INVALID_OUTCOME: use release_to_supplier or refund_to_buyer"),
        };
        self.transition(rfq_id.0, |rfq, ctx| rfq.resolve_dispute(ctx, outcome))
    }

    // ------------------------------------------------------------------ private callbacks

    /// Result of a release transfer. `#[private]` requires predecessor == this contract.
    #[private]
    pub fn on_payment_result(&mut self, rfq_id: U64, round: u32, attempt: u32) -> bool {
        self.settle_callback(rfq_id.0, round, attempt, TransferKind::Release)
    }

    /// Result of a refund transfer. `#[private]` requires predecessor == this contract.
    #[private]
    pub fn on_refund_result(&mut self, rfq_id: U64, round: u32, attempt: u32) -> bool {
        self.settle_callback(rfq_id.0, round, attempt, TransferKind::Refund)
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            contract_version: CONTRACT_VERSION.to_string(),
            event_standard: EVENT_STANDARD.to_string(),
            event_version: core::SCHEMA_VERSION.to_string(),
            max_suppliers: core::MAX_SUPPLIERS as u32,
            max_revisions: core::MAX_REVISIONS,
            max_award_rounds: core::MAX_AWARD_ROUNDS as u32,
            min_window_ns: U64(core::MIN_WINDOW_NS),
            max_bidding_window_ns: U64(core::MAX_BIDDING_WINDOW_NS),
            max_accept_window_ns: U64(core::MAX_ACCEPT_WINDOW_NS),
            max_review_window_ns: U64(core::MAX_REVIEW_WINDOW_NS),
            max_award_yocto: U128(core::MAX_AWARD_YOCTO),
            storage_byte_cost_yocto: U128(yocto(env::storage_byte_cost())),
            min_gas_for_transfer: U64(MIN_GAS_FOR_TRANSFER.as_gas()),
        }
    }

    pub fn get_rfq(&self, rfq_id: U64) -> Option<RfqView> {
        self.read_rfq(rfq_id.0).as_ref().map(RfqView::from)
    }

    /// RFQs with ids in `[from_id, from_id + limit)`, oldest first. `limit` is capped at 20.
    pub fn list_rfqs(&self, from_id: Option<U64>, limit: Option<u32>) -> Vec<RfqView> {
        let from = from_id.map(|v| v.0).unwrap_or(1).max(1);
        let limit = limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as u64;
        (from..from.saturating_add(limit))
            .take_while(|id| *id <= self.rfq_count)
            .filter_map(|id| self.read_rfq(id))
            .map(|r| RfqView::from(&r))
            .collect()
    }

    /// Whether `invite_secret` opens an invite slot of `rfq_id`, and which account (if any) has
    /// already bound that slot by bidding. Lets a supplier check its slot before signing.
    pub fn check_invite(&self, rfq_id: U64, invite_secret: String) -> InviteCheck {
        let none = InviteCheck { valid: false, bound_to: None };
        let Some(rfq) = self.read_rfq(rfq_id.0) else { return none };
        let Ok(secret) = core::parse_hash32(&invite_secret) else { return none };
        let leaf = host_sha256(&core::invite_leaf_preimage(&rfq.policy_hash, &secret));
        if !rfq.invite_leaves.contains(&leaf) {
            return none;
        }
        let bound_to = rfq.bids.iter().find(|b| b.invite_leaf == leaf).map(|b| b.supplier.clone());
        InviteCheck { valid: true, bound_to }
    }

    /// Global escrow ledger. Invariant: account_balance >= escrow_liabilities + storage_locked.
    pub fn get_escrow_summary(&self) -> EscrowSummary {
        let usage = env::storage_usage();
        EscrowSummary {
            rfq_count: U64(self.rfq_count),
            escrow_liabilities_yocto: U128(self.escrow_liabilities),
            total_escrow_in_yocto: U128(self.total_escrow_in),
            total_escrow_out_yocto: U128(self.total_escrow_out),
            account_balance_yocto: U128(yocto(env::account_balance())),
            storage_usage_bytes: U64(usage),
            storage_locked_yocto: U128((usage as u128).saturating_mul(yocto(env::storage_byte_cost()))),
        }
    }
}
