import { desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { markNotificationsReadAction } from "@/server/actions/procurement";
import { requireActorPage } from "@/server/authz";
import { db, tables } from "@/server/db";

const t = tables;
export const metadata = { title: "Notifications" };

export default async function Notifications() {
  const actor = await requireActorPage("/app/notifications");
  const items = await db().select().from(t.notifications).where(eq(t.notifications.userId, actor.id)).orderBy(desc(t.notifications.createdAt)).limit(50);
  return (
    <>
      <PageHeader title="Notifications" actions={items.some((n) => !n.readAt) && <ActionButton action={markNotificationsReadAction} label="Mark all read" size="sm" />} />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<Bell className="size-5" />} title="Nothing here yet">
            You will be notified when suppliers accept invitations, when wallets move, and about escrow steps that need you.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="px-5 py-4 sm:px-6">
                <p className="flex items-center gap-2 font-medium text-ink">
                  {!n.readAt && <span className="size-2 rounded-full bg-gold" aria-label="Unread" />}
                  {n.linkPath ? <Link href={n.linkPath} className="hover:underline">{n.title}</Link> : n.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-xs text-faint">{n.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
