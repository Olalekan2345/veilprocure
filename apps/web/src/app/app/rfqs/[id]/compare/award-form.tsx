"use client";

import { Gavel } from "lucide-react";
import { useState } from "react";
import { prepareAwardActionServer } from "@/server/actions/procurement";
import { Callout, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { TxAction } from "@/components/wallet/tx-action";

export function AwardForm({ rfqId, options, explorerBase, reviewer }: { rfqId: string; options: { quoteId: string; label: string; rank: number }[]; explorerBase: string; reviewer: string | null }) {
  const [quoteId, setQuoteId] = useState(options[0]?.quoteId ?? "");
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");
  const chosen = options.find((o) => o.quoteId === quoteId);
  const override = chosen && chosen.rank !== 1;
  const valid = /^(0|[1-9]\d*)(\.\d{1,24})?$/.test(amount) && Number(amount) > 0 && summary.trim().length >= 10 && (!override || reason.trim().length >= 10);
  return (
    <Card>
      <CardHeader eyebrow="Human decision" title="Award a supplier" description="You decide. The AI cannot award or move funds. The award fixes recipient and amount on chain; funding is a separate step." />
      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-2">
        <Field label="Eligible quote" htmlFor="award-quote">
          <select id="award-quote" className={inputClass} value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
            {options.map((o) => (
              <option key={o.quoteId} value={o.quoteId}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Escrow amount (testnet NEAR)" htmlFor="award-amount" hint="The agreed price converted to testnet NEAR by you. Integer yocto precision; no floating point.">
          <input id="award-amount" inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value.trim())} placeholder="e.g. 2.5" />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Agreed work (single milestone)" htmlFor="award-summary" hint="Hashed into the on-chain agreement together with amount, windows and reviewer.">
            <textarea id="award-summary" rows={3} className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
          </Field>
        </div>
        {override && (
          <div className="lg:col-span-2">
            <Field label="Reason for choosing a lower-ranked quote" htmlFor="award-reason" hint="Recorded in the audit trail.">
              <textarea id="award-reason" rows={2} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </Field>
          </div>
        )}
        <div className="space-y-3 lg:col-span-2">
          <Callout tone="neutral">Dispute reviewer: {reviewer ?? "none (mutual cancellation only)"} — as published in the policy.</Callout>
          <TxAction
            prepare={() => prepareAwardActionServer(rfqId, { quoteId, amountNear: amount, workSummary: summary, overrideReason: reason || undefined })}
            label="Sign award"
            variant="gold"
            explorerBase={explorerBase}
            disabled={!valid}
            icon={<Gavel className="size-4" aria-hidden />}
            confirmCopy="Records the award on chain: supplier wallet, amount, agreement hash and windows. A small storage deposit is attached; excess is refunded. No escrow funds move yet."
          />
        </div>
      </div>
    </Card>
  );
}
