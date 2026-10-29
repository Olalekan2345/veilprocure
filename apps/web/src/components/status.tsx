import { AWARD_STATUS_LABEL, RFQ_STATUS_LABEL, type AwardStatus, type RfqStatus } from "@veilprocure/shared";
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

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1b1c1e" />
      <path d="M8.5 9.5 16 23l7.5-13.5" fill="none" stroke="#c9a96a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 13.2c3.2-2.2 6.3-3.2 9.5-3.2s6.3 1 9.5 3.2" fill="none" stroke="#f6f4ef" strokeOpacity=".55" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[17px] font-semibold tracking-tight text-ink">
        Veil<span className="text-gold-ink">Procure</span>
      </span>
    </span>
  );
}
