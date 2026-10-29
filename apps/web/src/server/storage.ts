import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { env } from "./env";
import { open, seal, type Aad } from "./crypto";
import { AppError } from "./errors";

/**
 * Private object storage. Files are envelope-encrypted *before* they reach the store, so the
 * backend (local disk here; any S3-compatible bucket in a hosted deployment) only ever holds
 * ciphertext under random keys. Nothing is served statically; downloads go through an
 * authorised route with a short-lived signed token and `Content-Disposition: attachment`.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed types are sniffed from content, never trusted from the browser. */
export function sniffContentType(buf: Buffer): "application/pdf" | "image/png" | "image/jpeg" | "text/plain" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // Plain text / markdown / CSV: valid UTF-8, no NUL bytes, no HTML/SVG/script markers.
  if (!buf.includes(0)) {
    const text = buf.toString("utf8");
    if (!text.includes("�") && !/<\s*(script|html|svg|iframe|object)\b/i.test(text.slice(0, 4096))) return "text/plain";
  }
  return null;
}

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

function root(): string {
  return resolve(env().STORAGE_DIR);
}

function pathFor(key: string): string {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("invalid storage key");
  const p = resolve(join(root(), key.slice(0, 2), key));
  if (!p.startsWith(root())) throw new Error("path traversal");
  return p;
}

export interface StoredObject {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  encMeta: string;
}

export async function putEncrypted(data: Buffer, aadFor: (storageKey: string) => Aad): Promise<StoredObject> {
  if (data.length === 0) throw new AppError("UPLOAD_REJECTED", "The file is empty.");
  if (data.length > MAX_UPLOAD_BYTES) throw new AppError("UPLOAD_REJECTED", "Files are limited to 10 MB.");
  const contentType = sniffContentType(data);
  if (!contentType) throw new AppError("UPLOAD_REJECTED", "Only PDF, PNG, JPEG and plain-text files are accepted.");
  const storageKey = randomUUID();
  const sealed = await seal(data, aadFor(storageKey));
  const p = pathFor(storageKey);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, sealed, { flag: "wx" });
  return { storageKey, sha256: createHash("sha256").update(data).digest("hex"), sizeBytes: data.length, contentType, encMeta: "inline-envelope-v1" };
}

export async function getDecrypted(storageKey: string, aad: Aad): Promise<Buffer> {
  return open(await readFile(pathFor(storageKey), "utf8"), aad);
}
