import Link from "next/link";
import { Card, CardHeader, KeyValue, PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { signOut } from "@/server/actions/account";
import { DisplayNameForm } from "./settings-forms";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const actor = await requireActorPage("/app/settings");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your profile" />
          <div className="space-y-5 px-5 py-5 sm:px-6">
            <KeyValue items={[["E-mail (verified)", actor.email], ["Wallet", actor.wallet?.accountId ?? "Not bound"]]} />
            <DisplayNameForm initial={actor.displayName ?? ""} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Organisations" description="You can belong to buyer and supplier organisations at the same time." />
          <div className="px-5 py-5 sm:px-6">
            <KeyValue items={actor.memberships.map((m) => [m.orgName, `${m.orgKind} · ${m.role}`])} />
            <Link href="/app/onboarding" className="mt-4 inline-block text-sm font-medium text-verify underline">
              Create another organisation
            </Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Data & retention" description="Off-chain data can be deleted on request; on-chain commitments are permanent and public by design." />
          <div className="space-y-3 px-5 py-5 text-sm text-muted sm:px-6">
            <p>
              To request export or deletion of your off-chain data, contact <Link href="/support" className="underline">support</Link>. Hashes, wallet ids, amounts and timestamps already written to NEAR testnet cannot be erased.
            </p>
            <form action={signOut}>
              <button type="submit" className="font-medium text-ink underline">
                Sign out of this device
              </button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
