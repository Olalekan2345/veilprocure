"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";

/**
 * Small-screen navigation in a native modal <dialog>: the page behind becomes inert, focus stays
 * inside, Escape closes it and focus returns to the menu button.
 */
export function MobileNav({ links, actions }: { links: { href: string; label: string }[]; actions: { href: string; label: string; primary?: boolean }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="vp-btn vp-btn-secondary vp-btn-sm lg:hidden"
        aria-haspopup="dialog"
        aria-controls="vp-mobile-nav"
        onClick={() => dialog.current?.showModal()}
      >
        <Menu className="size-4" aria-hidden />
        Menu
      </button>
      <dialog
        id="vp-mobile-nav"
        ref={dialog}
        className="vp-sheet"
        aria-label="Site menu"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="flex h-full flex-col px-6 pb-8 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-[0.16em] text-vp-evergreen">Menu</span>
            <button type="button" className="vp-btn vp-btn-secondary vp-btn-sm" onClick={close} aria-label="Close menu">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-8">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={close} className="block rounded-xl px-2 py-3 text-2xl font-extrabold tracking-[-0.03em] text-vp-ink hover:bg-vp-mint-soft">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto grid gap-3">
            {actions.map((a) => (
              <a key={a.href} href={a.href} className={`vp-btn ${a.primary ? "vp-btn-primary" : "vp-btn-secondary"}`}>
                {a.label}
              </a>
            ))}
            <p className="vp-small text-center">Public beta on NEAR testnet · test tokens have no monetary value</p>
          </div>
        </div>
      </dialog>
    </>
  );
}
