/**
 * Envelope encryption format shared by the web app and the worker (Node only; import via
 * "@veilprocure/shared/envelope"). Format: "v1.<keyId>.<wrappedDek>.<iv>.<ciphertext+tag>",
 * AES-256-GCM for both layers, AAD = canonical JSON {table,id,org} binding the row and tenant.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { canonicalJson } from "./canonical";

export interface Aad {
  table: string;
  id: string;
  org: string;
}

export interface Kek {
  keyId: string;
  key: Buffer;
}

const aadBytes = (aad: Aad) => Buffer.from(canonicalJson({ table: aad.table, id: aad.id, org: aad.org }));

function gcmSeal(key: Buffer, data: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function gcmOpen(key: Buffer, raw: Buffer, aad: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAAD(aad);
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]);
}

export function sealWithKek(kek: Kek, plaintext: Buffer, aad: Aad): string {
  const dek = randomBytes(32);
  try {
    const wrapped = gcmSeal(kek.key, dek, Buffer.from(`veil-kek:${kek.keyId}`));
    const body = gcmSeal(dek, plaintext, aadBytes(aad));
    // body = iv || ct || tag; keep the historical layout: iv separate, then ct||tag.
    return ["v1", kek.keyId, wrapped.toString("base64url"), body.subarray(0, 12).toString("base64url"), body.subarray(12).toString("base64url")].join(".");
  } finally {
    dek.fill(0);
  }
}

export function openWithKek(kek: Kek, blob: string, aad: Aad): Buffer {
  const [v, keyId, wrapped, iv, ct] = blob.split(".");
  if (v !== "v1" || !keyId || !wrapped || !iv || !ct) throw new Error("malformed ciphertext");
  if (keyId !== kek.keyId) throw new Error(`unknown key id ${keyId}`);
  const dek = gcmOpen(kek.key, Buffer.from(wrapped, "base64url"), Buffer.from(`veil-kek:${kek.keyId}`));
  try {
    return gcmOpen(dek, Buffer.concat([Buffer.from(iv, "base64url"), Buffer.from(ct, "base64url")]), aadBytes(aad));
  } finally {
    dek.fill(0);
  }
}
