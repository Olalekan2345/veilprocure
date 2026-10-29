import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Wordmark } from "@/components/status";
import { TestnetPill } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { signOut, switchOrganization } from "@/server/actions/account";
import { AppNav, MobileMenu } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActorPage("/app");
  const [unread] = await db()
    .select({ n: count() })
    .from(tables.notifications)
    .where(and(eq(tables.notifications.userId, actor.id), isNull(tables.notifications.readAt)));
  const kind = actor.activeOrg?.orgKind ?? null;
  const orgSwitcher =
    actor.memberships.length > 1 ? (
      <form action={switchOrganization} className="flex items-center gap-2">
        <input type="hidden" name="returnTo" value="/app" />
        <label htmlFor="org-switch" className="sr-only">
          Active organisation
        </label>
        <select id="org-switch" name="orgId" defaultValue={actor.activeOrg?.orgId} className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm">
          {actor.memberships.map((m) => (
            <option key={m.orgId} value={m.orgId}>
              {m.orgName} ({m.orgKind})
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg border border-line-strong px-3 text-sm hover:bg-sunken">
          Switch
        </button>
      </form>
    ) : actor.activeOrg ? (
      <p className="truncate text-sm font-medium text-ink">
        {actor.activeOrg.orgName} <span className="font-normal text-faint">· {actor.activeOrg.orgKind}</span>
      </p>
    ) : null;

  const walletLine = actor.wallet ? (
    <Link href="/app/wallet" className="block truncate rounded-lg bg-verify-soft px-2.5 py-1.5 text-xs text-verify hover:underline" title="Bound NEAR testnet wallet">
      ● {actor.wallet.accountId}
    </Link>
  ) : (
    <Link href="/app/wallet" className="block rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs font-medium text-warn hover:underline">
      Connect a testnet wallet
    </Link>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:min-h-dvh lg:flex-col">
        <div className="flex h-16 items-center px-5">
          <Link href="/app" aria-label="Workspace home">
            <Wordmark />
          </Link>
        </div>
        <div className="space-y-3 px-4 pb-4">
          {orgSwitcher}
          {walletLine}
        </div>
        <AppNav kind={kind} isOperator={actor.isPlatformOperator} />
        <div className="mt-auto border-t border-line p-4 text-xs text-muted">
          <p className="truncate" title={actor.email}>
            {actor.email}
          </p>
          <form action={signOut} className="mt-2">
            <button type="submit" className="text-ink-3 underline-offset-2 hover:text-ink hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileMenu kind={kind} isOperator={actor.isPlatformOperator} email={actor.email}>
              <div className="space-y-3">
                {orgSwitcher}
                {walletLine}
              </div>
            </MobileMenu>
            <Link href="/app" aria-label="Workspace home" className="scale-90">
              <Wordmark />
            </Link>
          </div>
          <div className="hidden text-sm text-muted lg:block">{actor.activeOrg ? `Signed in to ${actor.activeOrg.orgName}` : "Set up your organisation"}</div>
          <div className="flex items-center gap-2">
            <TestnetPill />
            <Link href="/app/notifications" className="relative grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-sunken" aria-label={`Notifications${unread?.n ? `, ${unread.n} unread` : ""}`}>
              <Bell className="size-[18px]" aria-hidden />
              {Boolean(unread?.n) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gold" aria-hidden />}
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
