import { and, eq } from "drizzle-orm";
import { ExternalLink, Lock, Pencil, ScanEye, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CATEGORIES, formatMoney, parseDecimal, CURRENCY_DECIMALS, type RfqStatus } from "@veilprocure/shared";
import { ActionButton, ResendInvite } from "@/components/action-button";
import { AuditList } from "@/components/audit-list";
import { EscrowPanel } from "@/components/escrow-panel";
import { RfqStatusBadge } from "@/components/status";
import { Badge, ButtonLink, Callout, Card, CardHeader, Hash, KeyValue, PageHeader } from "@/components/ui";
import { TxAction } from "@/components/wallet/tx-action";
import { can, requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { emailDeliveryMode } from "@/server/email";
import { contractConfigured, env } from "@/server/env";
import { prepareRfqChainAction, preparePublishAction, recoverPublicationAction, resendInviteAction, returnToDraftAction } from "@/server/actions/procurement";
import { syncRfqFromChain, type ChainRfq } from "@/server/chain/sync";
import { listSlots, loadBuyerRfq, publishReadiness, readDraft, readFrozenPolicy } from "@/server/services/rfq";

const t = tables;
export const metadata = { title: "Request" };

function utc(d: Date | null | undefined) {
  return d ? `${d.toISOString().replace("T", " ").slice(0, 16)} UTC` : "Not set";
}

export default async function RfqDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorPage(`/app/rfqs/${id}`);
  let rfq = await loadBuyerRfq(actor, id, "rfq:view");
  const m = actor.memberships.find((x) => x.orgId === rfq.buyerOrgId)!;
  const explorer = env().NEAR_EXPLORER_URL;

  let chain: ChainRfq | null = null;
  let chainError = false;
  if (rfq.onchainId !== null) {
    try {
      chain = await syncRfqFromChain(rfq.id);
      rfq = await loadBuyerRfq(actor, id, "rfq:view");
    } catch {
      chainError = true;
    }
  }
  const status = rfq.status as RfqStatus;
  const slots = await listSlots(rfq.id);
  const frozen = await readFrozenPolicy(rfq);
  const policy = frozen?.policy ?? null;
  const draft = policy ? null : await readDraft(rfq);
  const readiness = status === "draft" || status === "publishing" ? await publishReadiness(rfq, actor) : null;
  const [publishReceipt] = await db().select().from(t.commitmentReceipts).where(and(eq(t.commitmentReceipts.rfqId, rfq.id), eq(t.commitmentReceipts.kind, "rfq_policy"))).limit(1);
  const deadlinePassed = !!rfq.deadlineAt && rfq.deadlineAt.getTime() <= Date.now();
  const isChainBuyer = actor.wallet?.accountId === rfq.buyerAccountId;
  const criteria = policy?.criteria ?? (draft ? { maxPrice: draft.maxPrice, maxDeliveryDays: draft.maxDeliveryDays, minRevisions: draft.minRevisions, requirements: draft.requirements } : null);
  const currency = policy?.currency ?? draft?.currency ?? "USD";

  return (
    <>
      <PageHeader
        eyebrow={`${CATEGORIES[rfq.category as keyof typeof CATEGORIES] ?? rfq.category}${rfq.onchainId !== null ? ` · RFQ #${rfq.onchainId} on NEAR testnet` : ""}`}
        title={rfq.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <RfqStatusBadge status={status} />
            <span>Bids close {utc(rfq.deadlineAt)}</span>
          </span>
        }
        actions={
          status === "draft" &&
          can(m, "rfq:edit") && (
            <ButtonLink href={`/app/rfqs/${id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit draft
            </ButtonLink>
          )
        }
      />
      <div className="space-y-6">
        {chainError && <Callout tone="warn" title="NEAR testnet RPC is not reachable right now">Showing the last verified state. Chain-backed statuses will refresh when the RPC responds.</Callout>}

        {readiness && (
          <Card>
            <CardHeader
              eyebrow="Publish"
              title={status === "publishing" ? "Waiting for your publication signature" : "Ready to publish?"}
              description="Publishing freezes the policy, creates one private invite slot per supplier, and anchors the policy hash on NEAR testnet from your wallet."
            />
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {!contractConfigured() && (
                <Callout tone="warn" title="On-chain actions are disabled on this server">
                  The VeilProcure contract has not been deployed/configured here yet (NEAR_CONTRACT_ID is empty), so publishing is unavailable. Drafts still save.
                </Callout>
              )}
              {readiness.issues.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {readiness.issues.map((i) => (
                    <li key={i.field + i.message} className="flex gap-2 text-bad">
                      <span aria-hidden>•</span>
                      <span>
                        <strong className="font-medium">{i.field}:</strong> {i.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Callout tone="ok">All checks pass. After publishing, criteria and terms cannot change; to change them you would cancel and reissue.</Callout>
              )}
              <div className="flex flex-wrap gap-2">
                {can(m, "rfq:publish") && (
                  <TxAction
                    prepare={preparePublishAction.bind(null, rfq.id)}
                    label={status === "publishing" ? "Sign publication" : "Publish on NEAR testnet"}
                    variant="gold"
                    explorerBase={explorer}
                    disabled={readiness.issues.length > 0 && status !== "publishing"}
                    icon={<Send className="size-4" aria-hidden />}
                    confirmCopy="Creates the RFQ record on chain: policy hash, terms hash, deadline and one salted leaf per invite slot. No supplier names or e-mails go on chain."
                  />
                )}
                {status === "publishing" && (
                  <>
                    <ActionButton action={recoverPublicationAction.bind(null, rfq.id)} label="I already signed — check chain" successText="Checked the contract." />
                    <ActionButton action={returnToDraftAction.bind(null, rfq.id)} label="Return to draft" variant="ghost" />
                  </>
                )}
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader eyebrow={policy ? `Frozen policy v${frozen!.version}` : "Draft policy"} title="Evaluation rules" description={policy ? "These exact rules are hashed on chain. Suppliers see them before quoting." : "Editable until published."} />
            <div className="px-5 py-4 sm:px-6">
              {criteria ? (
                <KeyValue
                  items={[
                    ["Currency", currency === "NEAR" ? "NEAR (testnet)" : currency],
                    ["Maximum price", criteria.maxPrice ? formatMoney(parseDecimal(criteria.maxPrice, CURRENCY_DECIMALS[currency]), currency) : "No ceiling"],
                    ["Max delivery", criteria.maxDeliveryDays ? `${criteria.maxDeliveryDays} days` : "No limit"],
                    ["Min revision rounds", criteria.minRevisions ?? "None"],
                    ["Mandatory capabilities", criteria.requirements.length ? criteria.requirements.map((r) => r.label).join(" · ") : "None"],
                    ["Weights", policy ? `Price ${policy.weights.price}% · Delivery ${policy.weights.delivery}% · Revisions ${policy.weights.revisions}%` : draft ? `Price ${draft.weights.price}% · Delivery ${draft.weights.delivery}% · Revisions ${draft.weights.revisions}%` : "—"],
                    ["Payment terms", policy ? `Accept within ${policy.terms.acceptWindowMinutes} min · review ${policy.terms.reviewWindowMinutes} min · reviewer ${policy.terms.reviewerAccountId ?? "none"}` : "Set in the draft"],
                  ]}
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="Proof" title="On-chain anchors" description="Independently checkable on NEAR testnet." />
            <div className="px-5 py-4 sm:px-6">
              {rfq.onchainId === null ? (
                <p className="text-sm text-muted">Nothing is on chain until you publish.</p>
              ) : (
                <KeyValue
                  items={[
                    ["Contract", <a key="c" href={`${explorer}/address/${rfq.contractId}`} className="hash text-verify hover:underline" target="_blank" rel="noreferrer">{rfq.contractId}</a>],
                    ["Buyer wallet", <span key="b" className="hash">{rfq.buyerAccountId}</span>],
                    ["Policy hash", <Hash key="p" value={rfq.policyHash!} label="Policy hash" />],
                    ["Terms hash", <Hash key="tt" value={rfq.termsHash!} label="Terms hash" />],
                    [
                      "Publication tx",
                      publishReceipt && publishReceipt.txHash !== "recovered-without-hash" ? (
                        <a key="tx" href={`${explorer}/txns/${publishReceipt.txHash}`} className="inline-flex items-center gap-1 text-verify hover:underline" target="_blank" rel="noreferrer">
                          {publishReceipt.txHash.slice(0, 10)}… <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        "Recovered from contract state"
                      ),
                    ],
                    ["Chain status", chain ? <Badge key="s" tone="verify">{chain.status} · checked {utc(rfq.chainSyncedAt)}</Badge> : "—"],
                  ]}
                />
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            eyebrow="Suppliers"
            title="Invitation slots"
            description={
              emailDeliveryMode() === "resend"
                ? "Each slot has a private secret; its salted leaf is on chain. Only the invited e-mail can accept."
                : "Each slot has a private secret; its salted leaf is on chain. This server does not e-mail invitations: use “Get invitation link” and send each supplier their one-time link yourself. Only the invited e-mail can accept."
            }
          />
          {slots.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted">No suppliers invited yet. Add them in the draft.</p>
          ) : (
            <ul className="divide-y divide-line">
              {slots.map((s) => {
                const bid = chain?.bids.find((b) => b.invite_leaf === s.inviteLeaf);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{s.supplierOrgName ?? s.inviteEmail}</p>
                      <p className="truncate text-xs text-muted">
                        {s.inviteEmail}
                        {bid ? ` · committed from ${bid.supplier} (v${bid.version})` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={s.status === "accepted" ? "ok" : s.status === "pending" ? "warn" : "neutral"}>{s.status}</Badge>
                      {bid && <Badge tone={bid.withdrawn ? "neutral" : "verify"}>{bid.withdrawn ? "bid withdrawn" : "sealed bid on chain"}</Badge>}
                      {status === "open" && s.status === "pending" && can(m, "rfq:invite") && <ResendInvite action={resendInviteAction.bind(null, rfq.id, s.id)} label={emailDeliveryMode() === "resend" ? "Re-send invitation" : "Get invitation link"} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {(status === "open" || status === "closed" || status === "awarded" || status === "settled" || status === "cancelled") && (
          <Card>
            <CardHeader
              eyebrow="Sealed bids"
              title={status === "open" ? "Bids are sealed until the deadline" : "Bidding closed on chain"}
              description={
                status === "open"
                  ? "You can see that commitments exist, never their contents. The database refuses to return quote rows to your organisation until the contract reports the RFQ closed."
                  : "Quote contents are now available to your organisation, each checked against its on-chain commitment."
              }
              action={
                status !== "open" && status !== "cancelled" ? (
                  <ButtonLink href={`/app/rfqs/${rfq.id}/compare`} variant="gold">
                    <ScanEye className="size-4" aria-hidden /> Open comparison
                  </ButtonLink>
                ) : undefined
              }
            />
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {chain && chain.bids.length > 0 ? (
                <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                  {chain.bids.map((b) => (
                    <li key={b.supplier} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <Lock className="size-3.5 text-faint" aria-hidden />
                        <span className="hash">{b.supplier}</span>
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted">
                        v{b.version} · <Hash value={b.commitment} chars={8} label="Commitment" /> · {utc(new Date(Number(BigInt(b.committed_at_ns) / 1_000_000n)))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No commitments on chain yet.</p>
              )}
              {status === "open" && (
                <div className="flex flex-wrap items-center gap-2">
                  {isChainBuyer ? (
                    <>
                      <TxAction
                        prepare={prepareRfqChainAction.bind(null, rfq.id, "close_rfq")}
                        label="Close bidding"
                        explorerBase={explorer}
                        disabled={!deadlinePassed}
                        icon={<ShieldCheck className="size-4" aria-hidden />}
                        confirmCopy="The contract accepts this only if NEAR chain time has reached the deadline. After it, no bid can be added or revised."
                      />
                      {can(m, "rfq:publish") && (
                        <TxAction prepare={prepareRfqChainAction.bind(null, rfq.id, "cancel_rfq")} label="Cancel request" variant="danger" explorerBase={explorer} confirmCopy="Cancels the procurement on chain. Suppliers will see it as cancelled. This cannot be undone." />
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">Signed by the RFQ's buyer wallet ({rfq.buyerAccountId}).</p>
                  )}
                  {!deadlinePassed && <span className="text-xs text-muted">Close becomes available after {utc(rfq.deadlineAt)}.</span>}
                </div>
              )}
              {status === "closed" && isChainBuyer && can(m, "rfq:publish") && (
                <TxAction prepare={prepareRfqChainAction.bind(null, rfq.id, "cancel_rfq")} label="Cancel without awarding" variant="danger" explorerBase={explorer} confirmCopy="Ends this procurement without an award." />
              )}
            </div>
          </Card>
        )}

        {(status === "awarded" || status === "settled" || status === "closed") && (
          <EscrowPanel rfqId={rfq.id} buyerOrgId={rfq.buyerOrgId} role="buyer" chainAward={chain?.awards.at(-1) ?? null} canSign={can(m, "escrow:sign") && isChainBuyer} />
        )}

        <Card>
          <CardHeader eyebrow="Audit trail" title="History" description="Append-only and hash-chained. Each event links to its transaction where one exists." />
          <AuditList rfqId={rfq.id} />
        </Card>
      </div>
    </>
  );
}
