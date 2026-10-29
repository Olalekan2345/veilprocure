import Link from "next/link";
import { Badge, Callout, Card, CardHeader, Hash, KeyValue, PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { latestAiJob } from "@/server/services/evaluation";
import { loadBuyerRfq } from "@/server/services/rfq";

export const metadata = { title: "AI verification evidence" };

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export default async function AiEvidence({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorPage(`/app/rfqs/${id}/ai-evidence`);
  const rfq = await loadBuyerRfq(actor, id, "rfq:view");
  const ai = await latestAiJob(id);
  const ev = ai?.evidence;
  const checks = (ev?.checks ?? []) as Check[];
  return (
    <>
      <PageHeader
        eyebrow={rfq.title}
        title="AI verification evidence"
        description="The minimal, verifiable record kept for the latest AI evaluation: hashes, identities and check results — never the prompt or quote text."
        actions={<Link href={`/app/rfqs/${id}/compare`} className="text-sm text-muted underline">Back to comparison</Link>}
      />
      {!ev ? (
        <Callout tone="neutral">No AI evaluation evidence exists for this request yet.</Callout>
      ) : (
        <div className="space-y-6">
          <Callout tone={ev.verified ? "verify" : "bad"} title={ev.verified ? "VERIFIED under policy " + ev.verificationPolicyVersion : "UNVERIFIED"}>
            {ev.verified
              ? "Every required check passed. This shows where the inference ran and that the response bytes were signed by the attested key. It does not show the notes are correct."
              : `Failed: ${ev.failureReasons.join("; ") || "see checks below"}. No AI output from this run is shown anywhere.`}
          </Callout>
          <Card>
            <CardHeader title="Identity & bindings" />
            <div className="px-5 py-4 sm:px-6">
              <KeyValue
                items={[
                  ["Model", ev.modelId],
                  ["Client nonce", <Hash key="n" value={ev.nonceHex} />],
                  ["Signing algorithm", ev.signingAlgo ?? "—"],
                  ["Signing address", ev.signingAddress ? <Hash key="s" value={ev.signingAddress} /> : "—"],
                  ["Signature kind", ev.signatureKind ?? "—"],
                  ["Request SHA-256", ev.requestSha256 ? <Hash key="rq" value={ev.requestSha256} /> : "—"],
                  ["Response SHA-256", ev.responseSha256 ? <Hash key="rs" value={ev.responseSha256} /> : "—"],
                  ["Gateway quote SHA-256", ev.gatewayQuoteSha256 ? <Hash key="g" value={ev.gatewayQuoteSha256} /> : "—"],
                  ["Model quote SHA-256", ev.modelQuoteSha256 ? <Hash key="m" value={ev.modelQuoteSha256} /> : "—"],
                  ["TDX TCB status", ev.tcbStatus ?? "—"],
                  ["NVIDIA GPU verdict", ev.gpuVerdict ?? "—"],
                  ["Evidence fetched", ev.fetchedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Checks" description="Performed independently by the VeilProcure worker against NEAR AI Cloud's documented verification flow." />
            <ul className="divide-y divide-line text-sm">
              {checks.map((c) => (
                <li key={c.name} className="grid grid-cols-[auto_1fr] gap-3 px-5 py-3 sm:px-6">
                  <Badge tone={c.ok ? "ok" : "bad"}>{c.ok ? "pass" : "fail"}</Badge>
                  <div>
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
