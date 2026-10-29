import { describe, expect, it } from "vitest";
import {
  agreementHashHex,
  bidCommitmentHex,
  bidCommitmentPreimage,
  canonicalAmount,
  canonicalJson,
  evaluateHardCriteria,
  formatNear,
  freezePolicy,
  fromHex,
  inviteLeafHex,
  isNearAccountId,
  normalizeQuote,
  parseDecimal,
  parseNear,
  policyHashHex,
  scoreEligible,
  termsHashHex,
  toHex,
  type NormalizedQuote,
  type RfqDraft,
} from "./index";

const VECTOR_QUOTE: NormalizedQuote = {
  schemaVersion: 1,
  currency: "USD",
  totalPrice: "1250.50",
  deliveryDays: 14,
  revisionsIncluded: 2,
  scope: "Accessibility audit of checkout flow",
  assumptions: "",
  warranty: "30 days",
  requirementResponses: [{ id: "wcag", met: true, note: "WCAG 2.2 AA" }],
};

const VECTOR_INPUT = {
  network: "testnet" as const,
  contractId: "veilprocure.testnet",
  rfqOnchainId: 7n,
  supplierAccountId: "alpha.testnet",
  version: 3,
  quote: VECTOR_QUOTE,
  attachmentDigests: ["bb".repeat(32), "aa".repeat(32)],
  saltHex: "cd".repeat(32),
};

describe("cross-language vectors", () => {
  it("invite leaf matches Python and the Rust core", () => {
    // Same vector asserted in contracts/veilprocure/core/src/tests.rs.
    expect(inviteLeafHex("11".repeat(32), "22".repeat(32))).toBe(
      "948345eaecf2cf9117bb484de543c286d6157ee2faefcc0f4e704bd855e9e8ec",
    );
  });

  it("bid commitment matches the independent Python implementation", () => {
    // scripts/vectors/bid_commitment_vector.py
    expect(bidCommitmentPreimage(VECTOR_INPUT).length).toBe(441);
    expect(bidCommitmentHex(VECTOR_INPUT)).toBe("27c79fdd2987aa7f75f3ceb7a1559b8c131abba3dbaa842cc3f10035b55af5b4");
  });
});

describe("bid commitment", () => {
  const base = bidCommitmentHex(VECTOR_INPUT);

  it("is independent of attachment order", () => {
    expect(bidCommitmentHex({ ...VECTOR_INPUT, attachmentDigests: ["aa".repeat(32), "bb".repeat(32)] })).toBe(base);
  });

  it("changes when any bound field changes (tamper evidence)", () => {
    const variants = [
      { ...VECTOR_INPUT, network: "mainnet" as const },
      { ...VECTOR_INPUT, contractId: "other.testnet" },
      { ...VECTOR_INPUT, rfqOnchainId: 8n },
      { ...VECTOR_INPUT, supplierAccountId: "beta.testnet" },
      { ...VECTOR_INPUT, version: 4 },
      { ...VECTOR_INPUT, quote: { ...VECTOR_QUOTE, totalPrice: "1250.51" } },
      { ...VECTOR_INPUT, quote: { ...VECTOR_QUOTE, deliveryDays: 15 } },
      { ...VECTOR_INPUT, attachmentDigests: ["aa".repeat(32)] },
      { ...VECTOR_INPUT, saltHex: "ce".repeat(32) },
    ];
    const hashes = variants.map(bidCommitmentHex);
    for (const h of hashes) expect(h).not.toBe(base);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("rejects short salts, bad versions and duplicate digests", () => {
    expect(() => bidCommitmentHex({ ...VECTOR_INPUT, saltHex: "cd".repeat(16) })).toThrow();
    expect(() => bidCommitmentHex({ ...VECTOR_INPUT, version: 0 })).toThrow();
    expect(() => bidCommitmentHex({ ...VECTOR_INPUT, attachmentDigests: ["aa".repeat(32), "AA".repeat(32)] })).toThrow();
  });

  it("is not ambiguous between adjacent length-prefixed fields", () => {
    const a = bidCommitmentHex({ ...VECTOR_INPUT, contractId: "ab", supplierAccountId: "c.testnet" });
    const b = bidCommitmentHex({ ...VECTOR_INPUT, contractId: "a", supplierAccountId: "bc.testnet" });
    expect(a).not.toBe(b);
  });
});

describe("canonical JSON", () => {
  it("sorts keys and has one representation", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("rejects floats, undefined, bigint and class instances", () => {
    expect(() => canonicalJson({ a: 1.5 })).toThrow();
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: 1n })).toThrow();
    expect(() => canonicalJson({ a: new Date() })).toThrow();
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });
});

