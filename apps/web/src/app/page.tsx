import {
  ArrowRight,
  BadgeCheck,
  Check,
  ClipboardList,
  Cpu,
  FileLock2,
  Fingerprint,
  Gavel,
  Layers,
  ListChecks,
  Lock,
  Plus,
  Receipt,
  ScrollText,
  ShieldCheck,
  Signature,
  Store,
  UserCheck,
  Wallet,
} from "lucide-react";
import { BackToTop } from "@/components/site/back-to-top";
import { BidInbox } from "@/components/site/bid-inbox";
import { HeroVisual } from "@/components/site/hero-visual";
import { SiteMotion } from "@/components/site/motion";
import { MotionBoot } from "@/components/site/motion-boot";
import { SiteFooter, SiteHeader, START_HREF } from "@/components/site/site-chrome";

const AI_DOC = "https://github.com/Olalekan2345/veilprocure/blob/main/docs/AI_VERIFICATION.md";

function Overline({ n, children, id }: { n: string; children: React.ReactNode; id?: string }) {
  return (
    <p className="vp-overline" id={id}>
      <span className="vp-num">{n}</span>
      <span className="vp-rule" aria-hidden />
      {children}
    </p>
  );
}

/** Splits a statement into words that reveal one after another (faint, never invisible). */
function Words({ text, start = 0, step = 55, className = "" }: { text: string; start?: number; step?: number; className?: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className={className}>
          <span data-reveal="word" style={{ "--d": `${start + i * step}ms` } as React.CSSProperties}>
            {w}
          </span>{" "}
        </span>
      ))}
    </>
  );
}

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const EVIDENCE = [
  { icon: Fingerprint, field: "Policy hash", chip: "On chain at publish", body: "A SHA-256 of your frozen rules is written to NEAR testnet when you publish, so criteria cannot change silently once bids arrive." },
  { icon: FileLock2, field: "Submission commitment", chip: "Salted SHA-256", body: "Each supplier's wallet commits a salted hash of the exact quote and files before the deadline. After close, every quote is recomputed against it." },
  { icon: ListChecks, field: "Eligibility rule", chip: "Pass / fail with basis", body: "Hard requirements are checked by deterministic code with exact arithmetic, and every result shows what was expected and why it passed or failed." },
  { icon: Signature, field: "Approval required", chip: "Wallet signature", body: "Award, funding and release each need the buyer's wallet to sign. VeilProcure's servers never hold wallet keys." },
];

const MODULES = [
  { icon: ScrollText, title: "Policy constraints", body: "Rules are frozen and hashed before the first bid, and the escrow contract can only pay the awarded supplier or refund the buyer." },
  { icon: Wallet, title: "Wallet authorization", body: "Every on-chain step is signed in your NEAR testnet wallet. AI notes cannot award, fund, release or change anything." },
  { icon: Gavel, title: "Auditable outcomes", body: "A hash-chained audit trail links each decision to its transaction, and disputes go only to a reviewer named before bidding opened." },
];

const STEPS = [
  { title: "Create your RFQ", body: "Write the scope, hard requirements, price ceiling and scoring weights; publishing freezes them and anchors their hash on NEAR testnet.", href: START_HREF, cta: "Start a request" },
  { title: "Collect private bids", body: "Invited suppliers submit encrypted quotes, and each supplier's wallet commits a salted hash on chain before the deadline.", href: "#bids", cta: "See sealed bidding" },
  { title: "Review AI-assisted evaluation", body: "After close, every quote is verified against its commitment and your rules; optional AI notes appear only when attestation checks pass.", href: "#ai", cta: "How the AI is checked" },
  { title: "Approve and pay", body: "Award the supplier, fund escrow in testnet NEAR and release payment with your wallet once delivery evidence is anchored.", href: "#authorize", cta: "Who authorizes payment" },
];

