import { redirect } from "next/navigation";
import { CATEGORIES, CURRENCIES } from "@veilprocure/shared";
import { PageHeader } from "@/components/ui";
import { requireActorPage } from "@/server/authz";
import { listSlots, loadBuyerRfq, readDraft } from "@/server/services/rfq";
import { DraftEditor } from "./draft-editor";

export const metadata = { title: "Edit request" };

export default async function EditRfq({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActorPage(`/app/rfqs/${id}/edit`);
  const rfq = await loadBuyerRfq(actor, id, "rfq:edit");
  if (rfq.status !== "draft") redirect(`/app/rfqs/${id}`);
  const [draft, slots] = await Promise.all([readDraft(rfq), listSlots(id)]);
  return (
    <>
      <PageHeader
        eyebrow="Draft · only your organisation can see this"
        title={rfq.title}
        description="Define the scope and the rules every quote will be judged by. Hard requirements are checked by exact comparison; weights rank compliant quotes. Everything here is frozen when you publish."
      />
      <DraftEditor
        rfqId={id}
        initial={draft}
        initialDeadline={rfq.deadlineAt?.toISOString() ?? null}
        initialInvitees={slots.map((s) => s.inviteEmail)}
        categories={Object.entries(CATEGORIES)}
        currencies={CURRENCIES}
      />
    </>
  );
}
