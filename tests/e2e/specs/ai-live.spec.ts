/**
 * Live confidential AI evaluation against NEAR AI Cloud (opt-in: VEIL_AI_LIVE=1). Needs
 * NEARAI_API_KEY and NEARAI_MODEL in apps/worker/.env, and a closed request with committed quotes
 * from the on-chain journey (chain.spec.ts). Sends that journey's test quotes to the attested model,
 * runs the real worker once, and records the evidence to .local/ai-live.json.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { signIn, sql } from "./helpers";

const root = resolve(import.meta.dirname, "../../..");
const workerEnvFile = resolve(root, "apps/worker/.env");
const workerEnv = existsSync(workerEnvFile) ? readFileSync(workerEnvFile, "utf8") : "";
const configured = /^NEARAI_API_KEY=\S+/m.test(workerEnv) && /^NEARAI_MODEL=\S+/m.test(workerEnv);

test.skip(process.env.VEIL_AI_LIVE !== "1", "live AI test is opt-in (VEIL_AI_LIVE=1); it spends NEAR AI Cloud credits");
test.skip(!configured, "NEARAI_API_KEY and NEARAI_MODEL must be set in apps/worker/.env");

test("buyer receives attested AI notes, verified end to end", async ({ page }) => {
  test.setTimeout(360_000);
  const [target] = await sql<{ id: string; email: string }[]>`
    select r.id, u.email from rfqs r join users u on u.id = r.created_by
    where r.status in ('closed', 'awarded', 'settled') and u.email like 'test-e2e-chain-buyer-%'
      and (select count(*) from quote_revisions q where q.rfq_id = r.id and q.status = 'committed') >= 2
    order by r.created_at desc limit 1`;
  test.skip(!target, "no closed journey request with committed quotes; run chain.spec.ts first");

  await signIn(page, target!.email);
  await page.goto(`/app/rfqs/${target!.id}/compare`);
  await page.getByRole("button", { name: /^(Request AI notes|Request again)$/ }).click();
  await expect(page.getByText("Queued for the evaluation worker.")).toBeVisible();

  execSync("pnpm --filter @veilprocure/worker once", { cwd: root, stdio: "inherit", timeout: 300_000 });

  const [job] = await sql`
    select j.id, j.status, j.error_code, j.error_message, e.verified, e.model_id, e.signature_kind, e.signing_address,
           e.request_sha256, e.response_sha256, e.gateway_quote_sha256, e.model_quote_sha256, e.tcb_status, e.gpu_verdict, e.failure_reasons
    from evaluation_jobs j left join attestation_evidence e on e.evaluation_job_id = j.id
    where j.rfq_id = ${target!.id} and j.kind = 'ai' order by j.created_at desc limit 1`;
  writeFileSync(resolve(root, ".local/ai-live.json"), JSON.stringify({ at: new Date().toISOString(), rfqId: target!.id, job }, null, 2));
  expect(job!.status, `${job!.error_code}: ${job!.error_message}`).toBe("succeeded");
  expect(job!.verified).toBe(true);

  await page.reload();
  await expect(page.getByText("AI notes · recommendation only").first()).toBeVisible();
  await page.screenshot({ path: resolve(root, ".local/ai-notes.png"), fullPage: true });
  await page.goto(`/app/rfqs/${target!.id}/ai-evidence`);
  await expect(page.getByText(/VERIFIED under policy vp-nearai-1/)).toBeVisible();
  await page.screenshot({ path: resolve(root, ".local/ai-evidence.png"), fullPage: true });
});
