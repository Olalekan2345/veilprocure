import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";
import { toHex } from "./bytes";

export function sha256(bytes: Uint8Array): Uint8Array {
  return nobleSha256(bytes);
}

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(nobleSha256(bytes));
}
