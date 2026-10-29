//! Pure state machine for VeilProcure RFQs, sealed-bid commitments and single-award escrow.
//!
//! This crate deliberately has no NEAR SDK dependency. The contract crate maps the chain
//! context (predecessor account, block timestamp, attached deposit) into [`Ctx`], calls one
//! transition here, persists the mutated [`Rfq`], emits the returned [`Event`] and executes the
//! returned [`Transfer`] (if any) followed by a private callback. Keeping the rules here lets
//! every transition be unit-tested natively and audited without reading host-function plumbing.
//!
//! Money rules enforced here (see docs/CONTRACT_INVARIANTS.md):
//! * principal enters only through `fund_award` with an exact deposit;
//! * principal leaves only to the award's supplier (release) or the RFQ's buyer (refund);
//! * at most one transfer is in flight per award and every callback is bound to an attempt id;
//! * nothing is counted as paid/refunded until the callback reports success.

mod tests;

use borsh::{BorshDeserialize, BorshSerialize};

pub type Hash32 = [u8; 32];

/// Version of the event schema and of the on-chain layout of these structs.
pub const SCHEMA_VERSION: &str = "1.0.0";
/// Upper bound on invited suppliers (and therefore bids) per RFQ — bounds storage and gas.
pub const MAX_SUPPLIERS: usize = 20;
/// Upper bound on revisions of a single supplier's commitment before the deadline.
pub const MAX_REVISIONS: u32 = 20;
/// Upper bound on award rounds per RFQ (re-award is possible only after revoke/decline/refund).
pub const MAX_AWARD_ROUNDS: usize = 5;
pub const MAX_ACCOUNT_LEN: usize = 64;

pub const NS_PER_SEC: u64 = 1_000_000_000;
const DAY_NS: u64 = 24 * 3600 * NS_PER_SEC;
/// Every window (bidding, acceptance, review) must be at least one minute of chain time.
pub const MIN_WINDOW_NS: u64 = 60 * NS_PER_SEC;
pub const MAX_BIDDING_WINDOW_NS: u64 = 365 * DAY_NS;
pub const MAX_ACCEPT_WINDOW_NS: u64 = 30 * DAY_NS;
pub const MAX_REVIEW_WINDOW_NS: u64 = 90 * DAY_NS;

/// 10^24 yoctoNEAR = 1 NEAR. Awards are capped at one million (testnet) NEAR.
pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const MAX_AWARD_YOCTO: u128 = 1_000_000 * ONE_NEAR;
/// Methods that move or commit funds require exactly one yoctoNEAR so that a wallet must
/// sign them with a full-access key (function-call access keys cannot attach deposits).
pub const ONE_YOCTO: u128 = 1;

/// Domain separator for invite leaves. Must match `packages/shared/src/invite.ts`.
pub const INVITE_DOMAIN: &[u8] = b"VEILPROCURE/INVITE/v1";

/// Execution context supplied by the contract wrapper from the chain environment.
#[derive(Clone, Copy, Debug)]
pub struct Ctx<'a> {
    pub caller: &'a str,
    pub now_ns: u64,
    pub attached: u128,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
pub enum RfqStatus {
    Open = 0,
    Closed = 1,
    Awarded = 2,
    Settled = 3,
    Cancelled = 4,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
pub enum AwardStatus {
    Awarded = 0,
    Funded = 1,
    Accepted = 2,
    Delivered = 3,
    ReleasePending = 4,
    ReleaseFailed = 5,
    Paid = 6,
    Disputed = 7,
    RefundPending = 8,
    RefundFailed = 9,
    Refunded = 10,
    Revoked = 11,
    Declined = 12,
}

impl AwardStatus {
    /// Statuses in which the award's principal is held by the contract.
    pub fn holds_principal(self) -> bool {
        matches!(
            self,
            AwardStatus::Funded
                | AwardStatus::Accepted
                | AwardStatus::Delivered
                | AwardStatus::ReleasePending
                | AwardStatus::ReleaseFailed
                | AwardStatus::Disputed
                | AwardStatus::RefundPending
                | AwardStatus::RefundFailed
        )
    }

    pub fn is_final(self) -> bool {
        matches!(
            self,
            AwardStatus::Paid | AwardStatus::Refunded | AwardStatus::Revoked | AwardStatus::Declined
        )
    }

    pub fn as_str(self) -> &'static str {
        match self {
            AwardStatus::Awarded => "awarded",
            AwardStatus::Funded => "funded",
            AwardStatus::Accepted => "accepted",
            AwardStatus::Delivered => "delivered",
            AwardStatus::ReleasePending => "release_pending",
            AwardStatus::ReleaseFailed => "release_failed",
            AwardStatus::Paid => "paid",
            AwardStatus::Disputed => "disputed",
            AwardStatus::RefundPending => "refund_pending",
            AwardStatus::RefundFailed => "refund_failed",
            AwardStatus::Refunded => "refunded",
            AwardStatus::Revoked => "revoked",
            AwardStatus::Declined => "declined",
        }
    }
}

impl RfqStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            RfqStatus::Open => "open",
            RfqStatus::Closed => "closed",
            RfqStatus::Awarded => "awarded",
            RfqStatus::Settled => "settled",
            RfqStatus::Cancelled => "cancelled",
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
pub enum Party {
    None = 0,
    Buyer = 1,
    Supplier = 2,
}

