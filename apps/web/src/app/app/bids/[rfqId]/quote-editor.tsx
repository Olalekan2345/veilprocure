"use client";

import { Lock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { QuoteInput, Requirement } from "@veilprocure/shared";
import { prepareCommitAction, prepareWithdrawAction, removeAttachmentAction, saveQuoteDraftAction } from "@/server/actions/procurement";
import { Button, Callout, Field, inputClass } from "@/components/ui";
import { FileUpload, type Uploaded } from "@/components/file-upload";
import { TxAction } from "@/components/wallet/tx-action";

const EMPTY: QuoteInput = { totalPrice: "", deliveryDays: 14, revisionsIncluded: 1, scope: "", assumptions: "", warranty: "", requirementResponses: {} };

export function QuoteEditor({
  rfqId,
  initial,
  requirements,
  currency,
  attachments,
  editable,
  canCommit,
  hasWallet,
  explorerBase,
  committed,
}: {
  rfqId: string;
  initial: QuoteInput | null;
  requirements: Requirement[];
  currency: string;
  attachments: Uploaded[];
  editable: boolean;
  canCommit: boolean;
  hasWallet: boolean;
  explorerBase: string;
  committed: boolean;
}) {
  const [q, setQ] = useState<QuoteInput>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saved, setSaved] = useState(Boolean(initial));
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => {
    setQ((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveQuoteDraftAction(rfqId, q);
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        setMsg({ tone: "bad", text: res.error.message });
        return;
      }
      setErrors({});
      setSaved(true);
      setMsg({ tone: "ok", text: "Draft saved and encrypted. Not yet committed." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <fieldset disabled={!editable} className="grid gap-5 sm:grid-cols-3">
        <Field label={`Total price (${currency})`} htmlFor="price" error={errors.totalPrice}>
          <input id="price" inputMode="decimal" className={inputClass} value={q.totalPrice} onChange={(e) => set("totalPrice", e.target.value.trim())} placeholder="e.g. 4800" />
        </Field>
        <Field label="Delivery (days)" htmlFor="days" error={errors.deliveryDays}>
          <input id="days" type="number" min={1} max={3650} className={inputClass} value={q.deliveryDays} onChange={(e) => set("deliveryDays", Number(e.target.value))} />
        </Field>
        <Field label="Revision rounds included" htmlFor="revs" error={errors.revisionsIncluded}>
          <input id="revs" type="number" min={0} max={100} className={inputClass} value={q.revisionsIncluded} onChange={(e) => set("revisionsIncluded", Number(e.target.value))} />
        </Field>
      </fieldset>
      <fieldset disabled={!editable} className="space-y-5">
        <Field label="Approach and scope" htmlFor="scope" error={errors.scope}>
          <textarea id="scope" rows={6} className={inputClass} value={q.scope} onChange={(e) => set("scope", e.target.value)} maxLength={20000} placeholder="How you will deliver, what is included, milestones within the single payment…" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Assumptions" htmlFor="assumptions" optional>
            <textarea id="assumptions" rows={3} className={inputClass} value={q.assumptions} onChange={(e) => set("assumptions", e.target.value)} maxLength={10000} />
          </Field>
          <Field label="Warranty / service terms" htmlFor="warranty" optional>
            <textarea id="warranty" rows={3} className={inputClass} value={q.warranty} onChange={(e) => set("warranty", e.target.value)} maxLength={5000} />
          </Field>
        </div>
        {requirements.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Mandatory capabilities</p>
            <p className="text-xs text-muted">Unconfirmed requirements make the quote ineligible. Your confirmation is recorded as a supplier declaration.</p>
            {requirements.map((r) => {
              const resp = q.requirementResponses[r.id] ?? { met: false, note: "" };
              return (
                <div key={r.id} className="rounded-xl border border-line p-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--color-ink)]"
                      checked={resp.met}
                      onChange={(e) => set("requirementResponses", { ...q.requirementResponses, [r.id]: { ...resp, met: e.target.checked } })}
                    />
                    <span>
                      <span className="font-medium text-ink">{r.label}</span>
                      {r.description && <span className="block text-xs text-muted">{r.description}</span>}
                    </span>
                  </label>
                  <input
                    aria-label={`Evidence for ${r.label}`}
                    className={`${inputClass} mt-2`}
                    value={resp.note}
                    maxLength={1000}
                    onChange={(e) => set("requirementResponses", { ...q.requirementResponses, [r.id]: { ...resp, note: e.target.value } })}
                    placeholder="Brief evidence (optional)"
                  />
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Attachments</p>
        {attachments.length > 0 ? (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate">
                  {a.name} <span className="hash text-xs text-muted">{a.sha256.slice(0, 12)}…</span>
                </span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${a.name}`}
                    onClick={() =>
                      start(async () => {
                        const r = await removeAttachmentAction(rfqId, a.id);
                        if (!r.ok) setMsg({ tone: "bad", text: r.error.message });
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No files. Each file&apos;s SHA-256 is included in your commitment.</p>
        )}
        {editable && (saved ? <FileUpload purpose="quote" rfqId={rfqId} onUploaded={() => router.refresh()} /> : <p className="text-xs text-muted">Save the draft to attach files.</p>)}
      </div>

      <div aria-live="polite">{msg && <Callout tone={msg.tone}>{msg.text}</Callout>}</div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <Button variant="secondary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          {canCommit &&
            (hasWallet ? (
              <TxAction
                prepare={() => prepareCommitAction(rfqId)}
                label={committed ? "Commit revised bid" : "Seal & commit bid"}
                variant="gold"
                explorerBase={explorerBase}
                disabled={!saved || pending}
                icon={<Lock className="size-4" aria-hidden />}
                confirmCopy="Seals your saved draft as an immutable revision, then your wallet anchors its salted SHA-256 on chain. The salt stays private; the buyer can verify the hash after the deadline."
              />
            ) : (
              <a href="/app/wallet" className="text-sm font-medium text-warn underline">
                Connect a testnet wallet to commit
              </a>
            ))}
          {committed && canCommit && hasWallet && (
            <TxAction prepare={() => prepareWithdrawAction(rfqId)} label="Withdraw bid" variant="danger" explorerBase={explorerBase} confirmCopy="Marks your bid withdrawn on chain. You can commit a new higher version before the deadline." />
          )}
          {!saved && <span className="text-xs text-warn">Unsaved changes: save before committing.</span>}
        </div>
      )}
    </div>
  );
}
