"use client";

import { Link2, Loader2, Unlink, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmWalletBinding, createWalletChallenge, unbindWallet } from "@/server/actions/account";
import { Button, Callout } from "@/components/ui";
import { connect, disconnect, signBindingMessage, WalletError } from "@/components/wallet/wallet-client";

type State =
  | { k: "idle" }
  | { k: "busy"; text: string }
  | { k: "confirm"; accountId: string; reason: "replace_own" | "move_from_other_user" }
  | { k: "done"; accountId: string }
  | { k: "error"; text: string };

export function WalletBinder({ boundAccount }: { boundAccount: string | null }) {
  const [s, setS] = useState<State>({ k: "idle" });
  const router = useRouter();

  async function bind(confirmRebind: boolean, knownAccount?: string) {
    try {
      setS({ k: "busy", text: "Opening your wallet…" });
      const accountId = knownAccount ?? (await connect()).accountId;
      setS({ k: "busy", text: `Preparing a one-time challenge for ${accountId}…` });
      const ch = await createWalletChallenge({ accountId, confirmRebind });
      if (!ch.ok) return setS({ k: "error", text: ch.error.message });
      if ("needsConfirmation" in ch.data) return setS({ k: "confirm", accountId, reason: ch.data.needsConfirmation });
      setS({ k: "busy", text: "Sign the message in your wallet (no transaction, no fee)…" });
      const signed = await signBindingMessage({ accountId, message: ch.data.message, recipient: ch.data.recipient, nonceHex: ch.data.nonceHex });
      setS({ k: "busy", text: "Verifying the signature and checking the key on testnet…" });
      const res = await confirmWalletBinding({ challengeId: ch.data.challengeId, accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature });
      if (!res.ok) return setS({ k: "error", text: res.error.message });
      setS({ k: "done", accountId: res.data.accountId });
      router.refresh();
    } catch (err) {
      setS({ k: "error", text: err instanceof WalletError ? err.message : "The wallet request failed. Nothing was bound." });
    }
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {s.k === "busy" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {s.text}
        </p>
      )}
      {s.k === "error" && <Callout tone="bad">{s.text}</Callout>}
      {s.k === "done" && <Callout tone="ok">Bound {s.accountId}. Signature and full-access key verified on testnet.</Callout>}
      {s.k === "confirm" && (
        <Callout tone="warn" title={s.reason === "move_from_other_user" ? "This wallet is bound to another VeilProcure user" : "Replace your bound wallet?"}>
          <span className="block">
            {s.reason === "move_from_other_user"
              ? `Proving control of ${s.accountId} will move it to your account and notify the other user. Only continue if you control this wallet.`
              : `Your current wallet will be unbound and replaced with ${s.accountId}. Awards already on chain stay tied to the wallet that signed them.`}
          </span>
          <span className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => bind(true, s.accountId)}>
              Yes, continue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setS({ k: "idle" })}>
              Cancel
            </Button>
          </span>
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => bind(false)} disabled={s.k === "busy"} variant={boundAccount ? "secondary" : "primary"}>
          {boundAccount ? <Link2 className="size-4" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
          {boundAccount ? "Bind a different wallet" : "Connect & bind wallet"}
        </Button>
        {boundAccount && (
          <Button
            variant="ghost"
            disabled={s.k === "busy"}
            onClick={async () => {
              if (!window.confirm("Unbind this wallet? You will not be able to sign until you bind one again.")) return;
              const r = await unbindWallet();
              await disconnect();
              if (!r.ok) setS({ k: "error", text: r.error.message });
              router.refresh();
            }}
          >
            <Unlink className="size-4" aria-hidden /> Unbind
          </Button>
        )}
      </div>
    </div>
  );
}