const FAQ: { id: string; q: string; a: React.ReactNode }[] = [
  {
    id: "faq-quotes",
    q: "Who can read my quotes?",
    a: (
      <>
        Before the on-chain deadline, only the supplier who wrote a quote. After bidding closes, the buyer&apos;s organisation as well. Quotes are encrypted at rest, and every access is checked by organisation and deadline, then enforced again by row-level security in the database.
        <br />
        <br />
        They are not mathematically unreadable: VeilProcure&apos;s servers hold the decryption key, so a privileged operator could technically access them. Read the full <a className="vp-link" href="/security">trust boundary</a>.
      </>
    ),
  },
  {
    id: "faq-ai",
    q: "What can the AI decide?",
    a: "Nothing. After bidding closes it writes advisory notes — strengths, concerns and ambiguities, each citing the quote field it relies on. Eligibility and ranking come from deterministic rules, and awarding, funding or releasing payment always needs a person to sign with their wallet.",
  },
  {
    id: "faq-chain",
    q: "What information is stored on-chain?",
    a: "Public on NEAR testnet: policy and terms hashes, salted invite leaves, salted bid commitments, bidder wallet ids, versions and times, the award recipient and amount, agreement and delivery-evidence hashes, statuses and transfers. Never on chain: quote text, prices, files, names or e-mail addresses. Bidding is not anonymous — anyone can see which wallets committed bids and when.",
  },
  {
    id: "faq-confidential",
    q: "What does confidential inference mean?",
    a: "AI notes run on a NEAR AI Cloud model inside a trusted execution environment. Before any quote is sent, VeilProcure checks fresh Intel TDX and NVIDIA GPU attestation bound to a one-time number; after the reply, it checks the response signature against that attested key. This shows where the inference ran — not that the notes are correct. If any check fails, nothing is sent and nothing is shown.",
  },
  {
    id: "faq-money",
    q: "Are payments real money?",
    a: "No. VeilProcure is a public beta on NEAR testnet, and escrow uses testnet NEAR, which has no monetary value. The escrow contract has not been professionally audited, so settlement is not legally or economically binding.",
  },
  {
    id: "faq-failure",
    q: "What happens when a payment fails?",
    a: "The contract keeps the funds in escrow and records the failed transfer; the award shows “Payout failed” or “Refund failed”, and either party can retry it. Escrowed funds can only ever go to the awarded supplier or back to the buyer — there is no admin withdrawal.",
  },
];

