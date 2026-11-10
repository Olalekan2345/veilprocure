import { AWARD_STATUS_LABEL, RFQ_STATUS_LABEL, type AwardStatus, type RfqStatus } from "@veilprocure/shared";
import { BrandLockup } from "./site/brand";
import { Badge, type Tone } from "./ui";

const RFQ_TONE: Record<RfqStatus, Tone> = {
  draft: "neutral",
  publishing: "warn",
  open: "gold",
  closed: "verify",
  awarded: "verify",
  settled: "ok",
  cancelled: "neutral",
};

const AWARD_TONE: Record<AwardStatus | "pending_signature", Tone> = {
  pending_signature: "warn",
  awarded: "gold",
  funded: "verify",
  accepted: "verify",
  delivered: "verify",
  release_pending: "warn",
  release_failed: "bad",
  paid: "ok",
  disputed: "bad",
  refund_pending: "warn",
  refund_failed: "bad",
  refunded: "neutral",
  revoked: "neutral",
  declined: "neutral",
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <Badge tone={RFQ_TONE[status]}>{RFQ_STATUS_LABEL[status]}</Badge>;
}

export function AwardStatusBadge({ status }: { status: AwardStatus | "pending_signature" }) {
  return <Badge tone={AWARD_TONE[status]}>{status === "pending_signature" ? "Awaiting buyer signature" : AWARD_STATUS_LABEL[status]}</Badge>;
}

/** The approved VeilProcure logo (monogram + original lettering), used across the app. */
export function Wordmark() {
  return <BrandLockup height={30} />;
}
