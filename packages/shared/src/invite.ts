import { concat, fromHex32, randomBytes, toHex, utf8 } from "./bytes";
import { sha256Hex } from "./hash";

/** Must match `INVITE_DOMAIN` in contracts/veilprocure/core/src/lib.rs. */
export const INVITE_DOMAIN = "VEILPROCURE/INVITE/v1";

/** sha256(INVITE_DOMAIN || 0x00 || policy_hash || secret) — one leaf per invite slot. */
export function inviteLeafPreimage(policyHashHex: string, secretHex: string): Uint8Array {
  return concat(utf8(INVITE_DOMAIN), new Uint8Array([0]), fromHex32(policyHashHex), fromHex32(secretHex));
}

export function inviteLeafHex(policyHashHex: string, secretHex: string): string {
  return sha256Hex(inviteLeafPreimage(policyHashHex, secretHex));
}

/** 256-bit random invite secret (bearer token until first on-chain use). */
export function newInviteSecretHex(): string {
  return toHex(randomBytes(32));
}
