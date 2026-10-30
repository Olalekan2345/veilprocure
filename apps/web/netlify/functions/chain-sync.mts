/**
 * Hosted worker, part 1 (scheduled, every minute, ≤ 30 s): expires stale transaction intents and
 * projects NEAR testnet state into the database (chain is the source of truth). If AI jobs are
 * waiting — e.g. the direct trigger after a request failed — it wakes the AI runner.
 * Schedule: apps/web/netlify.toml. Bundled by scripts/bundle-functions.mjs.
 */
import { createDb } from "@veilprocure/db";
import { hasQueuedAiJobs, syncChain, workerConfigFromEnv } from "@veilprocure/worker/jobs";
import { triggerAiRunner } from "@veilprocure/worker/trigger";

export default async () => {
  const cfg = workerConfigFromEnv("netlify-chain-sync");
  const { db, close } = createDb(cfg.databaseUrl, { max: 2 });
  try {
    await syncChain(db, cfg);
    if (await hasQueuedAiJobs(db)) await triggerAiRunner();
  } finally {
    await close();
  }
};