describe("money", () => {
  it("parses exactly without floating point", () => {
    expect(parseDecimal("0.1", 2) + parseDecimal("0.2", 2)).toBe(30n);
    expect(parseNear("1.5")).toBe(1_500_000_000_000_000_000_000_000n);
    expect(canonicalAmount("1250.5", "USD")).toBe("1250.50");
    expect(canonicalAmount("1,000", "USD")).toBe("1000.00");
  });

  it("rejects negative, exponent and over-precise input", () => {
    expect(() => parseDecimal("-1", 2)).toThrow();
    expect(() => parseDecimal("1e3", 2)).toThrow();
    expect(() => parseDecimal("1.001", 2)).toThrow();
    expect(() => parseDecimal("01", 2)).toThrow();
  });

  it("formats NEAR for display", () => {
    expect(formatNear(5n * 10n ** 24n)).toBe("5 NEAR");
    expect(formatNear(1n)).toBe("≈0 NEAR");
    expect(formatNear(1_250_000_000_000_000_000_000n)).toBe("0.00125 NEAR");
  });
});

describe("hex and accounts", () => {
  it("round-trips hex and rejects junk", () => {
    expect(toHex(fromHex("00ff10"))).toBe("00ff10");
    expect(() => fromHex("0")).toThrow();
    expect(() => fromHex("zz")).toThrow();
  });

  it("validates NEAR account ids", () => {
    for (const ok of ["alice.testnet", "a1", "sub.alice.testnet", "veil-procure.testnet", "0".repeat(64)]) {
      expect(isNearAccountId(ok)).toBe(true);
    }
    for (const bad of ["A.testnet", "a", "alice..testnet", "-alice.testnet", "alice.testnet.", "a".repeat(65)]) {
      expect(isNearAccountId(bad)).toBe(false);
    }
  });
});

const DRAFT: RfqDraft = {
  title: "Accessibility audit",
  category: "qa_testing",
  summary: "Audit our checkout",
  scope: "Full WCAG 2.2 AA audit of the checkout flow with a written report.",
  deliverables: ["Audit report (PDF)"],
  currency: "USD",
  maxPrice: "2000",
  maxDeliveryDays: 21,
  minRevisions: 1,
  requirements: [{ id: "wcag", label: "WCAG 2.2 AA expertise", description: "" }],
  weights: { price: 60, delivery: 30, revisions: 10 },
  acceptWindowMinutes: 60 * 24,
  reviewWindowMinutes: 60 * 72,
  reviewerAccountId: null,
};

const CTX = {
  network: "testnet" as const,
  contractId: "veilprocure.testnet",
  rfqRef: "6b0f3a7e-0000-4000-8000-000000000001",
  buyerAccountId: "buyer.testnet",
  deadlineNs: 1_800_000_000_000_000_000n,
  inviteSlots: 2,
  nonce: "ab".repeat(32),
};

describe("policy", () => {
  it("hash is stable and binds every field", () => {
    const p = freezePolicy(DRAFT, CTX);
    expect(policyHashHex(p)).toBe(policyHashHex(freezePolicy(DRAFT, CTX)));
    expect(policyHashHex(freezePolicy({ ...DRAFT, maxPrice: "2001" }, CTX))).not.toBe(policyHashHex(p));
    expect(policyHashHex(freezePolicy(DRAFT, { ...CTX, nonce: "ac".repeat(32) }))).not.toBe(policyHashHex(p));
    expect(termsHashHex(freezePolicy({ ...DRAFT, reviewWindowMinutes: 61 }, CTX))).not.toBe(termsHashHex(p));
    // terms hash ignores non-payment fields
    expect(termsHashHex(freezePolicy({ ...DRAFT, title: "Different title" }, CTX))).toBe(termsHashHex(p));
  });

  it("normalizes text and amounts before hashing", () => {
    const p = freezePolicy({ ...DRAFT, title: "  Accessibility audit \r\n", maxPrice: "2000.0" }, CTX);
    expect(p.title).toBe("Accessibility audit");
    expect(p.criteria.maxPrice).toBe("2000.00");
  });

  it("rejects weights that do not add up to 100", () => {
    expect(() => freezePolicy({ ...DRAFT, weights: { price: 50, delivery: 30, revisions: 10 } }, CTX)).toThrow();
  });
});

