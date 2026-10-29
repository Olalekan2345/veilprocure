import { PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { listPendingInvitesForEmail } from "@/server/services/supplier";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your organisation" };

export default async function Onboarding() {
  const actor = await requireActorPage("/app/onboarding");
  const invites = await listPendingInvitesForEmail(actor.email);
  return (
    <>
      <PageHeader
        eyebrow="Welcome"
        title="Set up your organisation"
        description="VeilProcure has two sides. Buyers publish requests and control payment; suppliers quote under seal and get paid through escrow. You can belong to both kinds of organisation."
      />
      <OnboardingForm hasMemberships={actor.memberships.length > 0} invites={invites.map((i) => ({ title: i.rfqTitle, buyer: i.buyerName }))} />
    </>
  );
}
