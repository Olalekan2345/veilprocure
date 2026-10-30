/**
 * Long-running VeilProcure worker for self-hosting and local development; `--once` runs a single
 * cycle. Hosted deployments run the same cycle (jobs.ts) as scheduled and background functions.
 */
import { createDb } from "@veilprocure/db";
import { tick, workerConfigFromEnv, type WorkerConfig } from "./jobs";

let cfg: WorkerConfig;
try {
  cfg = workerConfigFromEnv(`worker-${process.pid}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
const { db, close } = createDb(cfg.databaseUrl, { max: 4 });
if (process.argv.includes("--once")) {
  await tick(db, cfg);
  await close();
} else {
  console.log(`[worker] started (${cfg.workerId}); contract ${cfg.contractId || "not configured"}; AI ${cfg.nearai.apiKey ? "configured" : "NOT configured (jobs will be blocked)"}`);
  for (;;) {
    await tick(db, cfg).catch((e: unknown) => console.error("[worker] tick failed:", e instanceof Error ? e.message : e));
    await new Promise((r) => setTimeout(r, 15_000));
  }
}