describe("deterministic evaluation", () => {
  const policy = freezePolicy(DRAFT, CTX);
  const quote = (over: Partial<Parameters<typeof normalizeQuote>[0]> = {}) =>
    normalizeQuote(
      {
        totalPrice: "1500",
        deliveryDays: 14,
        revisionsIncluded: 2,
        scope: "We will audit every checkout step against WCAG 2.2 AA.",
        assumptions: "",
        warranty: "",
        requirementResponses: { wcag: { met: true, note: "" } },
        ...over,
      },
      policy,
    );

  it("passes a compliant quote", () => {
    const ev = evaluateHardCriteria(policy, "q1", quote());
    expect(ev.eligible).toBe(true);
    expect(ev.results.map((r) => r.criterionId)).toEqual(["currency", "max-price", "max-delivery-days", "min-revisions", "req:wcag"]);
  });

  it("fails on exact numeric boundaries, not approximations", () => {
    expect(evaluateHardCriteria(policy, "q", quote({ totalPrice: "2000.00" })).eligible).toBe(true);
    const over = evaluateHardCriteria(policy, "q", quote({ totalPrice: "2000.01" }));
    expect(over.eligible).toBe(false);
    expect(over.results.find((r) => r.criterionId === "max-price")?.outcome).toBe("fail");
    expect(evaluateHardCriteria(policy, "q", quote({ deliveryDays: 22 })).eligible).toBe(false);
    expect(evaluateHardCriteria(policy, "q", quote({ revisionsIncluded: 0 })).eligible).toBe(false);
  });

  it("treats a missing requirement confirmation as a failure", () => {
    const ev = evaluateHardCriteria(policy, "q", quote({ requirementResponses: {} }));
    expect(ev.eligible).toBe(false);
    expect(ev.results.find((r) => r.criterionId === "req:wcag")?.basis).toBe("supplier_declaration");
  });

  it("rejects responses to requirements that are not in the policy", () => {
    expect(() => quote({ requirementResponses: { injected: { met: true, note: "" } } })).toThrow();
  });

  it("scores with exact arithmetic and is independent of input order", () => {
    const qs = [
      { quoteRef: "a", quote: quote({ totalPrice: "1000", deliveryDays: 20, revisionsIncluded: 1 }) },
      { quoteRef: "b", quote: quote({ totalPrice: "1500", deliveryDays: 10, revisionsIncluded: 2 }) },
    ];
    const s1 = scoreEligible(policy, qs);
    const s2 = scoreEligible(policy, [...qs].reverse());
    expect(s1).toEqual(s2);
    // a: price 10000, delivery 5000, revisions 5000 -> (60*10000 + 30*5000 + 10*5000)/100 = 8000
    // b: price 6666,  delivery 10000, revisions 10000 -> (60*6666 + 30*10000 + 10*10000)/100 = 7999
    expect(s1.map((s) => [s.quoteRef, s.scoreBp])).toEqual([
      ["a", 8000],
      ["b", 7999],
    ]);
  });
});

describe("agreement hash", () => {
  it("binds amount and destination", () => {
    const base = {
      policyHash: "11".repeat(32),
      rfqOnchainId: "7",
      round: 1,
      supplierAccountId: "alpha.testnet",
      bidCommitment: "22".repeat(32),
      amountYocto: "5000000000000000000000000",
      acceptWindowMinutes: 1440,
      reviewWindowMinutes: 4320,
      reviewerAccountId: null,
      workSummary: "Audit",
    };
    const h = agreementHashHex(base);
    expect(agreementHashHex({ ...base, amountYocto: "5000000000000000000000001" })).not.toBe(h);
    expect(agreementHashHex({ ...base, supplierAccountId: "beta.testnet" })).not.toBe(h);
  });
});
