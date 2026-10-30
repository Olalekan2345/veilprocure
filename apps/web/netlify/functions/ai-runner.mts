/**
 * Hosted worker, part 2 (background, ≤ 15 min): drains queued confidential AI evaluation jobs with
 * the same fail-closed attestation flow as the long-running worker. Invoked with a shared secret
 * by the web app after a request and by chain-sync as a fallback; Netlify answers 202 at once.
 * Background mode: apps/web/netlify.toml. Bundled by scripts/bundle-functions.mjs.
 */
import { createDb } from "@veilprocure/db";
import { drainAiJobs, workerConfigFromEnv } from "@veilprocure/worker/jobs";
import { isValidTrigger, TRIGGER_HEADER } from "@veilprocure/worker/trigger";

export default async (req: Request) => {
  if (req.method !== "POST" || !isValidTrigger(req.headers.get(TRIGGER_HEADER))) return;
  const cfg = workerConfigFromEnv("netlify-ai-runner");
  const { db, close } = createDb(cfg.databaseUrl, { max: 2 });
  try {
    await drainAiJobs(db, cfg, Date.now() + 13 * 60_000);
  } finally {
    await close();
  }
};
