import { ArrowRight, ArrowUp } from "lucide-react";
import { getSession } from "@/server/session";
import { BrandLockup } from "./brand";
import { MobileNav } from "./mobile-nav";
import "./site.css";

/** Section links work from every page: on "/" they scroll, elsewhere they load the home page. */
export const SITE_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#buyers", label: "For buyers" },
  { href: "/#suppliers", label: "For suppliers" },
  { href: "/security", label: "Privacy & security" },
  { href: "/#faq", label: "FAQ" },
];

export const START_HREF = "/signin?next=/app/onboarding";
const REPO = "https://github.com/Olalekan2345/veilprocure";
const CONTRACT = "https://testnet.nearblocks.io/address/veilprocure-106725.testnet";

export async function SiteHeader() {
  const session = await getSession();
  const actions = session
    ? [{ href: "/app", label: "Open workspace", primary: true }]
    : [
        { href: "/signin", label: "Sign in" },
        { href: START_HREF, label: "Get started", primary: true },
      ];
  return (
    <header className="vp-header" data-scrolled="false">
      <div className="vp-container flex h-[72px] items-center justify-between gap-4">
        <a href="/" aria-label="VeilProcure home" className="shrink-0 rounded-lg">
          <BrandLockup height={34} />
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {SITE_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="vp-navlink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {actions.map((a) =>
              a.primary ? (
                <a key={a.href} href={a.href} className="vp-btn vp-btn-primary vp-btn-sm">
                  {a.label} <ArrowRight className="size-4" aria-hidden />
                </a>
              ) : (
                <a key={a.href} href={a.href} className="vp-navlink px-2">
                  {a.label}
                </a>
              ),
            )}
          </div>
          <MobileNav links={SITE_LINKS} actions={actions} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const col = (title: string, links: { href: string; label: string; external?: boolean }[]) => (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-vp-muted">{title}</p>
      <ul className="mt-4 space-y-2.5 text-[15px]">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {l.label}
              {l.external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="vp-footer">
      <div className="vp-container grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <BrandLockup height={32} />
          <p className="vp-small mt-5">
            Confidential procurement for fixed-scope digital services: sealed supplier quotes, rules published in advance, verified private AI notes and escrow you release.
          </p>
        </div>
        {col("Product", [
          { href: "/#how-it-works", label: "How it works" },
          { href: "/#buyers", label: "For buyers" },
          { href: "/#suppliers", label: "For suppliers" },
          { href: "/#faq", label: "FAQ" },
        ])}
        {col("Trust", [
          { href: "/security", label: "Privacy & security" },
          { href: "/privacy", label: "Privacy notice" },
          { href: "/terms", label: "Beta terms" },
          { href: "/support", label: "Support" },
        ])}
        {col("Build", [
          { href: REPO, label: "Source code (GitHub)", external: true },
          { href: `${REPO}/tree/main/docs`, label: "Documentation", external: true },
          { href: CONTRACT, label: "Testnet contract", external: true },
        ])}
      </div>
      <div className="border-t border-vp-border">
        <div className="vp-container flex flex-col gap-3 pb-24 pt-6 text-[13px] text-vp-muted md:flex-row md:items-center md:justify-between md:pb-6">
          <div className="space-y-1">
            <p>Public beta on NEAR testnet. Test tokens have no monetary value; the escrow contract has not been audited.</p>
            <p>Built on NEAR testnet; not affiliated with or endorsed by the NEAR Foundation.</p>
          </div>
          {/* Plain link: works without JavaScript (CSS smooth scrolling where motion is allowed). */}
          <a href="#top" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-vp-ink">
            Back to top <ArrowUp className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
