import { and, eq } from "drizzle-orm";
import { BadgeCheck, CircleSlash, Download, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatBp, formatMoney, parseDecimal, CURRENCY_DECIMALS } from "@veilprocure/shared";
import { ActionButton } from "@/components/action-button";
import { Badge, Callout, Card, CardHeader, Hash, PageHeader } from "@/components/ui";
import { can, requireActorPage } from "@/server/authz";
import { openJson, signDownload } from "@/server/crypto";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { recordEvaluationAction, requestAiEvaluationAction } from "@/server/actions/procurement";
import { buildComparison, latestAiJob, type Comparison } from "@/server/services/evaluation";
import { currentAward } from "@/server/services/award";
import { loadBuyerRfq } from "@/server/services/rfq";
import { AwardForm } from "./award-form";

const t = tables;
export const metadata = { title: "Comparison" };

interface AiNote {
  summary: string;
  strengths: { point: string; source: string }[];
  concerns: { point: string; source: string }[];
  ambiguities: { point: string; source: string }[];
}

export default async function Compare({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorPage(`/app/rfqs/${id}/compare`);
  const rfq = await loadBuyerRfq(actor, id, "rfq:view");
  const m = actor.memberships.find((x) => x.orgId === rfq.buyerOrgId)!;
  let cmp: Comparison;
  try {
    cmp = await buildComparison(actor, id);
  } catch (err) {
    return (
      <>
        <PageHeader eyebrow="Comparison" title={rfq.title} />
        <Callout tone={err instanceof AppError && err.code === "FORBIDDEN" ? "neutral" : "bad"} title="Quotes are not available">
          {err instanceof AppError ? err.message : "The comparison could not be built."} <Link href={`/app/rfqs/${id}`}>Back to the request</Link>.
        </Callout>
      </>
    );
  }
  const ai = await latestAiJob(id);
  const notes = new Map<string, AiNote>();
  if (ai?.job.status === "succeeded") {
    const rows = await db().select().from(t.aiAssessments).where(and(eq(t.aiAssessments.evaluationJobId, ai.job.id), eq(t.aiAssessments.verified, true)));
    for (const r of rows) notes.set(r.quoteId, await openJson<AiNote>(r.notesEnc, { table: "ai_assessments", id: r.id, org: rfq.buyerOrgId }));
  }
  const award = await currentAward(id);
  const canAward = rfq.status === "closed" && can(m, "rfq:award") && actor.wallet?.accountId === rfq.buyerAccountId && (!award || award.status === "pending_signature" || ["revoked", "declined", "refunded"].includes(award.status));
  const { currency } = cmp.policy;
  const money = (v: string) => formatMoney(parseDecimal(v, CURRENCY_DECIMALS[currency]), currency);

  return (
    <>
      <PageHeader
        eyebrow={`Comparison · policy v${cmp.policyVersion}`}
        title={rfq.title}
        description={
          <>
            Deterministic first: every quote is checked against its on-chain commitment and the published hard requirements with exact arithmetic; only eligible quotes are scored. Verification shows quotes were not altered and rules were applied as published.{" "}
            <strong className="font-medium text-ink">It does not prove commercial fairness or factual accuracy.</strong>
          </>
        }
        actions={<Link href={`/app/rfqs/${id}`} className="text-sm text-muted underline">Back to request</Link>}
      />
      <div className="space-y-6">
        {cmp.unmatchedChainBids.length > 0 && (
          <Callout tone="warn" title="On-chain bids without a sealed quote">
            {cmp.unmatchedChainBids.map((b) => b.supplier).join(", ")} committed on chain, but VeilProcure holds no matching sealed quote, so these cannot be opened or evaluated.
          </Callout>
        )}

        <Card>
          <CardHeader
            title="Ranking"
            description={`Checked against chain at ${cmp.chainCheckedAt.toISOString().replace("T", " ").slice(0, 19)} UTC. Weights: price ${cmp.policy.weights.price}%, delivery ${cmp.policy.weights.delivery}%, revisions ${cmp.policy.weights.revisions}%.`}
            action={can(m, "rfq:evaluate") && <ActionButton action={recordEvaluationAction.bind(null, id)} label="Record this evaluation" successText="Saved to the audit trail." size="sm" />}
          />
          {cmp.rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted">No sealed quotes were committed before the deadline.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-faint">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Rank</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Supplier</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Integrity</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Eligible</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Delivery</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Revisions</th>
                    <th scope="col" className="px-6 py-3 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cmp.rows.map((r) => (
                    <tr key={r.quoteId}>
                      <td className="px-6 py-3.5 tabular-nums text-ink">{r.rank ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <span className="block font-medium text-ink">{r.supplierName}</span>
                        <span className="hash text-xs text-muted">{r.supplierAccountId}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {r.integrity === "verified" ? (
                          <Badge tone="verify"><BadgeCheck className="size-3.5" aria-hidden /> Commitment verified</Badge>
                        ) : (
                          <Badge tone="bad"><CircleSlash className="size-3.5" aria-hidden /> {r.integrity.replaceAll("_", " ")}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5">{r.evaluation.eligible ? <Badge tone="ok">Eligible</Badge> : <Badge tone="bad">Ineligible</Badge>}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{money(r.quote.totalPrice)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{r.quote.deliveryDays} d</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{r.quote.revisionsIncluded}</td>
                      <td className="px-6 py-3.5 text-right font-semibold tabular-nums">{r.score ? formatBp(r.score.scoreBp) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            eyebrow="Advisory only"
            title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-gold" aria-hidden /> Private AI notes</span>}
            description="Qualitative notes from a model running in a NEAR AI Cloud TEE. Shown only when the attestation and response signature verify. They never change eligibility or scores and cannot award."
            action={can(m, "rfq:evaluate") && (!ai || ["failed", "blocked", "succeeded"].includes(ai.job.status)) && <ActionButton action={requestAiEvaluationAction.bind(null, id)} label={ai ? "Request again" : "Request AI notes"} size="sm" successText="Queued for the evaluation worker." />}
          />
          <div className="px-5 py-4 text-sm sm:px-6">
            {!ai && <p className="text-muted">Not requested. Deterministic evaluation above does not depend on it.</p>}
            {ai && (ai.job.status === "queued" || ai.job.status === "running") && <Callout tone="neutral">Job {ai.job.status}. The worker processes it in the background; refresh to see the result.</Callout>}
            {ai && ai.job.status === "blocked" && (
              <Callout tone="warn" title="Private AI is unavailable — nothing was sent to any model">
                {ai.job.errorMessage ?? "Confidential inference is not configured."} No unverified or non-private model was used as a substitute.
              </Callout>
            )}
            {ai && ai.job.status === "failed" && (
              <Callout tone="bad" title="UNVERIFIED — notes withheld">
                {ai.job.errorMessage ?? "Verification failed."} Because confidentiality could not be proven, no AI output is shown.
              </Callout>
            )}
            {ai?.job.status === "succeeded" && ai.evidence?.verified && (
              <Callout tone="verify" title="Attestation and signature verified" icon={<BadgeCheck className="size-4" />}>
                Model {ai.evidence.modelId} · signer <Hash value={ai.evidence.signingAddress ?? ""} chars={8} /> · policy {ai.evidence.verificationPolicyVersion} · TCB {ai.evidence.tcbStatus ?? "n/a"}.{" "}
                <Link href={`/app/rfqs/${id}/ai-evidence`}>View evidence</Link>
              </Callout>
            )}
          </div>
        </Card>

        {cmp.rows.map((r) => {
          const note = notes.get(r.quoteId);
          return (
            <Card key={r.quoteId} id={`q-${r.quoteId}`}>
              <CardHeader
                eyebrow={r.rank ? `Rank ${r.rank}` : "Not ranked"}
                title={r.supplierName}
                description={
                  <span className="flex flex-wrap items-center gap-2">
                    Version {r.version} · commitment <Hash value={r.commitment} chars={8} />
                    {r.commitTxHash && (
                      <a href={`${env().NEAR_EXPLORER_URL}/txns/${r.commitTxHash}`} target="_blank" rel="noreferrer" className="text-verify underline">
                        commit tx
                      </a>
                    )}
                  </span>
                }
              />
              <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-faint">Approach & scope</p>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink-3">{r.quote.scope}</p>
                  </div>
                  {r.quote.assumptions && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-faint">Assumptions</p>
                      <p className="mt-1 whitespace-pre-wrap text-ink-3">{r.quote.assumptions}</p>
                    </div>
                  )}
                  {r.quote.warranty && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-faint">Warranty / service terms</p>
                      <p className="mt-1 whitespace-pre-wrap text-ink-3">{r.quote.warranty}</p>
                    </div>
                  )}
                  {r.attachments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-faint">Attachments (encrypted; not malware-scanned)</p>
                      <ul className="mt-1 space-y-1">
                        {r.attachments.map((a) => (
                          <li key={a.id}>
                            <a href={`/api/files/${a.id}?t=${signDownload(a.id, actor.id)}`} className="inline-flex items-center gap-1.5 text-verify hover:underline">
                              <Download className="size-3.5" aria-hidden /> {a.filename}
                            </a>{" "}
                            <span className="text-xs text-muted">{Math.ceil(a.sizeBytes / 1024)} KB</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {note && (
                    <div className="rounded-xl border border-verify/20 bg-verify-soft/50 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-verify">
                        <Sparkles className="size-3.5" aria-hidden /> AI notes · recommendation only
                      </p>
                      <p className="mt-2 text-ink-3">{note.summary}</p>
                      {(["strengths", "concerns", "ambiguities"] as const).map((k) =>
                        note[k].length ? (
                          <div key={k} className="mt-2">
                            <p className="text-xs font-semibold capitalize text-ink">{k}</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-3">
                              {note[k].map((p, i) => (
                                <li key={i}>
                                  {p.point} <span className="hash text-xs text-faint">[{p.source}]</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Published criteria</p>
                  <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                    {r.evaluation.results.map((c) => (
                      <li key={c.criterionId} className="grid grid-cols-[auto_1fr] gap-3 px-4 py-2.5">
                        <Badge tone={c.outcome === "pass" ? "ok" : "bad"}>{c.outcome}</Badge>
                        <div className="min-w-0">
                          <p className="text-ink">{c.label}</p>
                          <p className="text-xs text-muted">
                            Expected {c.expected} · got {c.actual} · {c.basis === "supplier_declaration" ? "supplier declaration" : "exact check"} · <span className="hash">{c.sourceField}</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          );
        })}

        {canAward && cmp.rows.some((r) => r.evaluation.eligible) && (
          <AwardForm
            rfqId={id}
            explorerBase={env().NEAR_EXPLORER_URL}
            options={cmp.rows.filter((r) => r.evaluation.eligible).map((r) => ({ quoteId: r.quoteId, label: `${r.rank}. ${r.supplierName} — ${money(r.quote.totalPrice)}`, rank: r.rank ?? 99 }))}
            reviewer={cmp.policy.terms.reviewerAccountId}
          />
        )}
        {rfq.status === "closed" && !canAward && (
          <Callout tone="neutral">Awarding requires the award permission and the RFQ's buyer wallet ({rfq.buyerAccountId}).</Callout>
        )}
      </div>
    </>
  );
}
