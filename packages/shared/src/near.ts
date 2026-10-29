/** NEAR account id rules (nearcore `AccountId` validation): 2–64 chars, lowercase segments. */
export const NEAR_ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isNearAccountId(value: string): boolean {
  return NEAR_ACCOUNT_RE.test(value);
}

export type NearNetwork = "testnet" | "mainnet";

export const NS_PER_MS = 1_000_000n;

export function msToNs(ms: number): bigint {
  return BigInt(Math.trunc(ms)) * NS_PER_MS;
}

export function nsToDate(ns: bigint | string): Date {
  return new Date(Number(BigInt(ns) / NS_PER_MS));
}
