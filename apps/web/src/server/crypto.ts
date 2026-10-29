import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { openWithKek, sealWithKek, type Aad, type Kek } from "@veilprocure/shared/envelope";
import { env } from "./env";

/**
 * Envelope encryption for sensitive structured fields and files.
 *
 * Each value gets a fresh 256-bit data key (DEK). The value is sealed with AES-256-GCM under the
 * DEK; the DEK is wrapped by the key-encryption key (KEK) from the configured KeyProvider. The
 * AAD binds the ciphertext to its table, row id and owning organisation, so a ciphertext copied
 * into another row or tenant fails to decrypt.
 *
 * The format lives in @veilprocure/shared/envelope (shared with the worker). The KEK comes from
 * an environment variable here. That is suitable for
 * local development and a public testnet beta only: anyone with server environment access can
 * decrypt. Moving the KEK into a KMS (AWS KMS / GCP KMS / Vault Transit wrap/unwrap) is a
 * documented hardening step that is not implemented in this build (docs/SECURITY_MODEL.md).
 */

let kek: Kek | undefined;
function key(): Kek {
  kek ??= { keyId: env().VEIL_KEY_ID, key: Buffer.from(env().VEIL_MASTER_KEY, "base64") };
  return kek;
}

export type { Aad };

export async function seal(plaintext: Buffer, aad: Aad): Promise<string> {
  return sealWithKek(key(), plaintext, aad);
}

export async function open(blob: string, aad: Aad): Promise<Buffer> {
  return openWithKek(key(), blob, aad);
}

export async function sealJson(value: unknown, aad: Aad): Promise<string> {
  return seal(Buffer.from(JSON.stringify(value), "utf8"), aad);
}

export async function openJson<T>(blob: string, aad: Aad): Promise<T> {
  return JSON.parse((await open(blob, aad)).toString("utf8")) as T;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Random URL-safe token and its storage hash (only the hash is persisted). */
export function newToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

/** Short-lived HMAC-signed download tokens (signed URLs for private files). */
export function signDownload(attachmentId: string, userId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${attachmentId}.${userId}.${exp}`;
  const mac = createHmac("sha256", Buffer.from(env().DOWNLOAD_TOKEN_SECRET, "base64")).update(payload).digest("base64url");
  return `${exp}.${mac}`;
}

export function verifyDownload(attachmentId: string, userId: string, token: string): boolean {
  const [expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", Buffer.from(env().DOWNLOAD_TOKEN_SECRET, "base64"))
    .update(`${attachmentId}.${userId}.${exp}`)
    .digest();
  const given = Buffer.from(mac, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
