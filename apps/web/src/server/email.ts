import "server-only";
import { eq } from "drizzle-orm";
import { db, tables } from "./db";
import { env } from "./env";

const t = tables;

export type DeliveryStatus = "sent" | "failed" | "not_configured";

/**
 * Every e-mail goes through the outbox. Delivery depends on EMAIL_TRANSPORT:
 *  - resend: sent via the Resend HTTP API (verified sender required);
 *  - dev-mailbox: stored only, readable at /dev/mailbox (development only, never production);
 *  - disabled: stored as not_configured. The UI must then say so and offer the authenticated
 *    copy-link workflow instead of pretending an e-mail was sent.
 */
export async function sendEmail(msg: { to: string; template: string; subject: string; text: string }): Promise<DeliveryStatus> {
  const [row] = await db()
    .insert(t.emailOutbox)
    .values({ toEmail: msg.to, template: msg.template, subject: msg.subject, bodyText: msg.text, status: "queued" })
    .returning({ id: t.emailOutbox.id });
  const id = row!.id;
  const transport = env().EMAIL_TRANSPORT;
  if (transport !== "resend") {
    await db().update(t.emailOutbox).set({ status: "not_configured" }).where(eq(t.emailOutbox.id, id));
    return "not_configured";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env().EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) throw new Error(`provider ${res.status}: ${body.message ?? "error"}`);
    await db()
      .update(t.emailOutbox)
      .set({ status: "sent", providerMessageId: body.id ?? null, attempts: 1, sentAt: new Date() })
      .where(eq(t.emailOutbox.id, id));
    return "sent";
  } catch (err) {
    await db()
      .update(t.emailOutbox)
      .set({ status: "failed", attempts: 1, lastError: err instanceof Error ? err.message.slice(0, 300) : "unknown" })
      .where(eq(t.emailOutbox.id, id));
    return "failed";
  }
}

export function emailDeliveryMode(): "resend" | "dev-mailbox" | "disabled" {
  return env().EMAIL_TRANSPORT;
}
