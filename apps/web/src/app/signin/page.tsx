import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/status";
import { Callout, TestnetPill } from "@/components/ui";
import { emailDeliveryMode } from "@/server/email";
import { getSession } from "@/server/session";
import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  if (await getSession()) redirect(safeNext);
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
          <p className="mt-2 text-sm text-muted">We will e-mail you a one-time link. New here? The same link creates your account.</p>
          <div className="mt-6 space-y-4">
            {error && (
              <Callout tone="bad">{error === "expired" ? "That sign-in link has expired or was already used. Request a new one." : "That sign-in link is not valid."}</Callout>
            )}
            <SignInForm next={safeNext} mode={emailDeliveryMode()} />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-faint">
          By continuing you accept the <Link href="/terms" className="underline">beta terms</Link> and <Link href="/privacy" className="underline">privacy notice</Link>.
        </p>
      </div>
    </main>
  );
}
