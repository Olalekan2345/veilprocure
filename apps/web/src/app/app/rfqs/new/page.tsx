import { CATEGORIES } from "@veilprocure/shared";
import { Callout, PageHeader } from "@/components/ui";
import { can, requireActorPage } from "@/server/authz";
import { NewRfqForm } from "./new-form";

export const metadata = { title: "New request" };

export default async function NewRfq() {
  const actor = await requireActorPage("/app/rfqs/new");
  const org = actor.activeOrg;
  if (!org || org.orgKind !== "buyer" || !can(org, "rfq:edit")) {
    return <Callout tone="neutral">You need edit rights in a buyer organisation to create requests.</Callout>;
  }
  return (
    <>
      <PageHeader eyebrow="New request" title="What do you need delivered?" description="Start with a title and category. You will define scope, rules and suppliers on the next screen; nothing is shared until you publish." />
      <NewRfqForm categories={Object.entries(CATEGORIES)} />
    </>
  );
}
