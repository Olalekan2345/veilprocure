import { z } from "zod";
import { normalizeText } from "./canonical";
import { canonicalAmount, type Currency } from "./money";
import type { FrozenPolicy } from "./policy";

/** What a supplier types. Validated server-side; never trusted for organisation or RFQ ids. */
export const quoteInputSchema = z.object({
  totalPrice: z.string().trim().regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Use a plain number such as 1250 or 1250.50"),
  deliveryDays: z.number().int().min(1).max(3650),
  revisionsIncluded: z.number().int().min(0).max(100),
  scope: z.string().trim().min(20, "Describe your approach in at least 20 characters").max(20000),
  assumptions: z.string().trim().max(10000).default(""),
  warranty: z.string().trim().max(5000).default(""),
  requirementResponses: z
    .record(z.string(), z.object({ met: z.boolean(), note: z.string().trim().max(1000).default("") }))
    .default({}),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Canonical quote payload: the exact object whose canonical JSON enters the bid commitment. */
export interface NormalizedQuote {
  schemaVersion: 1;
  currency: Currency;
  totalPrice: string;
  deliveryDays: number;
  revisionsIncluded: number;
  scope: string;
  assumptions: string;
  warranty: string;
  requirementResponses: { id: string; met: boolean; note: string }[];
}

export function normalizeQuote(input: QuoteInput, policy: Pick<FrozenPolicy, "currency" | "criteria">): NormalizedQuote {
  const q = quoteInputSchema.parse(input);
  const known = new Set(policy.criteria.requirements.map((r) => r.id));
  for (const id of Object.keys(q.requirementResponses)) {
    if (!known.has(id)) throw new Error(`unknown requirement "${id}"`);
  }
  return {
    schemaVersion: 1,
    currency: policy.currency,
    totalPrice: canonicalAmount(q.totalPrice, policy.currency),
    deliveryDays: q.deliveryDays,
    revisionsIncluded: q.revisionsIncluded,
    scope: normalizeText(q.scope),
    assumptions: normalizeText(q.assumptions),
    warranty: normalizeText(q.warranty),
    // Ordered by the policy's requirement order so the encoding is stable.
    requirementResponses: policy.criteria.requirements.map((r) => {
      const resp = q.requirementResponses[r.id];
      return { id: r.id, met: resp?.met ?? false, note: normalizeText(resp?.note ?? "") };
    }),
  };
}
