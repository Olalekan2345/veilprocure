"use client";

import { CheckCircle2, ExternalLink, Loader2, ShieldAlert, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/server/errors";
import type { IntentView } from "@/server/chain/intents";
import { Button, Callout, cx, Hash } from "@/components/ui";
import { sendIntent, WalletError } from "./wallet-client";

type Phase =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "preview"; intent: IntentView }
  | { k: "signing"; intent: IntentView }
  | { k: "confirming"; intent: IntentView; txHash: string; note?: string }
  | { k: "done"; intent: IntentView; txHash: string; message: string }
  | { k: "error"; message: string; intent?: IntentView; txHash?: string; retryable: boolean };

async function reportTx(intentId: string, txHash: string) {
  const res = await fetch(`/api/tx/${intentId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  return (await res.json()) as { ok: true; data: { status: "confirmed" | "failed" | "pending"; message: string } } | { ok: false; error: { message: string } };
}

function shortArgs(args: Record<string, unknown>): [string, string][] {
  return Object.entries(args).map(([k, v]) => {
    if (Array.isArray(v)) return [k, `${v.length} item${v.length === 1 ? "" : "s"}`];
    if (v === null) return [k, "none"];
    const s = String(v);
    return [k, s.length > 28 ? `${s.slice(0, 14)}…${s.slice(-8)}` : s];
  });
}

/**
 * One button that runs a complete, honest wallet flow: server-prepared intent → explicit preview
 * → wallet signature → server verification on chain. The UI never reports success from the
 * wallet popup alone; it waits for the server to confirm the finalised transaction.
 */
export function TxAction({
  prepare,
  label,
  variant = "primary",
  explorerBase,
  disabled,
  confirmCopy,
  icon,
}: {
  prepare: () => Promise<ActionResult<IntentView>>;
  label: string;
  variant?: "primary" | "gold" | "secondary" | "danger";
  explorerBase: string;
  disabled?: boolean;
  confirmCopy?: ReactNode;
  icon?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [manualHash, setManualHash] = useState("");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = phase.k !== "idle";

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  async function start() {
    setPhase({ k: "preparing" });
    const res = await prepare();
    if (!res.ok) return setPhase({ k: "error", message: res.error.message, retryable: true });
    setPhase({ k: "preview", intent: res.data });
  }

  async function confirm(intent: IntentView, txHash: string) {
    setPhase({ k: "confirming", intent, txHash });
    for (let attempt = 0; attempt < 12; attempt++) {
      let r;
      try {
        r = await reportTx(intent.id, txHash);
      } catch {
        r = null;
      }
      if (r && !r.ok) return setPhase({ k: "error", message: r.error.message, intent, txHash, retryable: false });
      if (r?.ok && r.data.status === "confirmed") {
        // Refresh only when the user dismisses the dialog: refreshing now can unmount this
        // component (e.g. the "Publish" card disappears) and hide the confirmation receipt.
        setPhase({ k: "done", intent, txHash, message: r.data.message });
        return;
      }
      // The failed intent is closed server-side; "Try again" prepares a fresh one.
      if (r?.ok && r.data.status === "failed") return setPhase({ k: "error", message: r.data.message, txHash, retryable: true });
      setPhase({ k: "confirming", intent, txHash, note: "Waiting for NEAR testnet to finalise the transaction…" });
      await new Promise((res) => setTimeout(res, 2500));
    }
    setPhase({
      k: "error",
      message: "The transaction was sent but is not final yet. It will be reconciled automatically; refresh this page in a minute. Do not sign again.",
      intent,
      txHash,
      retryable: false,
    });
  }

  async function sign(intent: IntentView) {
    setPhase({ k: "signing", intent });
    try {
      const hash = await sendIntent(intent);
      await confirm(intent, hash);
    } catch (err) {
      const message = err instanceof WalletError ? err.message : "The wallet request failed.";
      setPhase({ k: "error", message, intent, retryable: true });
    }
  }

  function close() {
    if (phase.k === "signing" || phase.k === "confirming") return; // never abandon an in-flight check silently
    const changedChainState = phase.k === "done" || (phase.k === "error" && Boolean(phase.txHash));
    setPhase({ k: "idle" });
    setManualHash("");
    if (changedChainState) router.refresh();
  }

  const intent = "intent" in phase ? phase.intent : undefined;

  return (
    <>
      <Button variant={variant} onClick={start} disabled={disabled || phase.k === "preparing"}>
        {phase.k === "preparing" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {label}
      </Button>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="tx-title"
        className="m-auto w-[min(560px,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="border-b border-line px-6 py-4">
          <p className="eyebrow">NEAR testnet transaction</p>
          <h2 id="tx-title" className="mt-1 text-lg font-semibold tracking-tight">
            {intent?.label ?? label}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5" aria-live="polite">
          {intent && (phase.k === "preview" || phase.k === "signing") && (
            <>
              {confirmCopy && <div className="text-sm leading-relaxed text-muted">{confirmCopy}</div>}
              <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                {(
                  [
                    ["Network", "NEAR testnet (no monetary value)"],
                    ["Signer (your wallet)", intent.signerId],
                    ["Contract", intent.receiverId],
                    ["Action", <span key="m" className="hash">{intent.methodName}</span>],
                    ["Attached deposit", <span key="d"><strong>{intent.depositLabel}</strong><span className="block text-xs text-muted">{intent.depositNote}</span></span>],
                    ["Max gas", `${(Number(BigInt(intent.gas) / 1_000_000_000_000n)).toString()} TGas`],
                    ...shortArgs(intent.args).map(([k, v]) => [`arg: ${k}`, <span key={k} className="hash">{v}</span>] as [string, ReactNode]),
                  ] as [string, ReactNode][]
                ).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[150px_1fr] gap-3 px-4 py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-relaxed text-faint">Your wallet will show the same call. Approving it is not the end: VeilProcure confirms the outcome on chain before updating anything.</p>
            </>
          )}
          {phase.k === "signing" && (
            <Callout tone="gold" icon={<Wallet className="size-4" />}>
              Approve the request in your wallet window.
            </Callout>
          )}
          {phase.k === "confirming" && (
            <Callout tone="verify" icon={<Loader2 className="size-4 animate-spin" />} title="Checking the transaction on NEAR testnet">
              <span className="block">{phase.note ?? "Verifying signer, contract, method, arguments and deposit…"}</span>
              <span className="mt-1 block">
                <Hash value={phase.txHash} label="Transaction" />
              </span>
            </Callout>
          )}
          {phase.k === "done" && (
            <Callout tone="ok" icon={<CheckCircle2 className="size-4" />} title="Confirmed on chain">
              <span className="block">{phase.message}</span>
              <a className="mt-2 inline-flex items-center gap-1 font-medium" href={`${explorerBase}/txns/${phase.txHash}`} target="_blank" rel="noreferrer">
                View on explorer <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Callout>
          )}
          {phase.k === "error" && (
            <Callout tone="bad" icon={<ShieldAlert className="size-4" />} title="Not completed">
              <span className="block">{phase.message}</span>
              {phase.txHash && (
                <a className="mt-2 inline-flex items-center gap-1 font-medium" href={`${explorerBase}/txns/${phase.txHash}`} target="_blank" rel="noreferrer">
                  Inspect transaction <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </Callout>
          )}
          {phase.k === "error" && phase.intent && !phase.txHash && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">I approved it in my wallet but this page lost track</summary>
              <div className="mt-2 flex gap-2">
                <input
                  value={manualHash}
                  onChange={(e) => setManualHash(e.target.value.trim())}
                  placeholder="Transaction hash"
                  aria-label="Transaction hash"
                  className="block w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm"
                />
                <Button variant="secondary" disabled={manualHash.length < 43} onClick={() => confirm(phase.intent!, manualHash)}>
                  Check
                </Button>
              </div>
            </details>
          )}
          {phase.k === "preparing" && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing the exact transaction…
            </p>
          )}
        </div>
        <div className={cx("flex flex-wrap justify-end gap-2 border-t border-line bg-paper/60 px-6 py-4")}>
          {(phase.k === "preview" || phase.k === "error" || phase.k === "done") && (
            <Button variant="ghost" onClick={close}>
              {phase.k === "done" ? "Close" : "Cancel"}
            </Button>
          )}
          {phase.k === "preview" && (
            <Button variant={variant === "danger" ? "danger" : "primary"} onClick={() => sign(phase.intent)}>
              <Wallet className="size-4" aria-hidden /> Sign with wallet
            </Button>
          )}
          {phase.k === "error" && phase.retryable && phase.intent && (
            <Button onClick={() => sign(phase.intent!)}>
              <Wallet className="size-4" aria-hidden /> Try again
            </Button>
          )}
          {phase.k === "error" && phase.retryable && !phase.intent && <Button onClick={start}>Try again</Button>}
        </div>
      </dialog>
    </>
  );
}