impl Party {
    pub fn as_str(self) -> &'static str {
        match self {
            Party::None => "none",
            Party::Buyer => "buyer",
            Party::Supplier => "supplier",
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
pub enum TransferKind {
    Release = 0,
    Refund = 1,
}

impl TransferKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TransferKind::Release => "release",
            TransferKind::Refund => "refund",
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(use_discriminant = true)]
pub enum DisputeOutcome {
    ReleaseToSupplier = 0,
    RefundToBuyer = 1,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Bid {
    pub supplier: String,
    /// Invite slot this bid consumed; bound to `supplier` permanently.
    pub invite_leaf: Hash32,
    /// SHA-256 over the canonical, salted quote encoding (computed off-chain; salt stays private).
    pub commitment: Hash32,
    /// Supplier-chosen, strictly increasing version. The latest non-withdrawn version at the
    /// deadline is the binding one.
    pub version: u32,
    pub revisions: u32,
    pub first_committed_at_ns: u64,
    pub committed_at_ns: u64,
    pub withdrawn: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Award {
    pub round: u32,
    pub supplier: String,
    /// Hash of the off-chain agreement (scope, milestone, amount, windows, reviewer, policy hash).
    pub agreement_hash: Hash32,
    pub amount: u128,
    /// Optional dispute reviewer both parties agree to (buyer proposes; supplier accepts by
    /// calling `accept_award`). Never the buyer, the supplier or the contract itself.
    pub reviewer: Option<String>,
    pub accept_window_ns: u64,
    pub review_window_ns: u64,
    pub status: AwardStatus,
    pub awarded_at_ns: u64,
    pub funded_at_ns: u64,
    pub accept_by_ns: u64,
    pub accepted_at_ns: u64,
    pub delivered_at_ns: u64,
    pub review_deadline_ns: u64,
    pub settled_at_ns: u64,
    pub evidence_hash: Hash32,
    /// Monotonic transfer-attempt counter; each scheduled transfer gets `attempt + 1` and the
    /// callback must present the same number.
    pub attempt: u32,
    pub cancel_requested_by: Party,
    pub dispute_opened_by: Party,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Rfq {
    pub id: u64,
    pub buyer: String,
    pub policy_hash: Hash32,
    pub terms_hash: Hash32,
    pub created_at_ns: u64,
    pub deadline_ns: u64,
    pub closed_at_ns: u64,
    pub status: RfqStatus,
    /// sha256(INVITE_DOMAIN || 0x00 || policy_hash || secret) per invited supplier slot. The
    /// buyer knows invitees by e-mail, not wallet, at publish time, so each slot is a bearer
    /// secret that becomes bound to the first account that bids with it. Hides the invite list
    /// (and its size beyond a count) until suppliers reveal their own leaves by bidding.
    pub invite_leaves: Vec<Hash32>,
    pub bids: Vec<Bid>,
    pub awards: Vec<Award>,
}

/// A transfer the wrapper must schedule, followed by the private result callback.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transfer {
    pub to: String,
    pub amount: u128,
    pub kind: TransferKind,
    pub round: u32,
    pub attempt: u32,
}

/// NEP-297 style event. Field values are pre-stringified so the wrapper can emit them without
/// knowing per-event schemas (amounts in yocto decimal, hashes in lowercase hex, times in ns).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub name: &'static str,
    pub fields: Vec<(&'static str, String)>,
}

impl Event {
    fn new(name: &'static str, rfq_id: u64) -> Self {
        Event { name, fields: vec![("rfq_id", rfq_id.to_string())] }
    }
    fn with(mut self, key: &'static str, value: impl Into<String>) -> Self {
        self.fields.push((key, value.into()));
        self
    }
    pub fn get(&self, key: &str) -> Option<&str> {
        self.fields.iter().find(|(k, _)| *k == key).map(|(_, v)| v.as_str())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub event: Event,
    pub transfer: Option<Transfer>,
    /// Principal that entered escrow in this transition.
    pub escrow_in: u128,
    /// Principal that left escrow (confirmed by a successful transfer callback).
    pub escrow_out: u128,
}

impl Outcome {
    fn event(event: Event) -> Self {
        Outcome { event, transfer: None, escrow_in: 0, escrow_out: 0 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidHash,
    InvalidAccount,
    NoInvites,
    TooManyInvites,
    DuplicateInvite,
    InvalidDeadline,
    InvalidWindow,
    InvalidAmount,
    NotBuyer,
    NotSupplier,
    NotParty,
    NotReviewer,
    NotInvited,
    InviteAlreadyUsed,
    BuyerCannotBid,
    RfqNotOpen,
    BiddingClosed,
    DeadlineNotReached,
    RfqNotClosed,
    RfqNotCancellable,
    VersionNotIncreasing,
    TooManyRevisions,
    TooManyBids,
    NoActiveBid,
    TooManyAwardRounds,
    NoAward,
    WrongAwardState,
    ReviewerConflict,
    WrongDeposit,
    RequiresOneYocto,
    AcceptWindowExpired,
    AcceptWindowOpen,
    ReviewWindowOpen,
    NoReviewer,
    CancelAlreadyRequested,
    NoCancelRequest,
    CannotApproveOwnRequest,
    NoDelivery,
    Overflow,
}

impl Error {
    /// Stable, machine-readable error code surfaced in the panic message ("VP_xxx: message").
    pub fn code(self) -> &'static str {
        match self {
            Error::InvalidHash => "VP_INVALID_HASH",
            Error::InvalidAccount => "VP_INVALID_ACCOUNT",
            Error::NoInvites => "VP_NO_INVITES",
            Error::TooManyInvites => "VP_TOO_MANY_INVITES",
            Error::DuplicateInvite => "VP_DUPLICATE_INVITE",
            Error::InvalidDeadline => "VP_INVALID_DEADLINE",
            Error::InvalidWindow => "VP_INVALID_WINDOW",
            Error::InvalidAmount => "VP_INVALID_AMOUNT",
            Error::NotBuyer => "VP_NOT_BUYER",
            Error::NotSupplier => "VP_NOT_SUPPLIER",
            Error::NotParty => "VP_NOT_PARTY",
            Error::NotReviewer => "VP_NOT_REVIEWER",
            Error::NotInvited => "VP_NOT_INVITED",
            Error::InviteAlreadyUsed => "VP_INVITE_ALREADY_USED",
            Error::BuyerCannotBid => "VP_BUYER_CANNOT_BID",
            Error::RfqNotOpen => "VP_RFQ_NOT_OPEN",
            Error::BiddingClosed => "VP_BIDDING_CLOSED",
            Error::DeadlineNotReached => "VP_DEADLINE_NOT_REACHED",
            Error::RfqNotClosed => "VP_RFQ_NOT_CLOSED",
            Error::RfqNotCancellable => "VP_RFQ_NOT_CANCELLABLE",
            Error::VersionNotIncreasing => "VP_VERSION_NOT_INCREASING",
            Error::TooManyRevisions => "VP_TOO_MANY_REVISIONS",
            Error::TooManyBids => "VP_TOO_MANY_BIDS",
            Error::NoActiveBid => "VP_NO_ACTIVE_BID",
            Error::TooManyAwardRounds => "VP_TOO_MANY_AWARD_ROUNDS",
            Error::NoAward => "VP_NO_AWARD",
            Error::WrongAwardState => "VP_WRONG_AWARD_STATE",
            Error::ReviewerConflict => "VP_REVIEWER_CONFLICT",
            Error::WrongDeposit => "VP_WRONG_DEPOSIT",
            Error::RequiresOneYocto => "VP_REQUIRES_ONE_YOCTO",
            Error::AcceptWindowExpired => "VP_ACCEPT_WINDOW_EXPIRED",
            Error::AcceptWindowOpen => "VP_ACCEPT_WINDOW_OPEN",
            Error::ReviewWindowOpen => "VP_REVIEW_WINDOW_OPEN",
            Error::NoReviewer => "VP_NO_REVIEWER",
            Error::CancelAlreadyRequested => "VP_CANCEL_ALREADY_REQUESTED",
            Error::NoCancelRequest => "VP_NO_CANCEL_REQUEST",
            Error::CannotApproveOwnRequest => "VP_CANNOT_APPROVE_OWN_REQUEST",
            Error::NoDelivery => "VP_NO_DELIVERY",
            Error::Overflow => "VP_OVERFLOW",
        }
    }

    pub fn message(self) -> &'static str {
        match self {
            Error::InvalidHash => "hash must be 32 non-zero bytes",
            Error::InvalidAccount => "account id is invalid",
            Error::NoInvites => "at least one invited supplier is required",
            Error::TooManyInvites => "too many invited suppliers",
            Error::DuplicateInvite => "duplicate invite leaf",
            Error::InvalidDeadline => "deadline outside the allowed bidding window",
            Error::InvalidWindow => "acceptance/review window outside allowed bounds",
            Error::InvalidAmount => "award amount must be positive and within the cap",
            Error::NotBuyer => "only the RFQ buyer may call this",
            Error::NotSupplier => "only the awarded supplier may call this",
            Error::NotParty => "only the buyer or awarded supplier may call this",
            Error::NotReviewer => "only the agreed dispute reviewer may call this",
            Error::NotInvited => "invite secret does not match any invite slot of this RFQ",
            Error::InviteAlreadyUsed => "invite slot is bound to another account (one slot per account)",
            Error::BuyerCannotBid => "the buyer cannot bid on its own RFQ",
            Error::RfqNotOpen => "RFQ is not open for bids",
            Error::BiddingClosed => "bidding deadline has passed",
            Error::DeadlineNotReached => "bidding deadline has not passed yet",
            Error::RfqNotClosed => "RFQ must be closed and without an active award",
            Error::RfqNotCancellable => "RFQ can no longer be cancelled",
            Error::VersionNotIncreasing => "bid version must increase",
            Error::TooManyRevisions => "maximum bid revisions reached",
            Error::TooManyBids => "maximum bids reached",
            Error::NoActiveBid => "supplier has no active bid",
            Error::TooManyAwardRounds => "maximum award rounds reached",
            Error::NoAward => "RFQ has no award",
            Error::WrongAwardState => "transition not allowed in the current award state",
            Error::ReviewerConflict => "reviewer must differ from buyer, supplier and contract",
            Error::WrongDeposit => "attached deposit must equal the awarded amount exactly",
            Error::RequiresOneYocto => "attach exactly 1 yoctoNEAR (full-access key confirmation)",
            Error::AcceptWindowExpired => "acceptance window has expired",
            Error::AcceptWindowOpen => "acceptance window is still open",
            Error::ReviewWindowOpen => "review window is still open",
            Error::NoReviewer => "this award has no agreed dispute reviewer",
            Error::CancelAlreadyRequested => "a cancellation request is already pending",
            Error::NoCancelRequest => "no cancellation request is pending",
            Error::CannotApproveOwnRequest => "the counterparty must approve the cancellation",
            Error::NoDelivery => "delivery evidence has not been submitted",
            Error::Overflow => "arithmetic overflow",
        }
    }
}

pub type Res<T> = Result<T, Error>;

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
}

/// Parses exactly 64 lowercase/uppercase hex characters into 32 bytes.
pub fn parse_hash32(hex: &str) -> Res<Hash32> {
    let bytes = hex.as_bytes();
    if bytes.len() != 64 {
        return Err(Error::InvalidHash);
    }
    let mut out = [0u8; 32];
    for (i, chunk) in bytes.chunks(2).enumerate() {
        let hi = hex_val(chunk[0]).ok_or(Error::InvalidHash)?;
        let lo = hex_val(chunk[1]).ok_or(Error::InvalidHash)?;
        out[i] = (hi << 4) | lo;
    }
    Ok(out)
}

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn require_nonzero(hash: &Hash32) -> Res<()> {
    if hash.iter().all(|b| *b == 0) {
        Err(Error::InvalidHash)
    } else {
        Ok(())
    }
}

fn require_one_yocto(ctx: &Ctx) -> Res<()> {
    if ctx.attached == ONE_YOCTO {
        Ok(())
    } else {
        Err(Error::RequiresOneYocto)
    }
}

/// Preimage of an invite leaf: fixed-width fields after a NUL-terminated domain separator.
pub fn invite_leaf_preimage(policy_hash: &Hash32, secret: &Hash32) -> Vec<u8> {
    let mut out = Vec::with_capacity(INVITE_DOMAIN.len() + 1 + 32 + 32);
    out.extend_from_slice(INVITE_DOMAIN);
    out.push(0);
    out.extend_from_slice(policy_hash);
    out.extend_from_slice(secret);
    out
}

fn window_ok(window: u64, max: u64) -> bool {
    (MIN_WINDOW_NS..=max).contains(&window)
}

impl Rfq {
    /// `buyer` creates an RFQ. The wrapper charges measured storage from the attached deposit.
    pub fn create(
        id: u64,
        ctx: &Ctx,
        policy_hash: Hash32,
        terms_hash: Hash32,
        deadline_ns: u64,
        invite_leaves: Vec<Hash32>,
    ) -> Res<(Rfq, Outcome)> {
        require_nonzero(&policy_hash)?;
        require_nonzero(&terms_hash)?;
        if invite_leaves.is_empty() {
            return Err(Error::NoInvites);
        }
        if invite_leaves.len() > MAX_SUPPLIERS {
            return Err(Error::TooManyInvites);
        }
        for (i, leaf) in invite_leaves.iter().enumerate() {
            require_nonzero(leaf)?;
            if invite_leaves[..i].contains(leaf) {
                return Err(Error::DuplicateInvite);
            }
        }
        let earliest = ctx.now_ns.checked_add(MIN_WINDOW_NS).ok_or(Error::Overflow)?;
        let latest = ctx.now_ns.checked_add(MAX_BIDDING_WINDOW_NS).ok_or(Error::Overflow)?;
        if deadline_ns < earliest || deadline_ns > latest {
            return Err(Error::InvalidDeadline);
        }
        let rfq = Rfq {
            id,
            buyer: ctx.caller.to_string(),
            policy_hash,
            terms_hash,
            created_at_ns: ctx.now_ns,
            deadline_ns,
            closed_at_ns: 0,
            status: RfqStatus::Open,
            invite_leaves,
            bids: Vec::new(),
            awards: Vec::new(),
        };
        let event = Event::new("rfq_created", id)
            .with("buyer", ctx.caller)
            .with("policy_hash", to_hex(&rfq.policy_hash))
            .with("terms_hash", to_hex(&rfq.terms_hash))
            .with("deadline_ns", deadline_ns.to_string())
            .with("invite_count", rfq.invite_leaves.len().to_string());
        Ok((rfq, Outcome::event(event)))
    }

    fn require_buyer(&self, ctx: &Ctx) -> Res<()> {
        if ctx.caller == self.buyer {
            Ok(())
        } else {
            Err(Error::NotBuyer)
        }
    }

    /// Supplier commits (or revises) its salted quote commitment before the deadline.
    /// The invite leaf is recomputed here from the invite secret. The first account to use a
    /// slot owns it: a secret replayed from another supplier's transaction arguments is rejected,
    /// and one account can hold only one slot. `sha256` is injected so the contract can use the
    /// host function and tests can use `sha2`.
    pub fn commit_bid(
        &mut self,
        ctx: &Ctx,
        commitment: Hash32,
        version: u32,
        invite_secret: &Hash32,
        sha256: impl Fn(&[u8]) -> Hash32,
    ) -> Res<Outcome> {
        require_nonzero(&commitment)?;
        if self.status != RfqStatus::Open {
            return Err(Error::RfqNotOpen);
        }
        if ctx.now_ns >= self.deadline_ns {
            return Err(Error::BiddingClosed);
        }
        if ctx.caller == self.buyer {
            return Err(Error::BuyerCannotBid);
        }
        let leaf = sha256(&invite_leaf_preimage(&self.policy_hash, invite_secret));
        if !self.invite_leaves.contains(&leaf) {
            return Err(Error::NotInvited);
        }
        if let Some(owner) = self.bids.iter().find(|b| b.invite_leaf == leaf) {
            if owner.supplier != ctx.caller {
                return Err(Error::InviteAlreadyUsed);
            }
        }
        let id = self.id;
        if let Some(bid) = self.bids.iter_mut().find(|b| b.supplier == ctx.caller) {
            if bid.invite_leaf != leaf {
                return Err(Error::InviteAlreadyUsed);
            }
            if version <= bid.version {
                return Err(Error::VersionNotIncreasing);
            }
            if bid.revisions >= MAX_REVISIONS {
                return Err(Error::TooManyRevisions);
            }
            bid.commitment = commitment;
            bid.version = version;
            bid.revisions += 1;
            bid.committed_at_ns = ctx.now_ns;
            bid.withdrawn = false;
        } else {
            if self.bids.len() >= self.invite_leaves.len() {
                return Err(Error::TooManyBids);
            }
            if version == 0 {
                return Err(Error::VersionNotIncreasing);
            }
            self.bids.push(Bid {
                supplier: ctx.caller.to_string(),
                invite_leaf: leaf,
                commitment,
                version,
                revisions: 0,
                first_committed_at_ns: ctx.now_ns,
                committed_at_ns: ctx.now_ns,
                withdrawn: false,
            });
        }
        Ok(Outcome::event(
            Event::new("bid_committed", id)
                .with("supplier", ctx.caller)
                .with("commitment", to_hex(&commitment))
                .with("version", version.to_string())
                .with("committed_at_ns", ctx.now_ns.to_string()),
        ))
    }

    /// Supplier withdraws its bid before the deadline. A later commit with a higher version
    /// reinstates it.
    pub fn withdraw_bid(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        if self.status != RfqStatus::Open {
            return Err(Error::RfqNotOpen);
        }
        if ctx.now_ns >= self.deadline_ns {
            return Err(Error::BiddingClosed);
        }
        let id = self.id;
        let bid = self
            .bids
            .iter_mut()
            .find(|b| b.supplier == ctx.caller && !b.withdrawn)
            .ok_or(Error::NoActiveBid)?;
        bid.withdrawn = true;
        Ok(Outcome::event(
            Event::new("bid_withdrawn", id)
                .with("supplier", ctx.caller)
                .with("version", bid.version.to_string()),
        ))
    }

    /// Permissionless: anyone may close bidding once chain time has reached the deadline.
    pub fn close(&mut self, ctx: &Ctx) -> Res<Outcome> {
        if self.status != RfqStatus::Open {
            return Err(Error::RfqNotOpen);
        }
        if ctx.now_ns < self.deadline_ns {
            return Err(Error::DeadlineNotReached);
        }
        self.status = RfqStatus::Closed;
        self.closed_at_ns = ctx.now_ns;
        let active = self.bids.iter().filter(|b| !b.withdrawn).count();
        Ok(Outcome::event(
            Event::new("rfq_closed", self.id)
                .with("closed_by", ctx.caller)
                .with("active_bids", active.to_string()),
        ))
    }

    /// Buyer cancels the procurement while open or closed without an active award.
    pub fn cancel(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        self.require_buyer(ctx)?;
        match self.status {
            RfqStatus::Open | RfqStatus::Closed => {}
            _ => return Err(Error::RfqNotCancellable),
        }
        self.status = RfqStatus::Cancelled;
        Ok(Outcome::event(Event::new("rfq_cancelled", self.id).with("buyer", ctx.caller)))
    }

    pub fn current_award(&self) -> Option<&Award> {
        self.awards.last()
    }

    /// Principal currently held for this RFQ (0 or the current award's amount).
    pub fn escrowed(&self) -> u128 {
        self.awards.iter().filter(|a| a.status.holds_principal()).map(|a| a.amount).sum()
    }

    /// Buyer selects a supplier with an active bid after the RFQ has closed. The wrapper charges
    /// measured storage for the award record from the attached deposit.
    #[allow(clippy::too_many_arguments)]
    pub fn award(
        &mut self,
        ctx: &Ctx,
        supplier: &str,
        agreement_hash: Hash32,
        amount: u128,
        accept_window_ns: u64,
        review_window_ns: u64,
        reviewer: Option<&str>,
        contract_id: &str,
    ) -> Res<Outcome> {
        self.require_buyer(ctx)?;
        if self.status != RfqStatus::Closed {
            return Err(Error::RfqNotClosed);
        }
        require_nonzero(&agreement_hash)?;
        if amount == 0 || amount > MAX_AWARD_YOCTO {
            return Err(Error::InvalidAmount);
        }
        if !window_ok(accept_window_ns, MAX_ACCEPT_WINDOW_NS)
            || !window_ok(review_window_ns, MAX_REVIEW_WINDOW_NS)
        {
            return Err(Error::InvalidWindow);
        }
        if !self.bids.iter().any(|b| b.supplier == supplier && !b.withdrawn) {
            return Err(Error::NoActiveBid);
        }
        if let Some(r) = reviewer {
            if r.is_empty() || r.len() > MAX_ACCOUNT_LEN {
                return Err(Error::InvalidAccount);
            }
            if r == self.buyer || r == supplier || r == contract_id {
                return Err(Error::ReviewerConflict);
            }
        }
        if self.awards.len() >= MAX_AWARD_ROUNDS {
            return Err(Error::TooManyAwardRounds);
        }
        let round = self.awards.len() as u32 + 1;
        self.awards.push(Award {
            round,
            supplier: supplier.to_string(),
            agreement_hash,
            amount,
            reviewer: reviewer.map(str::to_string),
            accept_window_ns,
            review_window_ns,
            status: AwardStatus::Awarded,
            awarded_at_ns: ctx.now_ns,
            funded_at_ns: 0,
            accept_by_ns: 0,
            accepted_at_ns: 0,
            delivered_at_ns: 0,
            review_deadline_ns: 0,
            settled_at_ns: 0,
            evidence_hash: [0u8; 32],
            attempt: 0,
            cancel_requested_by: Party::None,
            dispute_opened_by: Party::None,
        });
        self.status = RfqStatus::Awarded;
        Ok(Outcome::event(
            Event::new("award_created", self.id)
                .with("round", round.to_string())
                .with("supplier", supplier)
                .with("amount_yocto", amount.to_string())
                .with("agreement_hash", to_hex(&agreement_hash))
                .with("reviewer", reviewer.unwrap_or(""))
                .with("accept_window_ns", accept_window_ns.to_string())
                .with("review_window_ns", review_window_ns.to_string()),
        ))
    }

    fn award_mut(&mut self) -> Res<&mut Award> {
        if self.status != RfqStatus::Awarded {
            return Err(Error::NoAward);
        }
        self.awards.last_mut().ok_or(Error::NoAward)
    }

    fn party_of(&self, caller: &str) -> Res<Party> {
        let award = self.awards.last().ok_or(Error::NoAward)?;
        if caller == self.buyer {
            Ok(Party::Buyer)
        } else if caller == award.supplier {
            Ok(Party::Supplier)
        } else {
            Err(Error::NotParty)
        }
    }

    fn award_event(&self, name: &'static str, actor: &str) -> Event {
        let award = self.awards.last().expect("award exists");
        Event::new(name, self.id)
            .with("round", award.round.to_string())
            .with("actor", actor)
            .with("status", award.status.as_str())
    }

    /// Schedules the next transfer attempt for the current award. Caller has verified state.
    fn schedule(&mut self, kind: TransferKind) -> Res<Transfer> {
        let buyer = self.buyer.clone();
        let award = self.awards.last_mut().ok_or(Error::NoAward)?;
        award.attempt = award.attempt.checked_add(1).ok_or(Error::Overflow)?;
        award.status = match kind {
            TransferKind::Release => AwardStatus::ReleasePending,
            TransferKind::Refund => AwardStatus::RefundPending,
        };
        Ok(Transfer {
            to: match kind {
                TransferKind::Release => award.supplier.clone(),
                TransferKind::Refund => buyer,
            },
            amount: award.amount,
            kind,
            round: award.round,
            attempt: award.attempt,
        })
    }

    fn with_transfer(&mut self, name: &'static str, actor: &str, kind: TransferKind) -> Res<Outcome> {
        let transfer = self.schedule(kind)?;
        let event = self
            .award_event(name, actor)
            .with("transfer_kind", kind.as_str())
            .with("attempt", transfer.attempt.to_string())
            .with("to", transfer.to.clone())
            .with("amount_yocto", transfer.amount.to_string());
        Ok(Outcome { event, transfer: Some(transfer), escrow_in: 0, escrow_out: 0 })
    }

    /// Buyer withdraws an unfunded award; the RFQ returns to Closed so it can be re-awarded.
    pub fn revoke_award(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        self.require_buyer(ctx)?;
        let award = self.award_mut()?;
        if award.status != AwardStatus::Awarded {
            return Err(Error::WrongAwardState);
        }
        award.status = AwardStatus::Revoked;
        award.settled_at_ns = ctx.now_ns;
        self.status = RfqStatus::Closed;
        Ok(Outcome::event(self.award_event("award_revoked", ctx.caller)))
    }

    /// Buyer deposits exactly the awarded principal. Storage was paid at award time, so the
    /// whole attached amount is principal.
    pub fn fund(&mut self, ctx: &Ctx) -> Res<Outcome> {
        self.require_buyer(ctx)?;
        let award = self.award_mut()?;
        if award.status != AwardStatus::Awarded {
            return Err(Error::WrongAwardState);
        }
        if ctx.attached != award.amount {
            return Err(Error::WrongDeposit);
        }
        award.status = AwardStatus::Funded;
        award.funded_at_ns = ctx.now_ns;
        award.accept_by_ns = ctx.now_ns.checked_add(award.accept_window_ns).ok_or(Error::Overflow)?;
        let amount = award.amount;
        let accept_by = award.accept_by_ns;
        let event = self
            .award_event("award_funded", ctx.caller)
            .with("amount_yocto", amount.to_string())
            .with("accept_by_ns", accept_by.to_string());
        Ok(Outcome { event, transfer: None, escrow_in: amount, escrow_out: 0 })
    }

    /// Supplier accepts the agreed terms (amount, windows, reviewer) of a funded award.
    pub fn accept(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let award = self.award_mut()?;
        if ctx.caller != award.supplier {
            return Err(Error::NotSupplier);
        }
        if award.status != AwardStatus::Funded {
            return Err(Error::WrongAwardState);
        }
        if ctx.now_ns > award.accept_by_ns {
            return Err(Error::AcceptWindowExpired);
        }
        award.status = AwardStatus::Accepted;
        award.accepted_at_ns = ctx.now_ns;
        Ok(Outcome::event(self.award_event("award_accepted", ctx.caller)))
    }

    /// Supplier declines. Unfunded: RFQ returns to Closed. Funded: principal is refunded.
    pub fn decline(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let award = self.award_mut()?;
        if ctx.caller != award.supplier {
            return Err(Error::NotSupplier);
        }
        match award.status {
            AwardStatus::Awarded => {
                award.status = AwardStatus::Declined;
                award.settled_at_ns = ctx.now_ns;
                self.status = RfqStatus::Closed;
                Ok(Outcome::event(self.award_event("award_declined", ctx.caller)))
            }
            AwardStatus::Funded => self.with_transfer("award_declined", ctx.caller, TransferKind::Refund),
            _ => Err(Error::WrongAwardState),
        }
    }

    /// Buyer reclaims principal when the supplier did not accept within the acceptance window.
    pub fn reclaim_unaccepted(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        self.require_buyer(ctx)?;
        let award = self.award_mut()?;
        if award.status != AwardStatus::Funded {
            return Err(Error::WrongAwardState);
        }
        if ctx.now_ns <= award.accept_by_ns {
            return Err(Error::AcceptWindowOpen);
        }
        self.with_transfer("award_unaccepted_reclaimed", ctx.caller, TransferKind::Refund)
    }

    /// Supplier anchors the hash of its off-chain delivery evidence. Starts the review window.
    pub fn submit_delivery(&mut self, ctx: &Ctx, evidence_hash: Hash32) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        require_nonzero(&evidence_hash)?;
        let award = self.award_mut()?;
        if ctx.caller != award.supplier {
            return Err(Error::NotSupplier);
        }
        if award.status != AwardStatus::Accepted {
            return Err(Error::WrongAwardState);
        }
        award.status = AwardStatus::Delivered;
        award.evidence_hash = evidence_hash;
        award.delivered_at_ns = ctx.now_ns;
        award.review_deadline_ns =
            ctx.now_ns.checked_add(award.review_window_ns).ok_or(Error::Overflow)?;
        let review_deadline = award.review_deadline_ns;
        Ok(Outcome::event(
            self.award_event("delivery_submitted", ctx.caller)
                .with("evidence_hash", to_hex(&evidence_hash))
                .with("review_deadline_ns", review_deadline.to_string()),
        ))
    }

    /// Buyer approves the delivery and releases principal to the supplier. Also allowed while a
    /// dispute is open (the buyer conceding), but only after delivery evidence exists.
    pub fn approve_release(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        self.require_buyer(ctx)?;
        let award = self.award_mut()?;
        match award.status {
            AwardStatus::Delivered => {}
            AwardStatus::Disputed if award.delivered_at_ns != 0 => {}
            AwardStatus::Disputed => return Err(Error::NoDelivery),
            _ => return Err(Error::WrongAwardState),
        }
        self.with_transfer("release_approved", ctx.caller, TransferKind::Release)
    }

    /// Supplier claims principal after the review window elapsed with neither approval, dispute
    /// nor mutual cancellation (the agreed "deemed accepted" term).
    pub fn claim_after_review(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let award = self.award_mut()?;
        if ctx.caller != award.supplier {
            return Err(Error::NotSupplier);
        }
        if award.status != AwardStatus::Delivered {
            return Err(Error::WrongAwardState);
        }
        if ctx.now_ns <= award.review_deadline_ns {
            return Err(Error::ReviewWindowOpen);
        }
        self.with_transfer("release_claimed_after_review", ctx.caller, TransferKind::Release)
    }

    /// Either party re-schedules a transfer that failed (e.g. receiver account missing).
    /// Destination and amount are unchanged: they were locked at funding.
    pub fn retry_transfer(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        self.party_of(ctx.caller)?;
        let award = self.award_mut()?;
        let kind = match award.status {
            AwardStatus::ReleaseFailed => TransferKind::Release,
            AwardStatus::RefundFailed => TransferKind::Refund,
            _ => return Err(Error::WrongAwardState),
        };
        self.with_transfer("transfer_retried", ctx.caller, kind)
    }

    pub fn request_cancel(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let party = self.party_of(ctx.caller)?;
        let award = self.award_mut()?;
        match award.status {
            AwardStatus::Accepted | AwardStatus::Delivered | AwardStatus::Disputed => {}
            _ => return Err(Error::WrongAwardState),
        }
        if award.cancel_requested_by != Party::None {
            return Err(Error::CancelAlreadyRequested);
        }
        award.cancel_requested_by = party;
        Ok(Outcome::event(self.award_event("cancel_requested", ctx.caller).with("by", party.as_str())))
    }

    pub fn withdraw_cancel_request(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let party = self.party_of(ctx.caller)?;
        let award = self.award_mut()?;
        match award.status {
            AwardStatus::Accepted | AwardStatus::Delivered | AwardStatus::Disputed => {}
            _ => return Err(Error::WrongAwardState),
        }
        if award.cancel_requested_by == Party::None {
            return Err(Error::NoCancelRequest);
        }
        if award.cancel_requested_by != party {
            return Err(Error::NotParty);
        }
        award.cancel_requested_by = Party::None;
        Ok(Outcome::event(self.award_event("cancel_request_withdrawn", ctx.caller)))
    }

    /// The counterparty of a pending cancellation request approves it: principal is refunded to
    /// the buyer (the only account that funded it).
    pub fn approve_cancel(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let party = self.party_of(ctx.caller)?;
        let award = self.award_mut()?;
        match award.status {
            AwardStatus::Accepted | AwardStatus::Delivered | AwardStatus::Disputed => {}
            _ => return Err(Error::WrongAwardState),
        }
        match award.cancel_requested_by {
            Party::None => return Err(Error::NoCancelRequest),
            p if p == party => return Err(Error::CannotApproveOwnRequest),
            _ => {}
        }
        self.with_transfer("cancel_approved", ctx.caller, TransferKind::Refund)
    }

    /// Either party opens a dispute; only possible when a reviewer was agreed in the award.
    pub fn open_dispute(&mut self, ctx: &Ctx) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let party = self.party_of(ctx.caller)?;
        let award = self.award_mut()?;
        if award.reviewer.is_none() {
            return Err(Error::NoReviewer);
        }
        match award.status {
            AwardStatus::Accepted | AwardStatus::Delivered => {}
            _ => return Err(Error::WrongAwardState),
        }
        award.status = AwardStatus::Disputed;
        award.dispute_opened_by = party;
        Ok(Outcome::event(self.award_event("dispute_opened", ctx.caller).with("by", party.as_str())))
    }