export default function Home() {
  return (
    <div className="site" id="top">
      <MotionBoot />
      <SiteMotion />
      <SiteHeader />
      <main id="main">
        {/* ------------------------------------------------------------- 01 hero */}
        <section className="vp-hero" aria-labelledby="hero-title">
          <div className="vp-container vp-hero-grid">
            <div>
              <p className="vp-overline vp-in" style={d(0)}>
                <span className="size-1.5 rounded-full bg-vp-mint" aria-hidden />
                Confidential procurement, reimagined
              </p>
              <h1 id="hero-title" className="vp-h1 mt-6">
                <span className="vp-line" style={d(60)}>
                  Better sourcing.
                </span>
                <span className="vp-line vp-hl" style={d(160)}>
                  <span className="vp-underline">Less exposure.</span>
                </span>
              </h1>
              <p className="vp-lead vp-in mt-7" style={d(280)}>
                Collect sealed supplier quotations, make explainable purchasing decisions with verified private AI, and keep every payment under your control.
              </p>
              <div className="vp-in mt-9 flex flex-wrap gap-3" style={d(380)}>
                <a href={START_HREF} className="vp-btn vp-btn-primary">
                  Create a procurement request <ArrowRight className="size-4" aria-hidden />
                </a>
                <a href="#how-it-works" className="vp-btn vp-btn-secondary">
                  See how it works
                </a>
              </div>
              <ul className="vp-in mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-vp-muted" style={d(480)}>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-vp-evergreen" aria-hidden /> Built on NEAR testnet
                </li>
                <li className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-vp-evergreen" aria-hidden /> Private AI notes verified by attestation
                </li>
              </ul>
              <p className="vp-in mt-3 text-[13px] text-vp-muted" style={d(520)}>
                Public beta on NEAR testnet · test tokens have no monetary value.
              </p>
            </div>
            <div className="pb-8 lg:pb-0">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- 02 problem */}
        <section id="problem" className="vp-problem bg-white" aria-labelledby="problem-title">
          <div className="vp-container relative py-24">
            <Overline n="01">The problem</Overline>
            <h2 id="problem-title" className="vp-statement mt-8" data-reveal-group>
              <Words text="Comparing suppliers shouldn't mean" />
              <span className="vp-hl">
                <Words text="exposing your process." start={300} />
              </span>
            </h2>
            <div className="mt-12 flex flex-wrap justify-center gap-3 md:mt-0" aria-label="What goes wrong today">
              <span className="vp-ghost md:left-[6%] md:top-[18%]" data-reveal style={d(200)}>
                Leaked quotes
              </span>
              <span className="vp-ghost md:right-[5%] md:top-[44%]" data-reveal style={d(380)}>
                Unclear criteria
              </span>
              <span className="vp-ghost md:bottom-[5%] md:left-[9%]" data-reveal style={d(560)}>
                Uncontrolled payments
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- 03 explainer */}
        <section id="sealed" className="vp-section" aria-labelledby="sealed-title">
          <div className="vp-container vp-split">
            <div>
              <Overline n="02">Sealed by deadline</Overline>
              <h2 id="sealed-title" className="vp-h2 mt-6" data-reveal>
                Every offer counts. <span className="vp-hl">None is opened early.</span>
              </h2>
              <p className="vp-lead mt-6" data-reveal style={d(120)}>
                You publish the rules first. Suppliers then quote under seal, and no one — not even you — can open a quote until bidding closes on chain. After close, each quote is checked against the commitment its supplier signed.
              </p>
              <ul className="mt-8 grid gap-3" data-reveal style={d(200)}>
                {[
                  ["Quote contents and prices", "Encrypted in VeilProcure · never on chain"],
                  ["Bid commitments", "Salted hash on NEAR testnet"],
                  ["Who bid, and when", "Public on chain — bidding is not anonymous"],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className="vp-tick">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    <span>
                      <span className="font-bold text-vp-ink">{k}</span>
                      <span className="block text-[15px] text-vp-muted">{v}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <figure className="vp-panel p-6 sm:p-8" data-reveal="scale" data-observe aria-label="Illustration of a request's lifecycle">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="vp-seal-icon">
                    <ClipboardList className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-extrabold tracking-[-0.02em] text-vp-ink">Request for quotation</p>
                    <p className="text-[13px] text-vp-muted">Rules frozen at publish</p>
                  </div>
                </div>
                <span className="vp-chip vp-chip-mint">Policy anchored</span>
              </div>
              <div className="mt-7" data-observe>
                <div className="vp-segs" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="vp-seg">
                      <span style={d(150 + i * 220)} />
                    </span>
                  ))}
                </div>
                <ol className="mt-3 grid grid-cols-4 text-[9.5px] font-bold uppercase tracking-[0.02em] text-vp-muted sm:text-[11px] sm:tracking-[0.08em]">
                  <li>Draft</li>
                  <li>Published</li>
                  <li>Bidding</li>
                  <li>Closed</li>
                </ol>
              </div>
              <dl className="mt-7 divide-y divide-vp-border rounded-2xl border border-vp-border text-[14px]">
                {[
                  ["Scope and deliverables", "Encrypted"],
                  ["Hard requirements", "Checked by rule"],
                  ["Scoring weights", "Published"],
                  ["Bid deadline", "Enforced by chain time"],
                  ["Invited suppliers", "Salted leaves on chain"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-vp-muted">{k}</dt>
                    <dd className="font-semibold text-vp-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <figcaption className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-vp-muted">Illustration</figcaption>
            </figure>
          </div>
        </section>

        {/* ------------------------------------------------------------- 04 bids */}
        <section id="bids" className="vp-section bg-white" aria-labelledby="bids-title">
          <div className="vp-container">
            <div className="max-w-3xl">
              <Overline n="03">Competitive bids, no leaks</Overline>
              <h2 id="bids-title" className="vp-h2 mt-6" data-reveal>
                Real competition. <span className="vp-hl">No early peeking.</span>
              </h2>
              <p className="vp-lead mt-6" data-reveal style={d(120)}>
                Competitors never see each other&apos;s quotes, and the buyer sees only how many sealed bids exist until the deadline passes. Sealed means application access controls and encryption, backed by a public on-chain commitment that proves no quote changed.
              </p>
            </div>
            <div className="mt-12" data-reveal style={d(180)}>
              <BidInbox />
            </div>
            <p className="mt-6">
              <a href="#faq-quotes" className="vp-link">
                See bid privacy safeguards
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------- 05 AI */}
        <section id="ai" className="vp-section" aria-labelledby="ai-title">
          <div className="vp-container">
            <div className="mx-auto max-w-3xl text-center">
              <Overline n="04">Confidential AI evaluation</Overline>
              <h2 id="ai-title" className="vp-h2 mt-6" data-reveal>
                Verified private AI. <span className="vp-hl">Human decisions.</span>
              </h2>
              <p className="vp-lead mx-auto mt-6" data-reveal style={d(120)}>
                AI reads the eligible quotes and explains what it noticed, with the source field for every point. It runs only on an attested NEAR AI Cloud model, and it can never award, approve or release money.
              </p>
            </div>
            <div className="vp-flow mt-16" data-observe>
              <div className="vp-node" data-reveal style={d(0)}>
                <span className="vp-seal-icon">
                  <Lock className="size-4" aria-hidden />
                </span>
                <h3 className="vp-h3 mt-4">Sealed offers</h3>
                <p className="vp-small mt-2">Only committed quotes, opened after the on-chain deadline and labelled Q1, Q2… for the model.</p>
              </div>
              <svg className="vp-wire" viewBox="0 0 72 24" aria-hidden>
                <path d="M0 12 H72" stroke="var(--color-vp-mint-sage)" strokeWidth="2" />
                <path className="vp-flowline" d="M0 12 H72" stroke="var(--color-vp-evergreen)" strokeWidth="2" strokeDasharray="6 8" />
              </svg>
              <div className="vp-node text-center" data-reveal style={d(160)}>
                <div className="vp-core" aria-hidden>
                  <Cpu className="size-9" />
                </div>
                <h3 className="vp-h3 mt-4">Verified AI</h3>
                <p className="vp-small mt-2">Intel TDX and NVIDIA attestation are checked with a fresh nonce before anything is sent; the reply&apos;s signature is checked after.</p>
              </div>
              <svg className="vp-wire" viewBox="0 0 72 24" aria-hidden>
                <path d="M0 12 H72" stroke="var(--color-vp-mint-sage)" strokeWidth="2" />
                <path className="vp-flowline" d="M0 12 H72" stroke="var(--color-vp-evergreen)" strokeWidth="2" strokeDasharray="6 8" />
              </svg>
              <div className="vp-node" data-reveal style={d(320)}>
                <span className="vp-seal-icon">
                  <UserCheck className="size-4" aria-hidden />
                </span>
                <h3 className="vp-h3 mt-4">Human approval</h3>
                <p className="vp-small mt-2">Notes are advisory and never change eligibility or scores. You compare, award and sign.</p>
              </div>
            </div>
            <p className="vp-small mx-auto mt-10 max-w-2xl text-center">
              If any attestation or signature check fails, no quote is sent and no notes are shown — never an unverified answer labelled as verified.{" "}
              <a href={AI_DOC} className="vp-link" target="_blank" rel="noopener noreferrer">
                How verification works<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------- 06 evidence */}
        <section id="evidence" className="vp-section bg-white" aria-labelledby="evidence-title">
          <div className="vp-container">
            <div className="max-w-3xl">
              <Overline n="05">Evidence by design</Overline>
              <h2 id="evidence-title" className="vp-h2 mt-6" data-reveal>
                Every decision <span className="vp-hl">leaves a trail.</span>
              </h2>
            </div>
            <ul className="vp-evidence mt-14">
              {EVIDENCE.map((e, i) => (
                <li key={e.field} className="vp-ecard" data-reveal style={d(i * 120)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="vp-seal-icon">
                      <e.icon className="size-4" aria-hidden />
                    </span>
                    <span className="vp-chip vp-chip-mint">{e.chip}</span>
                  </div>
                  <p className="vp-field mt-6">Field</p>
                  <h3 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-vp-ink">{e.field}</h3>
                  <hr className="my-4 border-vp-border" />
                  <p className="text-[15px] leading-relaxed text-vp-body">{e.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- 07 dark band */}
        <section id="authorize" className="py-6 sm:px-4 lg:px-6" aria-labelledby="authorize-title">
          <div className="vp-night">
            <div className="vp-container vp-section">
              <div className="max-w-3xl">
                <Overline n="06">Control</Overline>
                <h2 id="authorize-title" className="vp-h2 mt-6" data-reveal>
                  AI can recommend.
                  <br />
                  <span className="text-vp-mint">Only you authorize.</span>
                </h2>
              </div>
              <div className="relative mt-16" data-observe>
                <span className="vp-sweep" aria-hidden />
                <ul className="grid gap-5 pt-8 md:grid-cols-3">
                  {MODULES.map((m, i) => (
                    <li key={m.title} className="vp-module" data-reveal style={d(i * 140)}>
                      <span className="grid size-10 place-items-center rounded-xl bg-vp-mint/10 text-vp-mint">
                        <m.icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="mt-5 text-xl font-extrabold tracking-[-0.03em]">{m.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed">{m.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- 08 roles */}
        <section className="vp-section" aria-labelledby="roles-title">
          <div className="vp-container">
            <div className="max-w-3xl">
              <Overline n="07">Built for both sides</Overline>
              <h2 id="roles-title" className="vp-h2 mt-6" data-reveal>
                Built for buyers <span className="vp-hl">and suppliers.</span>
              </h2>
            </div>
            <div className="mt-14 grid gap-6 lg:grid-cols-2">
              {[
                {
                  id: "buyers",
                  icon: ClipboardList,
                  title: "For buyers",
                  lead: "Run a fair, documented competition without exposing your process.",
                  points: [
                    "Publish scope, hard requirements and scoring weights before any bid arrives",
                    "Invite suppliers by e-mail; they quote under seal",
                    "Compare verified quotes ranked by your own rules, with optional AI notes",
                    "Award, fund escrow and release payment from your NEAR testnet wallet",
                  ],
                  primary: { href: "#how-it-works", label: "Explore buyer workflow" },
                  secondary: { href: START_HREF, label: "Start a request" },
                },
                {
                  id: "suppliers",
                  icon: Store,
                  title: "For suppliers",
                  lead: "Quote once, under seal, and get paid through escrow you can verify.",
                  points: [
                    "Join through the invitation sent to your work e-mail",
                    "Your quote is encrypted, and your wallet commits its hash before the deadline",
                    "Competitors never see your price; the buyer sees it only after close",
                    "Accept the award, anchor delivery evidence and receive payment on chain",
                  ],
                  primary: { href: "#bids", label: "Explore supplier workflow" },
                  secondary: { href: "/signin", label: "I was invited to quote" },
                },
              ].map((r, i) => (
                <article key={r.id} id={r.id} className="vp-role" data-reveal style={d(i * 140)} aria-labelledby={`${r.id}-title`}>
                  <div className="vp-role-art" aria-hidden>
                    <div className="flex items-end gap-3">
                      <span className="grid size-16 place-items-center rounded-2xl bg-white shadow-[0_20px_40px_-20px_rgb(13_32_28/0.4)]">
                        <r.icon className="size-7 text-vp-evergreen" />
                      </span>
                      <span className="grid size-11 place-items-center rounded-xl bg-vp-night text-vp-mint">
                        {i === 0 ? <Layers className="size-5" /> : <FileLock2 className="size-5" />}
                      </span>
                      <span className="grid size-9 place-items-center rounded-lg bg-white text-vp-evergreen shadow-sm">
                        {i === 0 ? <Wallet className="size-4" /> : <Receipt className="size-4" />}
                      </span>
                    </div>
                  </div>
                  <h3 id={`${r.id}-title`} className="vp-h3">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-[16px] text-vp-body">{r.lead}</p>
                  <ul className="mt-6 grid gap-3 text-[15px]">
                    {r.points.map((p) => (
                      <li key={p} className="flex gap-3">
                        <span className="vp-tick">
                          <Check className="size-3.5" aria-hidden />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 flex flex-wrap gap-3 pt-2 lg:mt-auto">
                    <a href={r.primary.href} className="vp-btn vp-btn-primary">
                      {r.primary.label} <ArrowRight className="size-4" aria-hidden />
                    </a>
                    <a href={r.secondary.href} className="vp-btn vp-btn-secondary">
                      {r.secondary.label}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- 09 journey */}
        <section id="journey" className="vp-section bg-white" aria-labelledby="journey-title">
          <div className="vp-container">
            <div className="mx-auto max-w-3xl text-center">
              <Overline n="08">Inside the workspace</Overline>
              <h2 id="journey-title" className="vp-h2 mt-6" data-reveal>
                From request to receipt, <span className="vp-hl">in one place.</span>
              </h2>
            </div>
            <figure className="vp-journey mt-16" aria-label="Illustration of the VeilProcure workspace">
              <div className="vp-window" data-reveal="scale">
                <div className="vp-window-bar" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <span className="ml-3 text-[12px] font-semibold text-vp-muted">VeilProcure workspace</span>
                </div>
                <div className="grid min-h-[360px] grid-cols-[160px_1fr] max-sm:grid-cols-1">
                  <ul className="border-r border-vp-border bg-vp-canvas p-4 text-[13px] font-semibold text-vp-muted max-sm:hidden" aria-hidden>
                    {["Overview", "Requests", "Transactions", "Audit trail", "Wallet"].map((n, i) => (
                      <li key={n} className={`rounded-lg px-3 py-2 ${i === 1 ? "bg-vp-night text-white" : ""}`}>
                        {n}
                      </li>
                    ))}
                  </ul>
                  <div className="p-5 sm:p-7" aria-hidden>
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-vp-evergreen">Comparison</p>
                    <p className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-vp-ink">Checked against chain</p>
                    <div className="mt-5 divide-y divide-vp-border rounded-2xl border border-vp-border">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                          <span className="size-8 rounded-full bg-vp-mint-soft" />
                          <span className="vp-bar vp-bar-strong w-28" />
                          <span className="vp-chip vp-chip-mint ml-auto">Commitment verified</span>
                          <span className="vp-chip vp-chip-ink">{i < 2 ? "Eligible" : "Rule not met"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-2">
                      <span className="vp-bar w-3/4" />
                      <span className="vp-bar w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:mt-0">
                {[
                  { icon: Lock, t: "Sealed bid", s: "Committed on chain", pos: "lg:-left-16 lg:top-[44%]", depth: "-26px" },
                  { icon: ListChecks, t: "Comparison", s: "Your rules, exact arithmetic", pos: "lg:-right-12 lg:-top-8", depth: "22px" },
                  { icon: Signature, t: "Approval", s: "Signed in your wallet", pos: "lg:-left-14 lg:bottom-10", depth: "18px" },
                  { icon: Receipt, t: "Receipt", s: "Explorer link per transaction", pos: "lg:-right-8 lg:bottom-6", depth: "-20px" },
                ].map((c) => (
                  <div key={c.t} className={`vp-orbit flex items-center gap-3 ${c.pos}`} data-parallax style={{ "--depth": c.depth } as React.CSSProperties}>
                    <span className="vp-seal-icon">
                      <c.icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[14px] font-extrabold text-vp-ink">{c.t}</span>
                      <span className="block text-[12.5px] text-vp-muted">{c.s}</span>
                    </span>
                  </div>
                ))}
              </div>
              <figcaption className="vp-small mt-10 text-center">Illustration of the workspace — not live data.</figcaption>
            </figure>
          </div>
        </section>

        {/* ------------------------------------------------------------- 10 steps */}
        <section id="how-it-works" className="vp-section" aria-labelledby="steps-title">
          <div className="vp-container">
            <Overline n="09">How it works</Overline>
            <h2 id="steps-title" className="vp-h2 mt-6" data-reveal>
              Four steps.
              <br />
              <span className="vp-hl">Then you decide.</span>
            </h2>
            <ol className="vp-steps mt-16" data-steps>
              {STEPS.map((s, i) => (
                <li key={s.title} className="vp-step" data-step data-active="false">
                  <span className="vp-step-dot" aria-hidden>
                    {i + 1}
                  </span>
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-vp-muted">Step {i + 1}</p>
                  <h3 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-vp-ink">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-vp-body">{s.body}</p>
                  <a href={s.href} className="vp-link mt-3 inline-block text-[14px]">
                    {s.cta}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------- 11 FAQ */}
        <section id="faq" className="vp-section bg-white" aria-labelledby="faq-title">
          <div className="vp-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Overline n="10">Security &amp; reality</Overline>
              <h2 id="faq-title" className="vp-h2 mt-6" data-reveal>
                Straight <span className="vp-hl">answers.</span>
              </h2>
              <p className="vp-lead mt-6">
                What is private, what is public, and what VeilProcure cannot promise yet. The full threat model is on the{" "}
                <a href="/security" className="vp-link">
                  security page
                </a>
                .
              </p>
            </div>
            <div className="vp-faq border-t border-vp-border">
              {FAQ.map((f) => (
                <details key={f.id} id={f.id}>
                  <summary>
                    {f.q}
                    <span className="vp-plus" aria-hidden>
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <div className="vp-answer text-vp-body">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- 12 closing */}
        <section className="vp-closing vp-section" aria-labelledby="closing-title">
          <div className="vp-container relative">
            <h2 id="closing-title" className="vp-statement !max-w-[18ch]" data-reveal-group>
              <Words text="Better procurement starts with" step={45} />
              <span className="vp-hl">
                <Words text="a private conversation." start={230} step={45} />
              </span>
            </h2>
            <div className="mt-12 flex flex-wrap justify-center gap-3" data-reveal style={d(200)}>
              <a href={START_HREF} className="vp-btn vp-btn-primary">
                Create a request <ArrowRight className="size-4" aria-hidden />
              </a>
              <a href="/signin" className="vp-btn vp-btn-secondary">
                Submit as supplier
              </a>
            </div>
            <p className="vp-small mt-5">Suppliers join through a buyer&apos;s invitation. Free public beta on NEAR testnet.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
      <BackToTop />
    </div>
  );
}
