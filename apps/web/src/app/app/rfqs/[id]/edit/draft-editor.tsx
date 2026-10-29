"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import type { RfqDraft } from "@veilprocure/shared";
import { saveRfqDraftAction } from "@/server/actions/procurement";
import { Button, Callout, Field, inputClass } from "@/components/ui";

const WINDOW_PRESETS: [number, string][] = [
  [5, "5 minutes (testing only)"],
  [60, "1 hour"],
  [24 * 60, "1 day"],
  [3 * 24 * 60, "3 days"],
  [7 * 24 * 60, "7 days"],
  [14 * 24 * 60, "14 days"],
  [30 * 24 * 60, "30 days"],
];

function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DraftEditor({
  rfqId,
  initial,
  initialDeadline,
  initialInvitees,
  categories,
  currencies,
}: {
  rfqId: string;
  initial: RfqDraft;
  initialDeadline: string | null;
  initialInvitees: string[];
  categories: [string, string][];
  currencies: readonly string[];
}) {
  const [d, setD] = useState<RfqDraft>(initial);
  const [deadline, setDeadline] = useState(toLocalInput(initialDeadline));
  const [invitees, setInvitees] = useState<string[]>(initialInvitees.length ? initialInvitees : [""]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const weightSum = d.weights.price + d.weights.delivery + d.weights.revisions;
  const set = <K extends keyof RfqDraft>(k: K, v: RfqDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  function save(thenReview: boolean) {
    setMessage(null);
    start(async () => {
      const res = await saveRfqDraftAction(rfqId, {
        draft: { ...d, deliverables: d.deliverables.filter((x) => x.trim()), requirements: d.requirements.filter((r) => r.label.trim()) },
        deadline: deadline ? new Date(deadline).toISOString() : null,
        invitees: invitees.filter((x) => x.trim()),
      });
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        setMessage({ tone: "bad", text: res.error.message });
        return;
      }
      setErrors({});
      if (thenReview) router.push(`/app/rfqs/${rfqId}`);
      else setMessage({ tone: "ok", text: "Draft saved and encrypted." });
    });
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      <Section title="Basics" description="What suppliers see first in their invitation.">
        <Field label="Title" htmlFor="title" error={errors.title}>
          <input id="title" className={inputClass} value={d.title} maxLength={140} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select id="category" className={inputClass} value={d.category} onChange={(e) => set("category", e.target.value as RfqDraft["category"])}>
              {categories.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bid deadline" htmlFor="deadline" hint="Your local time. Enforced by NEAR chain time; quotes stay sealed until it passes." error={errors.deadline}>
            <input id="deadline" type="datetime-local" className={inputClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Short summary" htmlFor="summary" optional hint="One or two sentences shown at the top of the invitation." error={errors.summary}>
          <textarea id="summary" rows={2} maxLength={500} className={inputClass} value={d.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>
      </Section>

      <Section title="Scope & deliverables" description="Be specific: the scope is part of the frozen policy and is shared with invited suppliers only.">
        <Field label="Scope of work" htmlFor="scope" error={errors.scope}>
          <textarea id="scope" rows={7} maxLength={20000} className={inputClass} value={d.scope} onChange={(e) => set("scope", e.target.value)} placeholder="Context, what must be done, constraints, acceptance criteria…" />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Deliverables</legend>
          {errors.deliverables && <p className="text-xs font-medium text-bad">{errors.deliverables}</p>}
          {(d.deliverables.length ? d.deliverables : [""]).map((v, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={`Deliverable ${i + 1}`}
                className={inputClass}
                value={v}
                maxLength={300}
                onChange={(e) => {
                  const next = [...(d.deliverables.length ? d.deliverables : [""])];
                  next[i] = e.target.value;
                  set("deliverables", next);
                }}
                placeholder="e.g. Audit report (PDF) with prioritised findings"
              />
              <Button variant="ghost" aria-label={`Remove deliverable ${i + 1}`} onClick={() => set("deliverables", d.deliverables.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => set("deliverables", [...d.deliverables, ""])} disabled={d.deliverables.length >= 20}>
            <Plus className="size-4" aria-hidden /> Add deliverable
          </Button>
        </fieldset>
      </Section>

      <Section title="Hard requirements" description="Pass/fail rules checked with exact arithmetic before any scoring or AI. A quote that fails one is ineligible, whatever else it says.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Currency" htmlFor="currency" hint="For comparing quotes. Escrow is always testnet NEAR.">
            <select id="currency" className={inputClass} value={d.currency} onChange={(e) => set("currency", e.target.value as RfqDraft["currency"])}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c === "NEAR" ? "NEAR (testnet)" : c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum price" htmlFor="maxPrice" optional error={errors.maxPrice}>
            <input id="maxPrice" inputMode="decimal" className={inputClass} value={d.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value.trim() || null)} placeholder="No ceiling" />
          </Field>
          <Field label="Max delivery (days)" htmlFor="maxDays" optional error={errors.maxDeliveryDays}>
            <input id="maxDays" type="number" min={1} max={3650} className={inputClass} value={d.maxDeliveryDays ?? ""} onChange={(e) => set("maxDeliveryDays", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <Field label="Minimum revision rounds" htmlFor="minRev" optional error={errors.minRevisions}>
          <input id="minRev" type="number" min={0} max={100} className={`${inputClass} sm:max-w-[200px]`} value={d.minRevisions ?? ""} onChange={(e) => set("minRevisions", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink">Mandatory capabilities</legend>
          <p className="text-xs text-muted">Each supplier must explicitly confirm these. Confirmations are supplier declarations and are labelled as such in the comparison.</p>
          {d.requirements.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <input
                  aria-label={`Requirement ${i + 1}`}
                  className={inputClass}
                  value={r.label}
                  maxLength={120}
                  onChange={(e) => {
                    const next = [...d.requirements];
                    const label = e.target.value;
                    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `req-${i + 1}`;
                    next[i] = { ...r, label, id: slug };
                    set("requirements", next);
                  }}
                  placeholder="e.g. WCAG 2.2 AA audit experience"
                />
                <input
                  aria-label={`Requirement ${i + 1} details`}
                  className={inputClass}
                  value={r.description}
                  maxLength={1000}
                  onChange={(e) => {
                    const next = [...d.requirements];
                    next[i] = { ...r, description: e.target.value };
                    set("requirements", next);
                  }}
                  placeholder="Details (optional)"
                />
              </div>
              <Button variant="ghost" aria-label={`Remove requirement ${i + 1}`} onClick={() => set("requirements", d.requirements.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          {errors.requirements && <p className="text-xs font-medium text-bad">{errors.requirements}</p>}
          <Button variant="secondary" size="sm" onClick={() => set("requirements", [...d.requirements, { id: `req-${d.requirements.length + 1}`, label: "", description: "" }])} disabled={d.requirements.length >= 15}>
            <Plus className="size-4" aria-hidden /> Add requirement
          </Button>
        </fieldset>
      </Section>

      <Section title="Scoring weights" description="How eligible quotes are ranked: each factor scores relative to the best value in the field. Quality judgements stay with you; AI notes are advisory and never change the score.">
        {(["price", "delivery", "revisions"] as const).map((k) => (
          <div key={k} className="grid items-center gap-3 sm:grid-cols-[140px_1fr_60px]">
            <label htmlFor={`w-${k}`} className="text-sm font-medium capitalize text-ink">
              {k === "delivery" ? "Delivery time" : k === "revisions" ? "Revision rounds" : "Price"}
            </label>
            <input id={`w-${k}`} type="range" min={0} max={100} step={5} value={d.weights[k]} onChange={(e) => set("weights", { ...d.weights, [k]: Number(e.target.value) })} className="accent-[var(--color-gold)]" />
            <span className="text-right text-sm tabular-nums text-ink">{d.weights[k]}%</span>
          </div>
        ))}
        <p className={`text-sm ${weightSum === 100 ? "text-ok" : "font-medium text-bad"}`} aria-live="polite">
          Total {weightSum}% {weightSum === 100 ? "✓" : "— must equal 100% to publish"}
        </p>
      </Section>

      <Section title="Payment & acceptance terms" description="Shown to suppliers before they quote and enforced by the escrow contract. Single milestone, settled in testnet NEAR.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Supplier acceptance window" htmlFor="acceptWin" hint="After you fund the escrow, the supplier must accept within this window or you can reclaim the funds.">
            <select id="acceptWin" className={inputClass} value={d.acceptWindowMinutes} onChange={(e) => set("acceptWindowMinutes", Number(e.target.value))}>
              {WINDOW_PRESETS.filter(([m]) => m <= 30 * 24 * 60).map(([m, l]) => (
                <option key={m} value={m}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Your review window" htmlFor="reviewWin" hint="After delivery evidence is anchored, if you neither release, dispute nor agree a cancellation within this window, the supplier may claim payment.">
            <select id="reviewWin" className={inputClass} value={d.reviewWindowMinutes} onChange={(e) => set("reviewWindowMinutes", Number(e.target.value))}>
              {WINDOW_PRESETS.map(([m, l]) => (
                <option key={m} value={m}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Dispute reviewer (NEAR account)" htmlFor="reviewer" optional hint="Only if both parties agree on a neutral reviewer. They can resolve a dispute only by releasing to the supplier or refunding you — never anything else." error={errors.reviewerAccountId}>
          <input id="reviewer" className={inputClass} value={d.reviewerAccountId ?? ""} onChange={(e) => set("reviewerAccountId", e.target.value.trim().toLowerCase() || null)} placeholder="reviewer.testnet" />
        </Field>
      </Section>

      <Section title="Invited suppliers" description="Each address gets a private invitation slot. Only the person who signs in with that exact e-mail can accept it. Up to 20.">
        {errors.invitees && <p className="text-xs font-medium text-bad">{errors.invitees}</p>}
        {invitees.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="email"
              aria-label={`Supplier e-mail ${i + 1}`}
              className={inputClass}
              value={v}
              onChange={(e) => setInvitees((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="bids@supplier.com"
            />
            <Button variant="ghost" aria-label={`Remove supplier ${i + 1}`} onClick={() => setInvitees((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [""]))}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setInvitees((xs) => [...xs, ""])} disabled={invitees.length >= 20}>
          <Plus className="size-4" aria-hidden /> Add supplier
        </Button>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0 text-sm">
            {message && <Callout tone={message.tone}>{message.text}</Callout>}
          </div>
          <div className="flex gap-2">
            <Link href={`/app/rfqs/${rfqId}`} className="inline-flex h-10 items-center px-3 text-sm text-muted hover:text-ink">
              Cancel
            </Link>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button onClick={() => save(true)} disabled={pending}>
              Save &amp; review
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
