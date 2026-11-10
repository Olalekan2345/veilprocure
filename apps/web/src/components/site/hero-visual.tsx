import { Mail } from "lucide-react";

/** Padlock whose shackle closes once the hero has settled. */
function Padlock({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g className="vp-shackle">
        <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6" fill="currentColor" />
      <circle cx="12" cy="15.6" r="1.6" fill="var(--color-vp-mint)" />
    </svg>
  );
}

function Row({ label, width }: { label: string; width: string }) {
  return (
    <div className="grid grid-cols-[42%_1fr] items-center gap-3">
      <dt className="vp-st-label">{label}</dt>
      <dd>
        <span className="vp-bar" style={{ width }} />
      </dd>
    </div>
  );
}

function Proposal({ n, state, style }: { n: 1 | 2 | 3; state: "sealed" | "ready"; style: React.CSSProperties }) {
  return (
    <div className={`vp-card vp-env vp-env-${n}`} style={style}>
      <div className="flex items-center gap-2.5">
        <span className="vp-seal-icon">
          <Mail className="size-[55%]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="vp-st-title">Supplier proposal</p>
          <p className="vp-st-label">Encrypted at rest</p>
        </div>
      </div>
      <div className="mt-2.5">
        {state === "sealed" ? (
          <span className="vp-chip vp-chip-ink">Sealed until deadline</span>
        ) : (
          <span className="vp-chip vp-chip-mint">Ready for review</span>
        )}
      </div>
    </div>
  );
}

/**
 * Original, data-free illustration of the workflow: a confidential request at the centre, sealed
 * proposals around it, and the wallet approval that releases payment. No amounts, names or hashes.
 */
export function HeroVisual() {
  return (
    <figure className="vp-stage" aria-label="Workflow illustration: a confidential request, sealed supplier proposals and a wallet approval step">
      <div className="vp-stage-glow" aria-hidden />
      <div className="vp-stage-ring" aria-hidden />

      <div className="vp-card vp-rfq">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-vp-ink">
            <Padlock />
            <div>
              <p className="vp-st-title">Request for quotation</p>
              <p className="vp-st-label">Confidential</p>
            </div>
          </div>
          <span className="vp-chip vp-chip-mint">Rules published</span>
        </div>
        <dl className="mt-4 grid gap-2.5">
          <Row label="Scope" width="88%" />
          <Row label="Hard requirements" width="64%" />
          <Row label="Price ceiling" width="38%" />
          <Row label="Bid deadline" width="50%" />
        </dl>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-vp-border pt-3">
          <span className="vp-st-label">Policy hash</span>
          <span className="vp-dots" aria-label="hash placeholder">●●●● ●●●● ●●●●</span>
        </div>
        <ol className="mt-3 flex items-center gap-1.5" aria-label="Evidence chain: policy, sealed bids, award">
          {["Policy", "Sealed bids", "Award"].map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <span className="h-px w-3 bg-vp-mint-sage" aria-hidden />}
              <span className="vp-chip vp-chip-ink">
                <span className="size-1.5 rounded-full bg-vp-evergreen" aria-hidden />
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Proposal n={1} state="sealed" style={{ "--d": "240ms", "--fx": "-48px", "--fy": "-24px", "--fr": "-9deg" } as React.CSSProperties} />
      <Proposal n={2} state="sealed" style={{ "--d": "380ms", "--fx": "48px", "--fy": "-30px", "--fr": "8deg" } as React.CSSProperties} />
      <Proposal n={3} state="ready" style={{ "--d": "520ms", "--fx": "-36px", "--fy": "40px", "--fr": "-6deg" } as React.CSSProperties} />

      <div className="vp-card vp-approve" style={{ "--d": "700ms", "--fx": "30px", "--fy": "44px", "--fr": "5deg" } as React.CSSProperties}>
        <p className="vp-st-label !text-white/60">Payment approval</p>
        <p className="vp-st-title !text-white">Your wallet signs the release</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="vp-chip vp-chip-dark">NEAR testnet</span>
          <span className="vp-chip vp-chip-dark">Escrow</span>
        </div>
      </div>
      <figcaption className="vp-stage-caption">Workflow illustration</figcaption>
    </figure>
  );
}
