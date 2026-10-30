"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/errors";
import { Button } from "./ui";

/** Runs a bound server action, shows its safe error inline and refreshes on success. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
  size = "md",
  successText,
  confirmText,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md";
  successText?: string;
  confirmText?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setMsg(null);
          start(async () => {
            const res = await action();
            if (res.ok) {
              if (successText) setMsg({ ok: true, text: successText });
              router.refresh();
            } else setMsg({ ok: false, text: res.error.message });
          });
        }}
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </Button>
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className={`max-w-xs text-xs ${msg.ok ? "text-ok" : "text-bad"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}

/** Re-issues an invitation; when e-mail delivery is unavailable it reveals a copyable link. */
export function ResendInvite({ action, label = "Re-send invitation" }: { action: () => Promise<ActionResult<{ delivery: string; link: string | null }>>; label?: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ text: string; link: string | null; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action();
            if (!r.ok) return setRes({ ok: false, text: r.error.message, link: null });
            setRes({
              ok: true,
              link: r.data.link,
              text:
                r.data.delivery === "sent"
                  ? "Invitation e-mailed. Older links were revoked."
                  : "E-mail delivery is not configured: share this one-time link with the supplier yourself. Older links were revoked.",
            });
          })
        }
      >
        {pending ? "Issuing…" : label}
      </Button>
      {res && (
        <span role={res.ok ? "status" : "alert"} className={`max-w-xs text-right text-xs ${res.ok ? "text-muted" : "text-bad"}`}>
          {res.text}
        </span>
      )}
      {res?.link && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-verify underline"
          onClick={async () => {
            await navigator.clipboard.writeText(res.link!);
            setCopied(true);
          }}
        >
          <Copy className="size-3" aria-hidden /> {copied ? "Copied" : "Copy invitation link"}
        </button>
      )}
    </span>
  );
}
