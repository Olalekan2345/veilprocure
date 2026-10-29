import { ExternalLink, Lock } from "lucide-react";
import { formatMoney, parseDecimal, CURRENCY_DECIMALS, type RfqStatus } from "@veilprocure/shared";
import { EscrowPanel } from "@/components/escrow-panel";
import { RfqStatusBadge } from "@/components/status";
import { Badge, Callout, Card, CardHeader, Hash, KeyValue, PageHeader } from "@/components/ui";
import { can, requireActorPage } from "@/server/authz";
import { env } from "@/server/env";
import { syncRfqFromChain, type ChainRfq } from "@/server/chain/sync";
import { currentAward } from "@/server/services/award";
import { loadSupplierContext } from "@/server/services/supplier";
import { QuoteEditor } from "./quote-editor";

export const metadata = { title: "Bid workspace" };

export default async function BidWorkspace({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = await params;
  const actor = await requireActorPage(`/app/bids/${rfqId}`);
  let chain: ChainRfq | null = null;
  try {
    chain = await syncRfqFromChain(rfqId);
  } catch {
    chain = null;
  }
  const ctx = await loadSupplierContext(actor, rfqId);
  const { rfq, policy } = ctx;
  const m = ctx.membership;
  const status = rfq.status as RfqStatus;
  const open = status === "open" && !!rfq.deadlineAt && rfq.deadlineAt.getTime() > Date.now();
  const myBid = chain?.bids.find((b) => ctx.revisions.some((r) => r.supplierAccountId === b.supplier && r.commitmentHex === b.commitment));
  const award = await currentAward(rfqId);
  const myAward = award && award.supplierOrgId === ctx.supplierOrgId ? award : null;
  const money = (v: string | null) => (v ? formatMoney(parseDecimal(v, CURRENCY_DECIMALS[policy.currency]), policy.currency) : "No ceiling");

  return (
    <>
      <PageHeader
        eyebrow={`From ${ctx.buyerName} · RFQ #${rfq.onchainId?.toString()}`}
        title={rfq.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <RfqStatusBadge status={status} /> Bids close {rfq.deadlineAt?.toISOString().replace("T", " ").slice(0, 16)} UTC (chain time)
          </span>
        }
      />
      <div className="space-y-6">
        <Callout tone="verify" icon={<Lock className="size-4" />} title="Deadline-sealed with audited access controls">
          Your draft and committed quote are encrypted and visible only to your organisation. The buyer&apos;s organisation can open your committed quote after the on-chain deadline; other suppliers never can. VeilProcure&apos;s servers can technically decrypt it, so this is not a cryptographic guarantee against the platform operator.
        </Callout>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader eyebrow={`Frozen policy v${ctx.policyVersion}`} title="What the buyer asked for" />
            <div className="space-y-4 px-5 py-4 text-sm sm:px-6">
              {policy.summary && <p className="text-ink-3">{policy.summary}</p>}
              <p className="whitespace-pre-wrap leading-relaxed text-ink-3">{policy.scope}</p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-faint">Deliverables</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-3">
                  {policy.deliverables.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="How quotes are judged" description="Published before bidding and hashed on chain. Applied identically to every supplier." />
            <div className="px-5 py-4 sm:px-6">
              <KeyValue
                items={[
                  ["Currency", policy.currency],
                  ["Maximum price", money(policy.criteria.maxPrice)],
                  ["Max delivery", policy.criteria.maxDeliveryDays ? `${policy.criteria.maxDeliveryDays} days` : "No limit"],
                  ["Min revisions", policy.criteria.minRevisions ?? "None"],
                  ["You must confirm", policy.criteria.requirements.length ? policy.criteria.requirements.map((r) => r.label).join(" · ") : "Nothing"],
                  ["Scoring", `Price ${policy.weights.price}% · Delivery ${policy.weights.delivery}% · Revisions ${policy.weights.revisions}%`],
                  ["Payment", `Testnet NEAR escrow · accept within ${policy.terms.acceptWindowMinutes} min of funding · buyer review ${policy.terms.reviewWindowMinutes} min`],
                  ["Dispute reviewer", policy.terms.reviewerAccountId ?? "None (mutual cancellation only)"],
                  ["Policy hash", <Hash key="p" value={rfq.policyHash!} />],
                ]}
              />
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            eyebrow="Your quote"
            title={myBid ? (myBid.withdrawn ? "Bid withdrawn" : `Sealed bid on chain (v${myBid.version})`) : "Not yet committed"}
            description={open ? "Save drafts freely. Committing seals an immutable revision and anchors its salted hash from your wallet. You can revise with a higher version until the deadline." : "Bidding is closed. Your last committed version is binding."}
          />
          <div className="px-5 py-5 sm:px-6">
            <QuoteEditor
              rfqId={rfqId}
              initial={ctx.draft}
              requirements={policy.criteria.requirements}
              currency={policy.currency}
              attachments={ctx.attachments.map((a) => ({ id: a.id, name: a.filename, sha256: a.sha256, sizeBytes: a.sizeBytes }))}
              editable={open && can(m, "quote:edit")}
              canCommit={open && can(m, "quote:submit")}
              hasWallet={Boolean(actor.wallet)}
              explorerBase={env().NEAR_EXPLORER_URL}
              committed={Boolean(myBid && !myBid.withdrawn)}
            />
          </div>
        </Card>

        {ctx.revisions.length > 0 && (
          <Card>
            <CardHeader title="Revisions & receipts" description="Every sealed revision is kept. Only the latest committed, non-withdrawn version counts at the deadline." />
            <ul className="divide-y divide-line text-sm">
              {ctx.revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">v{r.version}</span>
                    <Badge tone={r.status === "committed" ? "verify" : r.status === "superseded" ? "neutral" : r.status === "failed" ? "bad" : "warn"}>{r.status}</Badge>
                    <span className="hash text-xs text-muted">{r.supplierAccountId}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    <Hash value={r.commitmentHex} chars={8} label="Commitment" />
                    {r.commitTxHash && (
                      <a href={`${env().NEAR_EXPLORER_URL}/txns/${r.commitTxHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-verify hover:underline">
                        tx <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                    {r.status === "committed" && (
                      <a href={`/api/receipts/${r.id}`} className="text-verify underline">
                        Download receipt
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {myAward && (
          <EscrowPanel rfqId={rfqId} buyerOrgId={rfq.buyerOrgId} role="supplier" chainAward={chain?.awards.at(-1) ?? null} canSign={can(m, "award:respond") && actor.wallet?.accountId === myAward.supplierAccountId} />
        )}
        {award && !myAward && award.status !== "pending_signature" && <Callout tone="neutral">This request was awarded to another supplier. Your quote remains private to your organisation and the buyer.</Callout>}
      </div>
    </>
  );
}
