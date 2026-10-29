import Link from "next/link";
import { Wordmark } from "@/components/status";
import { Button } from "@/components/ui";
import { confirmSignIn } from "@/server/actions/account";

export const metadata = { title: "Confirm sign-in", robots: { index: false } };

/**
 * GET only renders a button; the token is consumed by a POST. E-mail security scanners that
 * prefetch links therefore cannot burn a user's sign-in link.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-[420px] text-center">
        <Link href="/" className="inline-block" aria-label="VeilProcure home">
          <Wordmark />
        </Link>
        <div className="card mt-8 p-8">
          <h1 className="display text-3xl text-ink">Finish signing in</h1>
          {token ? (
            <form action={confirmSignIn} className="mt-6">
              <input type="hidden" name="token" value={token} />
              <Button type="submit" size="lg" className="w-full">
                Continue to VeilProcure
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted">
              This link is incomplete. <Link href="/signin" className="underline">Request a new one</Link>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
