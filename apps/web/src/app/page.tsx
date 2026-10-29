import { ArrowRight, FileLock2, Landmark, ListChecks, ScanEye, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { PublicShell } from "@/components/public-chrome";
import { ButtonLink, Callout } from "@/components/ui";

const STEPS = [
  {
    icon: ListChecks,
    title: "Publish your rules first",
    body: "Write the scope, hard requirements, price ceiling, schedule and scoring weights. Publishing freezes them and anchors a hash of the policy on NEAR testnet, signed by your wallet. Criteria cannot change silently afterwards.",
  },
  {
    icon: FileLock2,
    title: "Suppliers quote under seal",
    body: "Invited suppliers submit encrypted quotes. Each supplier's wallet commits a salted SHA-256 of the exact quote on chain before the deadline. You cannot open any quote until bidding closes on chain.",
  },
  {
    icon: ScanEye,
    title: "Compare under the published rules",
    body: "After close, every quote is checked against its on-chain commitment, then against your hard requirements with exact arithmetic. Optional AI notes run on NEAR AI Cloud and are shown as verified only when attestation checks pass.",
  },
  {
    icon: Landmark,
    title: "Pay through escrow you control",
    body: "You award and fund the agreed amount in testnet NEAR. The supplier accepts and anchors delivery evidence; you release payment. The contract pays only the selected supplier and has no admin withdrawal.",
  },
];

const DISCLOSURE: [string, string, string][] = [
  ["Quote contents, prices, attachments", "Encrypted in VeilProcure; visible to the supplier, and to the buyer only after the on-chain deadline", "Never"],
  ["RFQ scope and criteria", "Encrypted; visible to the buyer organisation and accepted invitees", "Only a salted hash"],
  ["Bid commitments", "Stored with the quote for later verification", "Salted SHA-256, supplier wallet, version, time"],
  ["Award and escrow", "Agreement text encrypted; amount shown to both parties", "Supplier wallet, amount, status, transfers"],
  ["Wallet participation", "Bound to your VeilProcure account", "Public: anyone can see which wallets bid"],
];

export default function Home() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_0%,rgba(168,132,74,0.12),transparent_70%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-16 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:pt-24">
          <div className="fade-up">
            <p className="eyebrow mb-4">Confidential procurement · NEAR testnet beta</p>
            <h1 className="display text-[2.9rem] leading-[1.02] text-ink sm:text-[4.1rem]">
              Private bids.
              <br />
              Intelligent decisions.
              <br />
              <span className="text-gold-ink">Payments you control.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
              VeilProcure helps small agencies and technology teams buy fixed-scope digital services: design, QA, security reviews, documentation and software. Suppliers quote under seal, you compare them under rules you published in advance, and payment moves through escrow that only you release.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signin?next=/app/onboarding" size="lg">
                Start a request <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/signin" variant="secondary" size="lg">
                I was invited to quote
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-faint">Free public beta. Sign in with your e-mail; connect a NEAR testnet wallet when you are ready to sign.</p>
          </div>

          <figure className="fade-up card self-center p-5 [animation-delay:120ms]" aria-label="How a sealed bid is anchored">
            <figcaption className="eyebrow mb-4">How a bid is sealed</figcaption>
            <ol className="space-y-3 text-sm">
              <li className="rounded-xl border border-line bg-paper px-4 py-3">
                <p className="font-medium text-ink">Supplier writes the quote</p>
                <p className="mt-0.5 text-muted">Price, schedule, scope, terms and files. Encrypted at rest.</p>
              </li>
              <li className="rounded-xl border border-line bg-paper px-4 py-3">
                <p className="font-medium text-ink">A private 256-bit salt is added</p>
                <p className="hash mt-1 text-ink-3">sha256(domain ‖ rfq ‖ wallet ‖ version ‖ quote ‖ files ‖ salt)</p>
              </li>
              <li className="rounded-xl border border-verify/25 bg-verify-soft px-4 py-3">
                <p className="flex items-center gap-1.5 font-medium text-verify">
                  <ShieldCheck className="size-4" aria-hidden /> Supplier wallet commits the hash on NEAR
                </p>
                <p className="mt-0.5 text-verify/80">Before the deadline. After close, anyone can check the quote was not changed.</p>
              </li>
            </ol>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Callout tone="warn" title="Public beta on NEAR testnet">
          Escrow and payouts use NEAR testnet tokens, which have no monetary value. Settlement is economically non-binding. Quotes you submit are real business information, so read{" "}
          <Link href="/security">what is and is not private</Link> before you use it.
        </Callout>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6">
        <p className="eyebrow mb-3">How it works</p>
        <h2 className="display max-w-2xl text-4xl leading-tight text-ink">One request, four accountable steps.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gold-soft text-gold-ink">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-semibold tabular-nums text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <p className="eyebrow mb-3">Disclosure map</p>
        <h2 className="display max-w-2xl text-4xl leading-tight text-ink">What stays private, and what the chain shows.</h2>
        <div className="card mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wider text-faint">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Information
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  In VeilProcure
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  On NEAR testnet (public)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {DISCLOSURE.map(([a, b, c]) => (
                <tr key={a}>
                  <th scope="row" className="px-5 py-3.5 font-medium text-ink">
                    {a}
                  </th>
                  <td className="px-5 py-3.5 text-muted">{b}</td>
                  <td className="px-5 py-3.5 text-muted">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
        <div className="card grid gap-8 p-8 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow mb-3">Honest limits</p>
            <h2 className="display text-3xl leading-tight text-ink">Deadline-sealed with audited access controls.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              That is the exact claim. Quotes are not mathematically unreadable before the deadline: our servers can decrypt them, so a privileged operator could technically access them. Every access path is checked by organisation and deadline, and enforced again by row-level security in the database.
            </p>
          </div>
          <ul className="space-y-3 text-[15px] text-muted">
            <li className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
              AI notes are advisory. Hard eligibility is computed by deterministic code, and an AI response is labelled verified only when its TEE attestation and signature checks pass.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
              The escrow contract has not been professionally audited. It is suitable for testnet use only.
            </li>
            <li className="flex gap-3">
              <ScanEye className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
              Bidding is not anonymous: wallet participation and commitment times are public on chain.
            </li>
          </ul>
        </div>
      </section>
    </PublicShell>
  );
}
