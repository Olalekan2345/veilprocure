"use client";

import { useActionState } from "react";
import { submitSupportTicket } from "@/server/actions/account";
import { Button, Callout, Field, inputClass } from "@/components/ui";

export function SupportForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState(submitSupportTicket, null);
  if (state?.ok) return <Callout tone="ok" title="Message received">It is in the support queue. We reply to the address you gave.</Callout>;
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="card space-y-5 p-6 sm:p-8">
      <Field label="Your e-mail" htmlFor="s-email" error={err?.fieldErrors?.email}>
        <input id="s-email" name="email" type="email" defaultValue={defaultEmail} required className={inputClass} />
      </Field>
      <Field label="Subject" htmlFor="s-subject" error={err?.fieldErrors?.subject}>
        <input id="s-subject" name="subject" required minLength={3} maxLength={140} className={inputClass} />
      </Field>
      <Field label="Message" htmlFor="s-body" error={err?.fieldErrors?.body}>
        <textarea id="s-body" name="body" rows={6} required minLength={10} maxLength={5000} className={inputClass} />
      </Field>
      {err && !err.fieldErrors && <Callout tone="bad">{err.message}</Callout>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to support"}
      </Button>
    </form>
  );
}
