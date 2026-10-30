import { PublicShell } from "@/components/public-chrome";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy notice" };

export default function Privacy() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-14 text-[15px] leading-relaxed text-ink-3 sm:px-6">
        <PageHeader eyebrow="Privacy" title="Privacy notice" description="What we store, why, and for how long." />
        <section>
          <h2 className="text-lg font-semibold text-ink">What we store off-chain</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Your e-mail address, display name, organisation memberships and bound wallet id.</li>
            <li>Requests, quotes, attachments, agreements and delivery notes — encrypted at rest with per-record keys.</li>
            <li>An append-only audit log of actions (who, what, when, transaction hash) without quote content.</li>
            <li>Session records (hashed tokens) and a truncated browser user-agent for security.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-ink">Sign-in provider</h2>
          <p className="mt-2">When this server uses Privy for sign-in, your e-mail address is sent to Privy so it can e-mail you a one-time code and confirm you own the address. VeilProcure receives only that confirmation and keeps its own session; Privy&apos;s tokens are not stored in your browser after sign-in.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-ink">What goes on chain (public, permanent)</h2>
          <p className="mt-2">Policy and terms hashes, invite-slot leaves, salted bid commitments, wallet account ids, award amounts, agreement and delivery-evidence hashes, statuses and transfers on NEAR testnet.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-ink">AI processing</h2>
          <p className="mt-2">If a buyer requests AI notes after bidding closes, committed quote text is sent only to an attested NEAR AI Cloud TEE model. If attestation cannot be verified, nothing is sent.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-ink">Retention</h2>
          <p className="mt-2">During the beta, off-chain records are kept while your account is active and deleted on request, except audit events needed to evidence on-chain transactions. Logs never contain quote text, tokens, keys or signed download links.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-ink">Contact</h2>
          <p className="mt-2">Use the support page for access, export or deletion requests.</p>
        </section>
      </article>
    </PublicShell>
  );
}
