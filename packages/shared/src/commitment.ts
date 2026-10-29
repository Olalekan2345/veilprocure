import { concat, fromHex32, isHex32, lenPrefixed, randomBytes, toHex, u32le, u64le, utf8 } from "./bytes";
import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";
import type { NearNetwork } from "./near";
import type { NormalizedQuote } from "./quote";

export const BID_DOMAIN = "VEILPROCURE/BID/v1";

export interface CommitmentInput {
  network: NearNetwork;
  contractId: string;
  rfqOnchainId: bigint;
  supplierAccountId: string;
  version: number;
  quote: NormalizedQuote;
  /** SHA-256 hex digests of the plaintext attachments. Order-independent (sorted here). */
  attachmentDigests: string[];
  /** 256-bit secret salt, hex. Kept private (encrypted at rest); never placed on chain. */
  saltHex: string;
}

/**
 * Canonical, versioned, domain-separated preimage:
 *   "VEILPROCURE/BID/v1" 0x00
 *   lp(network) lp(contract_id) u64le(rfq_id) lp(supplier_account) u32le(version)
 *   lp(canonical_json(quote)) u32le(n_attachments) digest_1 .. digest_n (sorted, 32 B each)
 *   salt (32 B)
 * where lp(x) = u32le(len(utf8(x))) || utf8(x). Fixed-width or length-prefixed fields only, so
 * no two different inputs share an encoding.
 */
export function bidCommitmentPreimage(input: CommitmentInput): Uint8Array {
  if (!isHex32(input.saltHex)) throw new Error("salt must be 32 bytes of hex");
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error("version must be ≥ 1");
  const digests = [...input.attachmentDigests].map((d) => d.toLowerCase()).sort();
  for (const d of digests) if (!isHex32(d)) throw new Error("attachment digest must be 32 bytes of hex");
  if (new Set(digests).size !== digests.length) throw new Error("duplicate attachment digest");
  return concat(
    utf8(BID_DOMAIN),
    new Uint8Array([0]),
    lenPrefixed(utf8(input.network)),
    lenPrefixed(utf8(input.contractId)),
    u64le(input.rfqOnchainId),
    lenPrefixed(utf8(input.supplierAccountId)),
    u32le(input.version),
    lenPrefixed(utf8(canonicalJson(input.quote))),
    u32le(digests.length),
    ...digests.map(fromHex32),
    fromHex32(input.saltHex),
  );
}

export function bidCommitmentHex(input: CommitmentInput): string {
  return sha256Hex(bidCommitmentPreimage(input));
}

export function newSaltHex(): string {
  return toHex(randomBytes(32));
}

/** Delivery evidence hash anchored by `submit_delivery`. */
export const DELIVERY_DOMAIN = "VEILPROCURE/DELIVERY/v1";

export function deliveryEvidenceHex(input: { rfqRef: string; round: number; note: string; fileDigests: string[] }): string {
  const digests = [...input.fileDigests].map((d) => d.toLowerCase()).sort();
  return sha256Hex(
    concat(
      utf8(DELIVERY_DOMAIN),
      new Uint8Array([0]),
      utf8(canonicalJson({ rfqRef: input.rfqRef, round: input.round, note: input.note, fileDigests: digests })),
    ),
  );
}

/** Agreement hash anchored by `award_supplier`. */
export const AGREEMENT_DOMAIN = "VEILPROCURE/AGREEMENT/v1";

export interface AgreementInput {
  policyHash: string;
  rfqOnchainId: string;
  round: number;
  supplierAccountId: string;
  bidCommitment: string;
  amountYocto: string;
  acceptWindowMinutes: number;
  reviewWindowMinutes: number;
  reviewerAccountId: string | null;
  workSummary: string;
}

export function agreementHashHex(input: AgreementInput): string {
  return sha256Hex(concat(utf8(AGREEMENT_DOMAIN), new Uint8Array([0]), utf8(canonicalJson(input))));
}
