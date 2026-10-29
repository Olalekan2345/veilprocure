import { CURRENCY_DECIMALS, formatMoney, parseDecimal } from "./money";
import type { FrozenPolicy } from "./policy";
import type { NormalizedQuote } from "./quote";

/**
 * Deterministic evaluation of published, immutable criteria. Runs before (and independently of)
 * any AI assessment: an ineligible quote stays ineligible whatever a model says about it.
 */

export type Basis = "exact_comparison" | "supplier_declaration";

export interface CriterionResult {
  criterionId: string;
  label: string;
  outcome: "pass" | "fail";
  basis: Basis;
  expected: string;
  actual: string;
  /** Where in the quote the evidence lives, for traceability in the comparison view. */
  sourceField: string;
}

export interface QuoteEvaluation {
  quoteRef: string;
  eligible: boolean;
  results: CriterionResult[];
}

export const EVALUATION_ENGINE_VERSION = "det-1";

export function evaluateHardCriteria(
  policy: Pick<FrozenPolicy, "currency" | "criteria">,
  quoteRef: string,
  quote: NormalizedQuote,
): QuoteEvaluation {
  const results: CriterionResult[] = [];
  const { criteria, currency } = policy;
  const decimals = CURRENCY_DECIMALS[currency];

  results.push({
    criterionId: "currency",
    label: "Quoted in the RFQ currency",
    outcome: quote.currency === currency ? "pass" : "fail",
    basis: "exact_comparison",
    expected: currency,
    actual: quote.currency,
    sourceField: "quote.currency",
  });

  if (criteria.maxPrice !== null) {
    const max = parseDecimal(criteria.maxPrice, decimals);
    const price = parseDecimal(quote.totalPrice, decimals);
    results.push({
      criterionId: "max-price",
      label: "Total price within the published maximum",
      outcome: price <= max ? "pass" : "fail",
      basis: "exact_comparison",
      expected: `at most ${formatMoney(max, currency)}`,
      actual: formatMoney(price, currency),
      sourceField: "quote.totalPrice",
    });
  }

  if (criteria.maxDeliveryDays !== null) {
    results.push({
      criterionId: "max-delivery-days",
      label: "Delivery schedule within the published maximum",
      outcome: quote.deliveryDays <= criteria.maxDeliveryDays ? "pass" : "fail",
      basis: "exact_comparison",
      expected: `at most ${criteria.maxDeliveryDays} days`,
      actual: `${quote.deliveryDays} days`,
      sourceField: "quote.deliveryDays",
    });
  }

  if (criteria.minRevisions !== null) {
    results.push({
      criterionId: "min-revisions",
      label: "Includes the minimum number of revision rounds",
      outcome: quote.revisionsIncluded >= criteria.minRevisions ? "pass" : "fail",
      basis: "exact_comparison",
      expected: `at least ${criteria.minRevisions}`,
      actual: String(quote.revisionsIncluded),
      sourceField: "quote.revisionsIncluded",
    });
  }

  for (const req of criteria.requirements) {
    const resp = quote.requirementResponses.find((r) => r.id === req.id);
    results.push({
      criterionId: `req:${req.id}`,
      label: req.label,
      outcome: resp?.met ? "pass" : "fail",
      basis: "supplier_declaration",
      expected: "Confirmed by supplier",
      actual: resp?.met ? "Confirmed" : "Not confirmed",
      sourceField: `quote.requirementResponses.${req.id}`,
    });
  }

  return { quoteRef, eligible: results.every((r) => r.outcome === "pass"), results };
}

export interface ScoreComponents {
  price: number;
  delivery: number;
  revisions: number;
}

export interface ScoredQuote {
  quoteRef: string;
  /** 0–10000 basis points, integer, computed with bigint arithmetic (floor). */
  scoreBp: number;
  components: ScoreComponents;
}

const BP = 10_000n;

/**
 * Objective weighted score over eligible quotes only, relative to the best value in the field:
 * price = min/price, delivery = min/days, revisions = rev/max. Ties are broken by `quoteRef`
 * (stable and input-order independent) and the UI shows ties explicitly.
 */
export function scoreEligible(
  policy: Pick<FrozenPolicy, "currency" | "weights">,
  quotes: { quoteRef: string; quote: NormalizedQuote }[],
): ScoredQuote[] {
  if (quotes.length === 0) return [];
  const decimals = CURRENCY_DECIMALS[policy.currency];
  const prices = quotes.map((q) => parseDecimal(q.quote.totalPrice, decimals));
  const minPrice = prices.reduce((a, b) => (b < a ? b : a));
  const minDays = BigInt(Math.min(...quotes.map((q) => q.quote.deliveryDays)));
  const maxRev = BigInt(Math.max(...quotes.map((q) => q.quote.revisionsIncluded)));
  const w = policy.weights;

  const scored = quotes.map((q, i) => {
    const price = prices[i]!;
    const priceBp = price === 0n ? BP : (minPrice * BP) / price;
    const deliveryBp = (minDays * BP) / BigInt(q.quote.deliveryDays);
    const revBp = maxRev === 0n ? BP : (BigInt(q.quote.revisionsIncluded) * BP) / maxRev;
    const total = (BigInt(w.price) * priceBp + BigInt(w.delivery) * deliveryBp + BigInt(w.revisions) * revBp) / 100n;
    return {
      quoteRef: q.quoteRef,
      scoreBp: Number(total),
      components: { price: Number(priceBp), delivery: Number(deliveryBp), revisions: Number(revBp) },
    };
  });
  return scored.sort((a, b) => b.scoreBp - a.scoreBp || (a.quoteRef < b.quoteRef ? -1 : 1));
}

export function formatBp(bp: number): string {
  return (bp / 100).toFixed(2);
}
