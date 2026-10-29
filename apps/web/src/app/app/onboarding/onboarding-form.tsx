"use client";

import { Building2, Gavel } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createOrganization } from "@/server/actions/account";
import { Button, Callout, cx, Field, inputClass } from "@/components/ui";

const KINDS = [
  {
    kind: "buyer" as const,
    icon: Building2,
    title: "I buy services",
    body: "Create requests, publish evaluation rules, invite suppliers, compare sealed quotes after the deadline, then fund and release escrow.",
  },
  {
    kind: "supplier" as const,
    icon: Gavel,
    title: "I supply services",
    body: "Respond to invitations with confidential quotes, commit them on chain before the deadline, deliver, and receive payment from escrow.",
  },
];

export function OnboardingForm({ hasMemberships, invites }: { hasMemberships: boolean; invites: { title: string; buyer: string }[] }) {
  const [kind, setKind] = useState<"buyer" | "supplier">(invites.length ? "supplier" : "buyer");
  const [state, action, pending] = useActionState(createOrganization, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push("/app");
  }, [state, router]);
  const err = state && !state.ok ? state.error : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <form action={action} className="card space-y-6 p-6 sm:p-8">
        <fieldset>
          <legend className="text-sm font-medium text-ink">How will this organisation use VeilProcure?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.kind}
                className={cx(
                  "cursor-pointer rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-verify/30",
                  kind === k.kind ? "border-ink bg-sunken/60" : "border-line hover:border-line-strong",
                )}
              >
                <input type="radio" name="kind" value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} className="sr-only" />
                <k.icon className="size-5 text-gold-ink" aria-hidden />
                <span className="mt-3 block font-semibold text-ink">{k.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">{k.body}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Organisation name" htmlFor="name" error={err?.fieldErrors?.name}>
          <input id="name" name="name" required minLength={2} maxLength={120} className={inputClass} placeholder={kind === "buyer" ? "Acme Studio Ltd" : "Northwind QA"} aria-invalid={Boolean(err?.fieldErrors?.name)} />
        </Field>
        <Field label="Website" htmlFor="website" optional error={err?.fieldErrors?.website}>
          <input id="website" name="website" type="url" className={inputClass} placeholder="https://" />
        </Field>
        {err && !err.fieldErrors && <Callout tone="bad">{err.message}</Callout>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Creating…" : `Create ${kind} organisation`}
          </Button>
          {hasMemberships && (
            <a href="/app" className="text-sm text-muted underline">
              Back to workspace
            </a>
          )}
        </div>
      </form>
      <aside className="space-y-4">
        {invites.length > 0 && (
          <Callout tone="gold" title="You were invited to quote">
            {invites.map((i) => (
              <span key={i.title} className="block">
                &ldquo;{i.title}&rdquo; from {i.buyer}
              </span>
            ))}
            <span className="mt-2 block">Open the link in your invitation e-mail. You can create your supplier organisation while accepting it.</span>
          </Callout>
        )}
        <div className="card p-5 text-sm leading-relaxed text-muted">
          <p className="font-semibold text-ink">What happens next</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Your organisation is created with you as owner.</li>
            <li>Invite teammates with owner, admin, member or viewer roles.</li>
            <li>Connect a NEAR testnet wallet when you need to sign.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
