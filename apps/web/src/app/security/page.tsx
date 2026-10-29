import { PublicShell } from "@/components/public-chrome";
import { Callout, PageHeader } from "@/components/ui";

export const metadata = { title: "Security & trust boundary" };

const ROWS: [string, string, string][] = [
  ["Another supplier", "Organisation checks on every request, plus database row-level security: a supplier org can only ever select its own quote rows.", "Cannot read competitors' quotes, before or after the deadline."],
  ["The buyer, before the deadline", "Quote rows are invisible to the buyer org until the contract reports bidding closed; the database enforces the same rule.", "Sees only that a wallet committed a hash, its version and time."],
  ["VeilProcure operators", "Envelope encryption at rest, least-privilege database roles, append-only audit log.", "Not cryptographically blind: the server holds the keys and could technically decrypt. We say so plainly."],
  ["Chain observers", "Only salted hashes, wallet ids, amounts and statuses go on chain.", "Can see who bid (wallets), when, and escrow amounts. Bidding is not anonymous."],
  ["The AI provider", "Inference only on NEAR AI Cloud TEE models; attestation and response signature verified before any note is shown.", "Attestation shows where inference ran. It does not prove the notes are correct or unbiased."],
  ["A malicious proposal", "Quote text is treated as data: fixed system prompt, schema-constrained output, no tools, no authority over payments or rules.", "Model errors are possible; AI notes are advisory and never change eligibility."],
  ["A malicious caller", "Wallet signatures, server-prepared transactions, contract state machine with no admin withdrawal.", "The contract is unaudited. Testnet only."],
];

export default function SecurityPage() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <PageHeader eyebrow="Security & privacy" title="What we protect, and what we can't." description="VeilProcure's claim is precise: supplier quotes are deadline-sealed with audited access controls. This page explains exactly what that means." />
        <div className="space-y-10 text-[15px] leading-relaxed text-ink-3">
          <Callout tone="warn" title="Testnet beta">
            Escrow and payouts run on NEAR testnet with tokens of no monetary value. The smart contract has not been professionally audited. Do not treat settlement as legally or economically binding.
          </Callout>
          <section>
            <h2 className="display text-3xl text-ink">Trust boundary</h2>
            <div className="card mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-line bg-sunken/60 text-xs uppercase tracking-wider text-faint">
                  <tr>
                    <th scope="col" className="px-4 py-3">Who</th>
                    <th scope="col" className="px-4 py-3">Control</th>
                    <th scope="col" className="px-4 py-3">What remains possible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ROWS.map(([a, b, c]) => (
                    <tr key={a}>
                      <th scope="row" className="px-4 py-3 align-top font-medium text-ink">{a}</th>
                      <td className="px-4 py-3 align-top">{b}</td>
                      <td className="px-4 py-3 align-top">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="display text-3xl text-ink">How a bid commitment works</h2>
            <p className="mt-3">
              When a supplier commits, VeilProcure builds a canonical, versioned byte encoding of the network, contract, RFQ id, supplier wallet, version, the exact normalised quote, the SHA-256 of every attachment, and a fresh 256-bit random salt. Its SHA-256 is signed onto NEAR by the supplier&apos;s own wallet before the deadline. The salt stays private, so the public hash cannot be brute-forced from a small set of likely prices. After close, VeilProcure recomputes each hash from the stored quote and salt and compares it with the chain — on every view. A changed quote fails the check and becomes ineligible.
            </p>
          </section>
          <section>
            <h2 className="display text-3xl text-ink">What this is not</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>Not fully homomorphic encryption or zero-knowledge sealed bidding. A TEE is neither.</li>
              <li>Not anonymous procurement: participating wallets are public on chain.</li>
              <li>Not a guarantee of fair or optimal purchasing: verification proves integrity and consistent rule application, not commercial judgement.</li>
              <li>NEAR AI Cloud does not make NEAR blockchain transactions private.</li>
            </ul>
          </section>
          <section>
            <h2 className="display text-3xl text-ink">Files</h2>
            <p className="mt-3">
              Attachments are limited to PDF, PNG, JPEG and plain text up to 10 MB, identified by content rather than by the browser&apos;s claim, encrypted before storage, never rendered inline, and downloaded only through short-lived signed links re-authorised at request time. Files are not malware-scanned in this beta; they are quarantined by policy and labelled as unscanned.
            </p>
          </section>
          <section>
            <h2 className="display text-3xl text-ink">Reporting a vulnerability</h2>
            <p className="mt-3">Please use the support form with the subject &ldquo;Security&rdquo;. Do not include exploit details for live user data in public channels.</p>
          </section>
        </div>
      </article>
    </PublicShell>
  );
}
