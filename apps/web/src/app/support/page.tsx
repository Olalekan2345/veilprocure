import { PublicShell } from "@/components/public-chrome";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/server/session";
import { env } from "@/server/env";
import { SupportForm } from "./support-form";

export const metadata = { title: "Support" };

export default async function Support() {
  const session = await getSession();
  const email = env().SUPPORT_EMAIL;
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <PageHeader
          eyebrow="Support"
          title="Contact us"
          description={
            <>
              Messages go to the VeilProcure operators&apos; support queue.
              {email ? <> You can also e-mail <a className="underline" href={`mailto:${email}`}>{email}</a>.</> : null} Please never send private keys or seed phrases.
            </>
          }
        />
        <SupportForm defaultEmail={session?.user.email ?? ""} />
      </div>
    </PublicShell>
  );
}
