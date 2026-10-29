/**
 * Application-level RFQ lifecycle. Financial states after award mirror the contract's
 * `AwardStatus` and are only ever written by the chain reconciler from verified chain state.
 */
export const RFQ_STATUSES = ["draft", "publishing", "open", "closed", "awarded", "settled", "cancelled"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const AWARD_STATUSES = [
  "awarded",
  "funded",
  "accepted",
  "delivered",
  "release_pending",
  "release_failed",
  "paid",
  "disputed",
  "refund_pending",
  "refund_failed",
  "refunded",
  "revoked",
  "declined",
] as const;
export type AwardStatus = (typeof AWARD_STATUSES)[number];

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  draft: "Draft",
  publishing: "Publishing",
  open: "Open for bids",
  closed: "Bidding closed",
  awarded: "Awarded",
  settled: "Settled",
  cancelled: "Cancelled",
};

export const AWARD_STATUS_LABEL: Record<AwardStatus, string> = {
  awarded: "Awarded, awaiting funding",
  funded: "Funded, awaiting supplier acceptance",
  accepted: "Accepted, work in progress",
  delivered: "Delivered, awaiting buyer review",
  release_pending: "Payout pending",
  release_failed: "Payout failed, retry available",
  paid: "Paid",
  disputed: "In dispute",
  refund_pending: "Refund pending",
  refund_failed: "Refund failed, retry available",
  refunded: "Refunded",
  revoked: "Award revoked",
  declined: "Declined by supplier",
};

/** Transitions the application performs on its own records. Chain-backed ones are reconciled. */
const TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  draft: ["publishing", "cancelled"],
  publishing: ["open", "draft"],
  open: ["closed", "cancelled"],
  closed: ["awarded", "cancelled"],
  awarded: ["closed", "settled"],
  settled: [],
  cancelled: [],
};

export function canTransition(from: RfqStatus, to: RfqStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Quote plaintext is visible to the buyer organisation only once bidding has closed on chain. */
export function buyerMaySeeQuotes(status: RfqStatus): boolean {
  return status === "closed" || status === "awarded" || status === "settled";
}
