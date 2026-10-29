/**
 * Canonical JSON (RFC 8785 / JCS restricted to integers): object keys sorted by UTF-16 code
 * units, no insignificant whitespace, strings escaped exactly like ECMAScript JSON.stringify.
 * Floats, NaN, Infinity, undefined, functions, bigints and non-plain objects are rejected so a
 * value has exactly one byte representation. Normalisation of *content* (trimming, Unicode NFC)
 * is the caller's job — this function never changes values silently.
 */
export type Canonical =
  | string
  | number
  | boolean
  | null
  | readonly Canonical[]
  | { readonly [key: string]: Canonical };

export function canonicalJson(value: unknown): string {
  return encode(value, "$");
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error(`canonicalJson: ${path} must be a safe integer`);
      return Object.is(value, -0) ? "0" : String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v, i) => encode(v, `${path}[${i}]`)).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(`canonicalJson: ${path} must be a plain object`);
      }
      const entries = Object.entries(value as Record<string, unknown>);
      for (const [k, v] of entries) {
        if (v === undefined) throw new Error(`canonicalJson: ${path}.${k} is undefined`);
      }
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${encode(v, `${path}.${k}`)}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: ${path} has unsupported type ${typeof value}`);
  }
}

/** Trim + Unicode NFC + CRLF→LF. Applied to every free-text field before hashing or storing. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").normalize("NFC").trim();
}
