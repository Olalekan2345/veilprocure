/** Byte helpers shared by browser and server. No Buffer dependency so it runs in both. */

const HEX = /^[0-9a-fA-F]*$/;

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !HEX.test(hex)) throw new Error("invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Parses exactly 32 bytes (64 hex chars). */
export function fromHex32(hex: string): Uint8Array {
  if (hex.length !== 64) throw new Error("expected 32-byte hex string");
  return fromHex(hex);
}

export function isHex32(value: string): boolean {
  return value.length === 64 && HEX.test(value);
}

const encoder = new TextEncoder();
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function u32le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("u32 out of range");
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

export function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("u64 out of range");
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

/** Length-prefixed (u32 little-endian) byte field — removes concatenation ambiguity. */
export function lenPrefixed(bytes: Uint8Array): Uint8Array {
  return concat(u32le(bytes.length), bytes);
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Constant-time comparison for equal-length byte arrays / hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
