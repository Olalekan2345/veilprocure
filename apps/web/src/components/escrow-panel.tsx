import { ExternalLink, Landmark } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { formatNear, type AwardStatus } from "@veilprocure/shared";
import { prepareAwardStepAction } from "@/server/actions/procurement";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";
import type { ChainAward } from "@/server/chain/sync";
import { ACTION_STATES, deliveriesFor, readAgreement } from "@/server/services/award";
import type { IntentKind } from "@/server/chain/intents";
import { AwardStatusBadge } from "./status";
import { Callout, Card, CardHeader, Hash, KeyValue } from "./ui";
import { TxAction } from "./wallet/tx-action";
import { DeliveryForm } from "./delivery-form";

const t = tables;

function nsDate(ns: string | undefined): string {
  if (!ns || ns === "0") return "—";
  return new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const COPY: Partial<Record<IntentKind, { label: string; variant?: "primary" | "gold" | "secondary" | "danger"; copy: string }>> = {
  fund_award: { label: "Fund escrow", variant: "gold", copy: "Attach exactly the awarded amount. The contract holds it; it can only go to the selected supplier or back to you." },
  revoke_award: { label: "Revoke award", variant: "secondary", copy: "Withdraw this unfunded award. No funds move; you can award another bid." },
  reclaim_unaccepted: { label: "Reclaim escrow", variant: "secondary", copy: "The supplier did not accept in time. The contract refunds the full principal to you." },
  approve_release: { label: "Approve & release payment", variant: "gold", copy: "Releases the full principal to the supplier. Final once the transfer succeeds." },
  accept_award: { label: "Accept award", variant: "gold", copy: "Accept the agreed amount, windows and reviewer. The escrow is already funded." },
  decline_award: { label: "Decline award", variant: "danger", copy: "Decline this award. If it is funded, the principal is refunded to the buyer." },
  claim_after_review: { label: "Claim payment", variant: "gold", copy: "The buyer's review window has passed with no release, dispute or cancellation. The contract pays you the principal." },
  retry_transfer: { label: "Retry failed transfer", variant: "primary", copy: "Re-attempts the same transfer to the same destination. Amount and recipient cannot change." },
  request_cancel: { label: "Request cancellation", variant: "secondary", copy: "Asks the other party to agree to cancel. If they approve, the principal is refunded to the buyer." },
  approve_cancel: { label: "Approve cancellation", variant: "danger", copy: "Agrees to cancel. The full principal is refunded to the buyer." },
  withdraw_cancel_request: { label: "Withdraw cancellation request", variant: "secondary", copy: "Withdraws your pending cancellation request." },
  open_dispute: { label: "Open dispute", variant: "danger", copy: "Freezes automatic claims and lets the agreed reviewer decide: release to supplier or refund to buyer." },
};

const BUYER_KINDS: IntentKind[] = ["fund_award", "revoke_award", "reclaim_unaccepted", "approve_release", "retry_transfer", "request_cancel", "approve_cancel", "withdraw_cancel_request", "open_dispute"];
const SUPPLIER_KINDS: IntentKind[] = ["accept_award", "decline_award", "claim_after_review", "retry_transfer", "request_cancel", "approve_cancel", "withdraw_cancel_request", "open_dispute"];

/**
 * Award & escrow state for one RFQ, rendered from the chain view (source of truth) with the
 * actions the viewer's role may take in that state. The contract re-checks every rule.
 */
export async function EscrowPanel({
  rfqId,
  buyerOrgId,
  role,
  chainAward,
  canSign,
}: {
  rfqId: string;
  buyerOrgId: string;
  role: "buyer" | "supplier";
  chainAward: ChainAward | null;
  canSign: boolean;
}) {
  const [award] = await db().select().from(t.awards).where(eq(t.awards.rfqId, rfqId)).orderBy(desc(t.awards.round)).limit(1);
  if (!award) return null;
  const agreement = await readAgreement(award, buyerOrgId);
  const deliveries = await deliveriesFor(award.id, award.supplierOrgId);
  const txs = await db().select().from(t.escrowTransactions).where(eq(t.escrowTransactions.rfqId, rfqId)).orderBy(desc(t.escrowTransactions.createdAt));
  const status = (chainAward?.round === award.round ? chainAward.status : award.status) as AwardStatus | "pending_signature";
  const explorer = env().NEAR_EXPLORER_URL;
  const party = role;
  const cancelBy = chainAward?.cancel_requested_by ?? "none";
  const now = Date.now();
  const acceptBy = chainAward ? Number(BigInt(chainAward.accept_by_ns) / 1_000_000n) : 0;
  const reviewBy = chainAward ? Number(BigInt(chainAward.review_deadline_ns) / 1_000_000n) : 0;

  const kinds = (role === "buyer" ? BUYER_KINDS : SUPPLIER_KINDS).filter((k) => {
    const allowed = ACTION_STATES[k];
    if (!allowed || !allowed.includes(status as AwardStatus)) return false;
    if (k === "reclaim_unaccepted") return acceptBy > 0 && now > acceptBy;
    if (k === "accept_award") return acceptBy === 0 || now <= acceptBy;
    if (k === "claim_after_review") return reviewBy > 0 && now > reviewBy;
    if (k === "request_cancel") return cancelBy === "none";
    if (k === "approve_cancel") return cancelBy !== "none" && cancelBy !== party;
    if (k === "withdraw_cancel_request") return cancelBy === party;
    if (k === "open_dispute") return Boolean(award.reviewerAccountId);
    return true;
  });

  return (
    <Card>
      <CardHeader
        eyebrow={`Award round ${award.round}`}
        title={<span className="flex flex-wrap items-center gap-2">Escrow <AwardStatusBadge status={status} /></span>}
        description="Status mirrors the contract. Amount and recipient are locked once funded."
      />
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {status === "pending_signature" && (
          <Callout tone="warn">This award has been prepared but not yet signed on chain by the buyer's wallet.</Callout>
        )}
        {status === "release_failed" || status === "refund_failed" ? (
          <Callout tone="bad" title="A transfer failed">
            The contract attempted the transfer and it did not succeed (for example, the receiving account does not exist). The principal is still held and the same transfer can be retried by either party.
          </Callout>
        ) : null}
        {cancelBy !== "none" && <Callout tone="warn">Cancellation requested by the {cancelBy}. It takes effect only if the other party approves.</Callout>}
        <KeyValue
          items={[
            ["Supplier wallet", <a key="s" className="hash text-verify hover:underline" href={`${explorer}/address/${award.supplierAccountId}`} target="_blank" rel="noreferrer">{award.supplierAccountId}</a>],
            ["Amount", <strong key="a">{formatNear(BigInt(award.amountYocto), 8)} <span className="font-normal text-muted">(testnet, no monetary value)</span></strong>],
            ["Agreed work", <span key="w" className="whitespace-pre-wrap">{agreement.workSummary}</span>],
            ["Acceptance window", `${award.acceptWindowMinutes} min${chainAward && chainAward.accept_by_ns !== "0" ? ` · accept by ${nsDate(chainAward.accept_by_ns)}` : ""}`],
            ["Review window", `${award.reviewWindowMinutes} min${chainAward && chainAward.review_deadline_ns !== "0" ? ` · until ${nsDate(chainAward.review_deadline_ns)}` : ""}`],
            ["Dispute reviewer", award.reviewerAccountId ?? "None agreed — disputes not available; mutual cancellation only"],
            ["Agreement hash", <Hash key="h" value={award.agreementHash} label="Agreement hash" />],
            ...(award.overrideReason ? [["Override reason (audited)", award.overrideReason] as [string, string]] : []),
            ...(chainAward?.evidence_hash ? [["Delivery evidence hash", <Hash key="e" value={chainAward.evidence_hash} label="Evidence hash" />] as [string, React.ReactNode]] : []),
            ["Transfer attempts", String(chainAward?.attempt ?? award.chainAttempt)],
          ]}
        />
        {deliveries.length > 0 && (
          <div className="rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold text-ink">Delivery evidence</p>
            {deliveries.map((d) => (
              <div key={d.id} className="mt-2">
                <p className="whitespace-pre-wrap text-ink-3">{d.note}</p>
                <p className="mt-1 text-xs text-muted">
                  {d.fileDigests.length} file{d.fileDigests.length === 1 ? "" : "s"} · evidence hash <Hash value={d.evidenceHash} chars={8} />
                </p>
              </div>
            ))}
          </div>
        )}
        {canSign && role === "supplier" && status === "accepted" && <DeliveryForm rfqId={rfqId} explorerBase={explorer} />}
        {canSign && kinds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <TxAction
                key={k}
                prepare={prepareAwardStepAction.bind(null, rfqId, k)}
                label={COPY[k]?.label ?? k}
                variant={COPY[k]?.variant ?? "secondary"}
                explorerBase={explorer}
                confirmCopy={COPY[k]?.copy}
                icon={k === "fund_award" || k === "approve_release" ? <Landmark className="size-4" aria-hidden /> : undefined}
              />
            ))}
          </div>
        )}
        {!canSign && kinds.length > 0 && <p className="text-sm text-muted">Signing escrow actions requires the escrow signing permission and the wallet bound to this award.</p>}
        {txs.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Escrow transactions</p>
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {txs.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="capitalize text-ink">{x.action.replaceAll("_", " ")}</span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {x.transferOutcome && <span className={x.transferOutcome === "transfer_succeeded" ? "text-ok" : "text-bad"}>{x.transferOutcome.replace("_", " ")}</span>}
                    <span className={x.status === "confirmed" ? "text-ok" : "text-bad"}>{x.status}</span>
                    <a className="inline-flex items-center gap-1 text-verify hover:underline" href={`${explorer}/txns/${x.txHash}`} target="_blank" rel="noreferrer">
                      {x.txHash.slice(0, 8)}… <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
