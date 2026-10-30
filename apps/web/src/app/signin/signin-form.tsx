"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { requestSignIn } from "@/server/actions/account";
import { Button, Callout, Field, inputClass } from "@/components/ui";

export function SignInForm({ next, mode }: { next: string; mode: "resend" | "dev-mailbox" | "disabled" }) {
  const [state, action, pending] = useActionState(requestSignIn, null);

  if (state?.ok) {
    return (
      <div className="space-y-4" aria-live="polite">
        {state.data.delivery === "sent" ? (
          <Callout tone="ok" title="Check your inbox" icon={<Mail className="size-4" />}>
            We sent a sign-in link to <strong>{state.data.email}</strong>. It expires in 15 minutes.
          </Callout>
        ) : state.data.delivery === "failed" ? (
          <Callout tone="bad" title="We could not send the e-mail">
            The e-mail provider rejected the message. Nothing was sent. Try again in a minute or contact support.
          </Callout>
        ) : mode === "dev-mailbox" ? (
          <Callout tone="warn" title="E-mail delivery is not configured on this server">
            This is a local development server. The sign-in link was stored in the <Link href="/dev/mailbox">development mailbox</Link> instead of being e-mailed.
          </Callout>
        ) : (
          <Callout tone="bad" title="E-mail delivery is not configured">
            This server cannot send sign-in e-mails yet, so no link was delivered. Please contact the operator.
          </Callout>
        )}
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          Use a different address
        </Button>
      </div>
    );
  }

  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="space-y-4" noValidate data-signin="magic-link">
      <input type="hidden" name="next" value={next} />
      <Field label="Work e-mail" htmlFor="email" error={err?.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          placeholder="you@company.com"
          aria-invalid={Boolean(err?.fieldErrors?.email)}
          aria-describedby={err?.fieldErrors?.email ? "email-error" : undefined}
        />
      </Field>
      {err && !err.fieldErrors && (
        <p role="alert" className="text-sm font-medium text-bad">
          {err.message}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-faint">
        No passwords. Invited to quote? Use the address the invitation was sent to.
      </p>
    </form>
  );
}
