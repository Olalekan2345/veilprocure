"use client";

import { Link2, Loader2, Unlink, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmWalletBinding,
  createWalletChallenge,
  unbindWallet,
} from "@/server/actions/account";
import { Button, Callout } from "@/components/ui";
import {
  connect,
  disconnect,
  signBindingMessage,
  WalletError,
} from "@/components/wallet/wallet-client";

type State =
  | { k: "idle" }
  | { k: "busy"; text: string }
  | {
      k: "confirm";
      accountId: string;
      reason: "replace_own" | "move_from_other_user";
    }
  | { k: "done"; accountId: string }
  | { k: "error"; text: string };

export function WalletBinder({
  boundAccount,
}: {
  boundAccount: string | null;
}) {
  const [s, setS] = useState<State>({ k: "idle" });
  const [connectedWallet, setConnectedWallet] = useState<{
    accountId: string;
    wallet: any;
  } | null>(null);
  const router = useRouter();

  // Step 1: Connect wallet (no signing, just establish connection)
  async function connectWallet() {
    try {
      setS({ k: "busy", text: "Opening your wallet…" });
      const { wallet, accountId } = await connect();
      setConnectedWallet({ accountId, wallet });
      setS({ k: "idle" });
      return accountId;
    } catch (err) {
      setS({
        k: "error",
        text:
          err instanceof WalletError
            ? err.message
            : "Failed to connect wallet.",
      });
      return null;
    }
  }

  // Step 2: Bind the connected wallet (requires signing)
  async function bindWallet(confirmRebind: boolean, accountId: string) {
    try {
      setS({
        k: "busy",
        text: `Preparing a one-time challenge for ${accountId}…`,
      });
      const ch = await createWalletChallenge({ accountId, confirmRebind });
      if (!ch.ok) return setS({ k: "error", text: ch.error.message });
      if ("needsConfirmation" in ch.data)
        return setS({
          k: "confirm",
          accountId,
          reason: ch.data.needsConfirmation,
        });
      setS({
        k: "busy",
        text: "Sign the message in your wallet (no transaction, no fee)…",
      });
      const signed = await signBindingMessage({
        accountId,
        message: ch.data.message,
        recipient: ch.data.recipient,
        nonceHex: ch.data.nonceHex,
      });
      setS({
        k: "busy",
        text: "Verifying the signature and checking the key on testnet…",
      });
      const res = await confirmWalletBinding({
        challengeId: ch.data.challengeId,
        accountId: signed.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
      });
      if (!res.ok) return setS({ k: "error", text: res.error.message });
      setS({ k: "done", accountId: res.data.accountId });
      setConnectedWallet(null);
      router.refresh();
    } catch (err) {
      setS({
        k: "error",
        text:
          err instanceof WalletError
            ? err.message
            : "The wallet request failed. Nothing was bound.",
      });
    }
  }

  // Combined flow: Connect then bind
  async function connectAndBind(confirmRebind: boolean) {
    const accountId = await connectWallet();
    if (accountId) {
      await bindWallet(confirmRebind, accountId);
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
      {s.k === "done" && (
        <Callout tone="ok">
          Bound {s.accountId}. Signature and full-access key verified on
          testnet.
        </Callout>
      )}
      {s.k === "confirm" && (
        <Callout
          tone="warn"
          title={
            s.reason === "move_from_other_user"
              ? "This wallet is bound to another VeilProcure user"
              : "Replace your bound wallet?"
          }
        >
          <span className="block">
            {s.reason === "move_from_other_user"
              ? `Proving control of ${s.accountId} will move it to your account and notify the other user. Only continue if you control this wallet.`
              : `Your current wallet will be unbound and replaced with ${s.accountId}. Awards already on chain stay tied to the wallet that signed them.`}
          </span>
          <span className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => bindWallet(true, s.accountId)}>
              Yes, continue
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setS({ k: "idle" })}
            >
              Cancel
            </Button>
          </span>
        </Callout>
      )}

      {!boundAccount && !connectedWallet && (
        <Callout tone="neutral">
          <strong>Recommended:</strong> Use{" "}
          <a
            href="https://wallet.meteorwallet.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Meteor Wallet (web version)
          </a>{" "}
          for best compatibility. Intear Wallet also works on testnet; HOT
          Wallet does not support testnet. Mobile wallets via QR code may have
          limited permissions.
        </Callout>
      )}

      <div className="flex flex-wrap gap-2">
        {!connectedWallet ? (
          <Button
            onClick={connectWallet}
            disabled={s.k === "busy"}
            variant={boundAccount ? "secondary" : "primary"}
          >
            <Wallet className="size-4" aria-hidden />
            Connect wallet
          </Button>
        ) : (
          <>
            <div className="w-full">
              <Callout tone="ok">
                Wallet connected: <strong>{connectedWallet.accountId}</strong>
              </Callout>
            </div>
            <Button
              onClick={() => bindWallet(false, connectedWallet.accountId)}
              disabled={s.k === "busy"}
              variant="primary"
            >
              <Link2 className="size-4" aria-hidden />
              Bind this wallet
            </Button>
            <Button
              onClick={() => setConnectedWallet(null)}
              disabled={s.k === "busy"}
              variant="ghost"
            >
              Cancel
            </Button>
          </>
        )}
        {boundAccount && !connectedWallet && (
          <Button
            variant="ghost"
            disabled={s.k === "busy"}
            onClick={async () => {
              if (
                !window.confirm(
                  "Unbind this wallet? You will not be able to sign until you bind one again.",
                )
              )
                return;
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
