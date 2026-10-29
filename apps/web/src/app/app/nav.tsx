"use client";

import { Activity, ArrowLeftRight, FileText, Gavel, LayoutDashboard, Menu, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

type Kind = "buyer" | "supplier" | null;

function items(kind: Kind, isOperator: boolean) {
  const list: { href: string; label: string; icon: typeof Activity }[] = [{ href: "/app", label: "Overview", icon: LayoutDashboard }];
  if (kind === "buyer") list.push({ href: "/app/rfqs", label: "Requests", icon: FileText });
  if (kind === "supplier") list.push({ href: "/app/bids", label: "Invitations & bids", icon: Gavel });
  if (kind) {
    list.push(
      { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/app/activity", label: "Audit trail", icon: Activity },
      { href: "/app/team", label: "Team", icon: Users },
    );
  }
  list.push({ href: "/app/wallet", label: "Wallet", icon: Wallet }, { href: "/app/settings", label: "Settings", icon: Settings });
  if (isOperator) list.push({ href: "/admin", label: "Operator console", icon: ShieldCheck });
  return list;
}

function NavList({ kind, isOperator, onNavigate }: { kind: Kind; isOperator: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Workspace" className="px-3">
      <ul className="space-y-0.5">
        {items(kind, isOperator).map((it) => {
          const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-ink text-paper" : "text-ink-3 hover:bg-sunken hover:text-ink",
                )}
              >
                <it.icon className="size-4 shrink-0" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppNav({ kind, isOperator }: { kind: Kind; isOperator: boolean }) {
  return <NavList kind={kind} isOperator={isOperator} />;
}

export function MobileMenu({ kind, isOperator, email, children }: { kind: Kind; isOperator: boolean; email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg hover:bg-sunken" aria-label="Open menu" aria-expanded={open}>
        <Menu className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col overflow-y-auto bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="text-sm font-semibold">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-sunken" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="px-4 pb-4">{children}</div>
            <NavList kind={kind} isOperator={isOperator} onNavigate={() => setOpen(false)} />
            <p className="mt-auto truncate border-t border-line p-4 text-xs text-muted">{email}</p>
          </div>
        </div>
      )}
    </>
  );
}
