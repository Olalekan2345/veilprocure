import { PublicShell } from "@/components/public-chrome";
import { Callout, PageHeader } from "@/components/ui";

export const metadata = { title: "Public beta terms" };

export default function Terms() {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl space-y-6 px-4 py-14 text-[15px] leading-relaxed text-ink-3 sm:px-6">
        <PageHeader eyebrow="Public beta" title="Beta terms" description="Plain-language terms for using VeilProcure during its public testnet beta." />
        <Callout tone="warn" title="Blockchain payments are test transactions">
          All escrow, funding, release and refund operations use NEAR testnet tokens, which have no monetary value. Settlement through VeilProcure is economically non-binding. Agree real payment terms with your counterparty separately.
        </Callout>
        <ol className="list-decimal space-y-3 pl-5">
          <li>VeilProcure is provided as a beta, without warranties. Features may change or be unavailable.</li>
          <li>The escrow smart contract has not been professionally audited. VeilProcure provides no purchase protection, insurance or guarantee of recovery of any asset.</li>
          <li>You may submit real requests and real commercial quotations. Read the security page: quotes are protected by application controls and encryption, but are not private from all platform operators.</li>
          <li>Information written to NEAR (hashes, wallet ids, amounts, timestamps) is public and permanent and cannot be deleted by anyone.</li>
          <li>You are responsible for the accuracy of what you publish, quote and declare, including capability confirmations.</li>
          <li>AI notes are advisory recommendations, may be wrong, and never constitute a decision. Awards are made by people.</li>
          <li>Do not upload malware, unlawful content, or personal data you have no right to share.</li>
          <li>We may suspend accounts that abuse the service. You may stop using it at any time and request deletion of off-chain data.</li>
        </ol>
      </article>
    </PublicShell>
  );
}
