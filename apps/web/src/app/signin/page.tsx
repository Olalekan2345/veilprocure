import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/status";
import { Callout, TestnetPill } from "@/components/ui";
import { emailDeliveryMode } from "@/server/email";
import { privyAppId } from "@/server/env";
import { getSession } from "@/server/session";
import { PrivySignIn } from "./privy-signin";
import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  if (await getSession()) redirect(safeNext);
  const privy = privyAppId();
  const mode = emailDeliveryMode();
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" aria-label="VeilProcure home">
            <Wordmark />
          </Link>
          <TestnetPill />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="display text-3xl text-ink">Sign in</h1>
          <p className="mt-2 text-sm text-muted">
            {privy
              ? "We will e-mail you a 6-digit code, sent by our sign-in provider Privy. New here? The same code creates your account."
              : "We will e-mail you a one-time link. New here? The same link creates your account."}
          </p>
          <div className="mt-6 space-y-4">
            {error && (
              <Callout tone="bad">{error === "expired" ? "That sign-in link has expired or was already used. Request a new one." : "That sign-in link is not valid."}</Callout>
            )}
            {privy ? <PrivySignIn appId={privy} next={safeNext} /> : <SignInForm next={safeNext} mode={mode} />}
            {privy && mode === "dev-mailbox" && (
              <details className="rounded-lg border border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer text-muted">Local development: sign in with the dev mailbox</summary>
                <div className="mt-4">
                  <SignInForm next={safeNext} mode={mode} />
                </div>
              </details>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-faint">
          By continuing you accept the <Link href="/terms" className="underline">beta terms</Link> and <Link href="/privacy" className="underline">privacy notice</Link>.
        </p>
      </div>
    </main>
  );
}
