/** Exact decimal arithmetic on bigint minor units. Floating point is never used for money. */

export const CURRENCY_DECIMALS = { USD: 2, EUR: 2, GBP: 2, NEAR: 24 } as const;
export type Currency = keyof typeof CURRENCY_DECIMALS;
export const CURRENCIES = Object.keys(CURRENCY_DECIMALS) as Currency[];

export const YOCTO_PER_NEAR = 10n ** 24n;

const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

/** Parses a non-negative decimal string ("1250", "1250.5") into minor units. */
export function parseDecimal(input: string, decimals: number): bigint {
  const text = input.trim().replace(/,/g, "");
  const m = DECIMAL.exec(text);
  if (!m) throw new Error("amount must be a non-negative decimal number");
  const whole = m[1] ?? "0";
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new Error(`amount allows at most ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** Formats minor units as a plain decimal string with exactly `decimals` places (trim optional). */
export function formatDecimal(minor: bigint, decimals: number, opts: { trim?: boolean; group?: boolean } = {}): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const base = 10n ** BigInt(decimals);
  let whole = (abs / base).toString();
  let frac = decimals > 0 ? (abs % base).toString().padStart(decimals, "0") : "";
  if (opts.trim) frac = frac.replace(/0+$/, "");
  if (opts.group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Canonical decimal string for a currency amount (fixed decimals, no grouping). */
export function canonicalAmount(input: string, currency: Currency): string {
  const d = CURRENCY_DECIMALS[currency];
  return formatDecimal(parseDecimal(input, d), d);
}

export function parseNear(input: string): bigint {
  return parseDecimal(input, 24);
}

/** Human display of yoctoNEAR, e.g. "5 NEAR" / "0.0125 NEAR". Always labelled testnet by callers. */
export function formatNear(yocto: bigint, maxFraction = 6): string {
  const full = formatDecimal(yocto, 24, { trim: true, group: true });
  const [w, f = ""] = full.split(".");
  const frac = f.slice(0, maxFraction).replace(/0+$/, "");
  const truncated = f.length > maxFraction && /[1-9]/.test(f.slice(maxFraction));
  return `${truncated ? "≈" : ""}${w}${frac ? `.${frac}` : ""} NEAR`;
}

export function formatMoney(minor: bigint, currency: Currency): string {
  if (currency === "NEAR") return formatNear(minor);
  return `${formatDecimal(minor, CURRENCY_DECIMALS[currency], { group: true })} ${currency}`;
}
