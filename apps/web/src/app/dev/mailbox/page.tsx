import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-chrome";
import { Badge, Callout, PageHeader } from "@/components/ui";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";

export const metadata = { title: "Development mailbox", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Local-development stand-in for an e-mail provider. Exists only when EMAIL_TRANSPORT=dev-mailbox
 * and NODE_ENV !== production (the env validator refuses dev-mailbox in production).
 */
export default async function DevMailbox() {
  if (env().EMAIL_TRANSPORT !== "dev-mailbox" || env().NODE_ENV === "production") notFound();
  const mails = await db().select().from(tables.emailOutbox).orderBy(desc(tables.emailOutbox.createdAt)).limit(50);
  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <PageHeader eyebrow="Local development only" title="Development mailbox" description="E-mail delivery is not configured on this server. Messages are stored here instead of being sent. This page does not exist in production." />
        <Callout tone="warn">Anyone with access to this development server can read these messages, including sign-in links.</Callout>
        <ul className="mt-6 space-y-3">
          {mails.length === 0 && <li className="card px-5 py-8 text-center text-sm text-muted">No messages yet.</li>}
          {mails.map((m) => (
            <li key={m.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-ink">{m.subject}</span>
                <Badge tone="warn">not sent · {m.status.replace("_", " ")}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                To {m.toEmail} · {m.createdAt.toUTCString()}
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-sunken p-3 text-xs leading-relaxed text-ink-3">
                {m.bodyText.split(/(https?:\/\/\S+)/).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} className="text-verify underline">
                      {part}
                    </a>
                  ) : (
                    part
                  ),
                )}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </PublicShell>
  );
}
