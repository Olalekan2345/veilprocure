import { and, desc, eq } from "drizzle-orm";
import { formatNear } from "@veilprocure/shared";
import { Callout, Card, CardHeader, KeyValue, PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";
import { viewAccountBalance } from "@/server/near";
import { WalletBinder } from "./wallet-binder";

const t = tables;
export const metadata = { title: "Wallet" };

export default async function WalletPage() {
  const actor = await requireActorPage("/app/wallet");
  const history = await db()
    .select()
    .from(t.walletBindings)
    .where(and(eq(t.walletBindings.userId, actor.id)))
    .orderBy(desc(t.walletBindings.boundAt))
    .limit(10);
  let balance: bigint | null = null;
  let balanceError = false;
  if (actor.wallet) {
    try {
      balance = await viewAccountBalance(actor.wallet.accountId);
    } catch {
      balanceError = true;
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Identity"
        title="NEAR testnet wallet"
        description="Your wallet signs every on-chain step: publishing policies, committing bids, awarding, funding and releasing. VeilProcure never holds your keys and never signs on your behalf."
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title={actor.wallet ? "Bound wallet" : "Bind a wallet"} description="Binding proves control with a NEP-413 signed message: a one-time, expiring challenge tied to your account, this site and testnet. No transaction is sent." />
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {actor.wallet && (
              <KeyValue
                items={[
                  ["Account", <a key="a" className="hash text-verify hover:underline" href={`${env().NEAR_EXPLORER_URL}/address/${actor.wallet.accountId}`} target="_blank" rel="noreferrer">{actor.wallet.accountId}</a>],
                  ["Network", "NEAR testnet"],
                  ["Balance", balanceError ? "RPC unavailable" : balance === null ? "Account not found on testnet" : `${formatNear(balance, 4)} (testnet, no monetary value)`],
                ]}
              />
            )}
            <WalletBinder boundAccount={actor.wallet?.accountId ?? null} />
            <Callout tone="neutral">
              Need testnet tokens or an account? Create a testnet account in a NEAR wallet and request faucet funds from the{" "}
              <a href="https://near-faucet.io/" target="_blank" rel="noreferrer">
                NEAR testnet faucet
              </a>
              . Testnet NEAR has no monetary value.
            </Callout>
          </div>
        </Card>
        <Card>
          <CardHeader title="Binding history" description="Audited. A wallet can be bound to only one VeilProcure user at a time." />
          {history.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted">No wallet has been bound yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="px-5 py-3 sm:px-6">
                  <p className="hash text-ink">{h.accountId}</p>
                  <p className="text-xs text-muted">
                    Bound {h.boundAt.toISOString().slice(0, 16).replace("T", " ")} UTC{h.revokedAt ? ` · unbound ${h.revokedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : " · active"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
