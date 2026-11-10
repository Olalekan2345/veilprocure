"use client";

import { Check, Lock, LockOpen } from "lucide-react";
import { useState } from "react";

/**
 * Conceptual illustration (not live data): what a buyer can see before and after the on-chain
 * deadline. The visitor switches the state; nothing changes on its own.
 */
export function BidInbox() {
  const [open, setOpen] = useState(false);
  const rows: [string, string, string][] = [
    ["Number of sealed bids", "Visible", "Visible"],
    ["Commitment time and wallet", "Visible (public on chain)", "Visible"],
    ["Quote contents and prices", "Hidden from the buyer", "Visible to the buyer"],
    ["Integrity check", "Commitment on chain", "Recomputed and verified"],
  ];
  return (
    <div className="vp-panel p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="vp-field">Illustration · not live data</p>
        <div className="vp-toggle" role="group" aria-label="Bidding stage">
          <button type="button" aria-pressed={!open} onClick={() => setOpen(false)}>
            Before deadline
          </button>
          <button type="button" aria-pressed={open} onClick={() => setOpen(true)}>
            After close
          </button>
        </div>
      </div>

      <div className="vp-inbox mt-6">
        <ul className="vp-inbox-cards grid content-start gap-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className="vp-seal" data-open={open} data-reveal style={{ "--d": `${i * 140}ms` } as React.CSSProperties}>
              <span className="vp-seal-icon">{open ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-vp-ink">Sealed proposal {i}</p>
                <p className="text-[13px] text-vp-muted">{open ? "Opened after close · commitment verified" : "Committed on chain before the deadline"}</p>
                <div className="vp-blur mt-2 grid gap-1.5" aria-hidden>
                  <span className="vp-bar vp-bar-strong" style={{ width: `${86 - i * 9}%` }} />
                  <span className="vp-bar" style={{ width: `${58 + i * 7}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col rounded-2xl border border-vp-border bg-vp-canvas p-5 sm:p-6">
          <p className="vp-field">Buyer&apos;s protected inbox</p>
          <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-vp-ink" aria-live="polite">
            {open ? "Bidding closed on chain" : "Bidding open · contents sealed"}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-vp-body">
            {open
              ? "Every quote is recomputed and matched to the commitment its supplier signed before the deadline, then checked against your published rules."
              : "You see how many suppliers committed and when. What they offered stays sealed until the deadline passes on chain."}
          </p>
          <dl className="mt-5 divide-y divide-vp-border text-[14px]">
            {rows.map(([k, before, after]) => (
              <div key={k} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-vp-muted">{k}</dt>
                <dd className="flex items-center gap-1.5 text-right font-semibold text-vp-ink">
                  {open && after.startsWith("Recomputed") && <Check className="size-4 text-vp-evergreen" aria-hidden />}
                  {open ? after : before}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
