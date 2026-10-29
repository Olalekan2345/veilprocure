import Link from "next/link";
import { getSession } from "@/server/session";
import { Wordmark } from "./status";
import { ButtonLink, TestnetPill } from "./ui";

export async function PublicHeader() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="VeilProcure home">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-ink-3 md:flex">
          <Link href="/#how" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/security" className="hover:text-ink">
            Security &amp; privacy
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex">
            <TestnetPill />
          </span>
          {session ? (
            <ButtonLink href="/app" size="sm">
              Open workspace
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/signin" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signin?next=/app/onboarding" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Confidential procurement for fixed-scope digital services. Public beta on NEAR testnet: blockchain payments are test transactions with no monetary value.
          </p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold text-ink">Product</p>
          <ul className="space-y-2 text-muted">
            <li>
              <Link href="/#how" className="hover:text-ink">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/security" className="hover:text-ink">
                Security &amp; trust boundary
              </Link>
            </li>
            <li>
              <Link href="/signin" className="hover:text-ink">
                Sign in
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold text-ink">Policies</p>
          <ul className="space-y-2 text-muted">
            <li>
              <Link href="/terms" className="hover:text-ink">
                Beta terms
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-ink">
                Privacy notice
              </Link>
            </li>
            <li>
              <Link href="/support" className="hover:text-ink">
                Contact support
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main">{children}</main>
      <PublicFooter />
    </>
  );
}
