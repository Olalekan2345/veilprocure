/**
 * Wakes the hosted AI runner (a background function) when a job is queued. A no-op when not
 * hosted (AI_RUNNER_URL unset): the long-running worker polls the queue instead. The runner only
 * drains jobs already queued by authorised users, and still requires the shared secret.
 */
import { timingSafeEqual } from "node:crypto";

export const TRIGGER_HEADER = "x-veil-trigger";

export async function triggerAiRunner(): Promise<void> {
  const url = process.env.AI_RUNNER_URL;
  const secret = process.env.WORKER_TRIGGER_SECRET;
  if (!url || !secret) return;
  await fetch(url, { method: "POST", headers: { [TRIGGER_HEADER]: secret }, signal: AbortSignal.timeout(5_000) }).catch((e: unknown) => {
    console.error("[ai-trigger] could not reach the AI runner:", e instanceof Error ? e.message : e);
  });
}

export function isValidTrigger(value: string | null): boolean {
  const secret = process.env.WORKER_TRIGGER_SECRET;
  if (!secret || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
