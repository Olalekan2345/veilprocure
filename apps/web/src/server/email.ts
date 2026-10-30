import "server-only";
import { eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { db, tables } from "./db";
import { env } from "./env";

const t = tables;

export type DeliveryStatus = "sent" | "failed" | "not_configured";

/**
 * Every e-mail goes through the outbox. Delivery depends on EMAIL_TRANSPORT:
 *  - smtp: sent through an authenticated SMTP server over TLS (e.g. Gmail with an app password);
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
  if (!emailDelivers()) {
    await db().update(t.emailOutbox).set({ status: "not_configured" }).where(eq(t.emailOutbox.id, id));
    return "not_configured";
  }
  try {
    const providerMessageId = env().EMAIL_TRANSPORT === "smtp" ? await viaSmtp(msg) : await viaResend(msg);
    await db()
      .update(t.emailOutbox)
      .set({ status: "sent", providerMessageId, attempts: 1, sentAt: new Date() })
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

type Message = { to: string; subject: string; text: string };

let smtp: Transporter | null = null;

async function viaSmtp(msg: Message): Promise<string | null> {
  const e = env();
  smtp ??= nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    requireTLS: true,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const info = await smtp.sendMail({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
  return info.messageId ?? null;
}

async function viaResend(msg: Message): Promise<string | null> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env().RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`provider ${res.status}: ${body.message ?? "error"}`);
  return body.id ?? null;
}

export function emailDeliveryMode(): "smtp" | "resend" | "dev-mailbox" | "disabled" {
  return env().EMAIL_TRANSPORT;
}

/** True when this server actually sends e-mail (otherwise links are shown for copying). */
export function emailDelivers(): boolean {
  const mode = env().EMAIL_TRANSPORT;
  return mode === "smtp" || mode === "resend";
}
