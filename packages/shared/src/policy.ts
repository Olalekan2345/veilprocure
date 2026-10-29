import { z } from "zod";
import { concat, randomBytes, toHex, utf8 } from "./bytes";
import { canonicalJson, normalizeText } from "./canonical";
import { sha256Hex } from "./hash";
import { CURRENCIES, canonicalAmount, type Currency } from "./money";
import { NEAR_ACCOUNT_RE, type NearNetwork } from "./near";

export const POLICY_DOMAIN = "VEILPROCURE/POLICY/v1";
export const TERMS_DOMAIN = "VEILPROCURE/TERMS/v1";
export const POLICY_SCHEMA_VERSION = 1;

export const CATEGORIES = {
  ux_ui_design: "UX / UI design",
  qa_testing: "QA & testing",
  security_review: "Security review",
  documentation: "Technical documentation",
  software_development: "Software development",
} as const;
export type Category = keyof typeof CATEGORIES;
const categoryIds = Object.keys(CATEGORIES) as [Category, ...Category[]];

const decimalString = z.string().trim().regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Use a plain number such as 1250 or 1250.50");
const requirementId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use lowercase letters, digits and dashes");

export const requirementSchema = z.object({
  id: requirementId,
  label: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const weightsSchema = z
  .object({
    price: z.number().int().min(0).max(100),
    delivery: z.number().int().min(0).max(100),
    revisions: z.number().int().min(0).max(100),
  })
  .refine((w) => w.price + w.delivery + w.revisions === 100, "Weights must add up to 100");
export type Weights = z.infer<typeof weightsSchema>;

/** Contract bounds: every window ≥ 1 minute; accept ≤ 30 days; review ≤ 90 days. */
export const MIN_WINDOW_MINUTES = 1;
export const MAX_ACCEPT_WINDOW_MINUTES = 30 * 24 * 60;
export const MAX_REVIEW_WINDOW_MINUTES = 90 * 24 * 60;
export const MAX_INVITES = 20;

/** Editable RFQ draft. Everything here is frozen into the policy hash at publication. */
export const rfqDraftSchema = z.object({
  title: z.string().trim().min(5).max(140),
  category: z.enum(categoryIds),
  summary: z.string().trim().max(500).default(""),
  scope: z.string().trim().min(20, "Describe the scope in at least 20 characters").max(20000),
  deliverables: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
  maxPrice: decimalString.nullable(),
  maxDeliveryDays: z.number().int().min(1).max(3650).nullable(),
  minRevisions: z.number().int().min(0).max(100).nullable(),
  requirements: z.array(requirementSchema).max(15),
  weights: weightsSchema,
  acceptWindowMinutes: z.number().int().min(MIN_WINDOW_MINUTES).max(MAX_ACCEPT_WINDOW_MINUTES),
  reviewWindowMinutes: z.number().int().min(MIN_WINDOW_MINUTES).max(MAX_REVIEW_WINDOW_MINUTES),
  reviewerAccountId: z.string().regex(NEAR_ACCOUNT_RE, "Not a valid NEAR account id").nullable(),
});
export type RfqDraft = z.infer<typeof rfqDraftSchema>;

/** The immutable, hashed policy. `nonce` prevents dictionary confirmation of the public hash. */
export interface FrozenPolicy {
  schemaVersion: number;
  network: NearNetwork;
  contractId: string;
  rfqRef: string;
  buyerAccountId: string;
  deadlineNs: string;
  inviteSlots: number;
  nonce: string;
  title: string;
  category: Category;
  summary: string;
  scope: string;
  deliverables: string[];
  currency: Currency;
  criteria: {
    maxPrice: string | null;
    maxDeliveryDays: number | null;
    minRevisions: number | null;
    requirements: Requirement[];
  };
  weights: Weights;
  terms: PaymentTerms;
}

export interface PaymentTerms {
  settlement: "testnet-NEAR-escrow";
  milestones: 1;
  acceptWindowMinutes: number;
  reviewWindowMinutes: number;
  reviewerAccountId: string | null;
  deemedAcceptance: "supplier-may-claim-after-review-window";
}

export function buildPaymentTerms(draft: RfqDraft): PaymentTerms {
  return {
    settlement: "testnet-NEAR-escrow",
    milestones: 1,
    acceptWindowMinutes: draft.acceptWindowMinutes,
    reviewWindowMinutes: draft.reviewWindowMinutes,
    reviewerAccountId: draft.reviewerAccountId,
    deemedAcceptance: "supplier-may-claim-after-review-window",
  };
}

export function freezePolicy(
  draft: RfqDraft,
  ctx: { network: NearNetwork; contractId: string; rfqRef: string; buyerAccountId: string; deadlineNs: bigint; inviteSlots: number; nonce?: string },
): FrozenPolicy {
  const parsed = rfqDraftSchema.parse(draft);
  if (ctx.inviteSlots < 1 || ctx.inviteSlots > MAX_INVITES) throw new Error("invite slots out of range");
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    network: ctx.network,
    contractId: ctx.contractId,
    rfqRef: ctx.rfqRef,
    buyerAccountId: ctx.buyerAccountId,
    deadlineNs: ctx.deadlineNs.toString(),
    inviteSlots: ctx.inviteSlots,
    nonce: ctx.nonce ?? toHex(randomBytes(32)),
    title: normalizeText(parsed.title),
    category: parsed.category,
    summary: normalizeText(parsed.summary),
    scope: normalizeText(parsed.scope),
    deliverables: parsed.deliverables.map(normalizeText),
    currency: parsed.currency,
    criteria: {
      maxPrice: parsed.maxPrice === null ? null : canonicalAmount(parsed.maxPrice, parsed.currency),
      maxDeliveryDays: parsed.maxDeliveryDays,
      minRevisions: parsed.minRevisions,
      requirements: parsed.requirements.map((r) => ({
        id: r.id,
        label: normalizeText(r.label),
        description: normalizeText(r.description),
      })),
    },
    weights: parsed.weights,
    terms: buildPaymentTerms(parsed),
  };
}

function domainHash(domain: string, value: unknown): string {
  return sha256Hex(concat(utf8(domain), new Uint8Array([0]), utf8(canonicalJson(value))));
}

/** Hash anchored on-chain by `create_rfq` as `policy_hash`. */
export function policyHashHex(policy: FrozenPolicy): string {
  return domainHash(POLICY_DOMAIN, policy);
}

/** Hash anchored on-chain by `create_rfq` as `terms_hash` (payment/acceptance terms only). */
export function termsHashHex(policy: FrozenPolicy): string {
  return domainHash(TERMS_DOMAIN, { currency: policy.currency, terms: policy.terms });
}