    /// The agreed reviewer resolves a dispute with one of exactly two outcomes. The reviewer can
    /// never choose a destination or a partial amount.
    pub fn resolve_dispute(&mut self, ctx: &Ctx, outcome: DisputeOutcome) -> Res<Outcome> {
        require_one_yocto(ctx)?;
        let award = self.award_mut()?;
        if award.reviewer.as_deref() != Some(ctx.caller) {
            return Err(Error::NotReviewer);
        }
        if award.status != AwardStatus::Disputed {
            return Err(Error::WrongAwardState);
        }
        let kind = match outcome {
            DisputeOutcome::ReleaseToSupplier => TransferKind::Release,
            DisputeOutcome::RefundToBuyer => TransferKind::Refund,
        };
        self.with_transfer("dispute_resolved", ctx.caller, kind)
    }

    /// Result of a scheduled transfer, delivered by the wrapper's private callback. Callbacks
    /// that do not match the current round/attempt/pending kind are ignored (stale).
    pub fn on_transfer_result(
        &mut self,
        now_ns: u64,
        round: u32,
        attempt: u32,
        kind: TransferKind,
        success: bool,
    ) -> Outcome {
        let id = self.id;
        let expected_status = match kind {
            TransferKind::Release => AwardStatus::ReleasePending,
            TransferKind::Refund => AwardStatus::RefundPending,
        };
        let matches = self.status == RfqStatus::Awarded
            && self
                .awards
                .last()
                .map(|a| a.round == round && a.attempt == attempt && a.status == expected_status)
                .unwrap_or(false);
        if !matches {
            return Outcome::event(
                Event::new("stale_callback", id)
                    .with("round", round.to_string())
                    .with("attempt", attempt.to_string())
                    .with("transfer_kind", kind.as_str()),
            );
        }
        let award = self.awards.last_mut().expect("checked above");
        let amount = award.amount;
        let mut escrow_out = 0;
        if success {
            award.status = match kind {
                TransferKind::Release => AwardStatus::Paid,
                TransferKind::Refund => AwardStatus::Refunded,
            };
            award.settled_at_ns = now_ns;
            award.cancel_requested_by = Party::None;
            escrow_out = amount;
            // Paid ends the procurement. Refunded returns the RFQ to Closed so the buyer may
            // award another bidder (a new round with new terms) or cancel.
            self.status = match kind {
                TransferKind::Release => RfqStatus::Settled,
                TransferKind::Refund => RfqStatus::Closed,
            };
        } else {
            award.status = match kind {
                TransferKind::Release => AwardStatus::ReleaseFailed,
                TransferKind::Refund => AwardStatus::RefundFailed,
            };
        }
        let event = Event::new(if success { "transfer_succeeded" } else { "transfer_failed" }, id)
            .with("round", round.to_string())
            .with("attempt", attempt.to_string())
            .with("transfer_kind", kind.as_str())
            .with("amount_yocto", amount.to_string());
        Outcome { event, transfer: None, escrow_in: 0, escrow_out }
    }
}
