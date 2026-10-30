/**
 * Runs only step 1 of the AI evaluation (fresh-nonce attestation + full verification policy) for
 * a model and prints every check. Sends no quote content; makes no inference request.
 *   pnpm --filter @veilprocure/worker attest:check [model]
 */
import { randomBytes } from "node:crypto";
import { VERIFICATION_POLICY_VERSION } from "./attestation";
import { fetchAttestationReport, verifyAttestationReport } from "./evaluate";

const model = process.argv[2] ?? process.env.NEARAI_MODEL ?? "";
const apiKey = process.env.NEARAI_API_KEY ?? "";
const baseUrl = process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai";
if (!model || !apiKey) {
  console.error("usage: attest:check <model>   (NEARAI_API_KEY must be set in apps/worker/.env)");
  process.exit(2);
}

const nonceHex = randomBytes(32).toString("hex");
const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "x-no-aliasing": "true" };
console.log(`model ${model} · policy ${VERIFICATION_POLICY_VERSION} · nonce ${nonceHex}`);
const report = await fetchAttestationReport(baseUrl, headers, model, nonceHex);
console.log(`model attestation candidates: ${report.model_attestations?.length ?? 0}`);
const { checks, gateway, models } = await verifyAttestationReport(report, nonceHex);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
console.log(`gateway signer: ${gateway ? `${gateway.signingAddress} (TCB ${gateway.tcbStatus})` : "not verified"}`);
for (const m of models) console.log(`verified model signer: ${m.signingAddress} · TCB ${m.tcbStatus} · ${m.gpuVerdict} · quote sha256 ${m.quoteSha256}`);
console.log(models.length ? `RESULT: ${models.length} model signer(s) verified` : "RESULT: no model signer verified — evaluations with this model would fail closed");
process.exit(models.length ? 0 : 1);
