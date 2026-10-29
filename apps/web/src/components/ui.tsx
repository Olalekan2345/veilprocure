import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "gold" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 shadow-sm",
  gold: "bg-gold text-white hover:bg-gold-ink shadow-sm",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "text-ink-3 hover:bg-sunken hover:text-ink",
  danger: "border border-bad/30 bg-bad-soft text-bad hover:bg-bad hover:text-white",
};
const SIZES = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof SIZES = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cx("card", className)} />;
}

export function CardHeader({ title, description, action, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export type Tone = "neutral" | "gold" | "verify" | "ok" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-3 ring-line",
  gold: "bg-gold-soft text-gold-ink ring-gold/25",
  verify: "bg-verify-soft text-verify ring-verify/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Callout({ tone = "neutral", title, children, icon }: { tone?: Tone; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={cx("flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset", TONES[tone])}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(title ? "mt-0.5" : "", "leading-relaxed [&_a]:underline")}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-gold-soft text-gold-ink">{icon}</div>}
      <h3 className="display text-2xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, optional }: { label: string; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-faint">Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors focus:border-verify focus:outline-none focus:ring-2 focus:ring-verify/15 disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-bad";

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function KeyValue({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v], i) => (
        <div key={i} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[2.1rem] leading-[1.1] text-ink sm:text-[2.6rem]">{title}</h1>
        {description && <div className="mt-3 text-[15px] leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function TestnetPill() {
  return (
    <span
      title="Payments use NEAR testnet tokens, which have no monetary value."
      className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warn"
    >
      <span className="size-1.5 rounded-full bg-warn" aria-hidden /> Testnet beta
    </span>
  );
}

export function Hash({ value, chars = 10, label }: { value: string; chars?: number; label?: string }) {
  const short = value.length > chars * 2 + 1 ? `${value.slice(0, chars)}…${value.slice(-6)}` : value;
  return (
    <span className="hash rounded bg-sunken px-1.5 py-0.5 text-ink-3" title={value} aria-label={label ? `${label}: ${value}` : value}>
      {short}
    </span>
  );
}
