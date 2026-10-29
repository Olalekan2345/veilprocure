"use client";

import { useActionState } from "react";
import { createRfqAction } from "@/server/actions/procurement";
import { Button, Callout, Field, inputClass } from "@/components/ui";

export function NewRfqForm({ categories }: { categories: [string, string][] }) {
  const [state, action, pending] = useActionState(createRfqAction, null);
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="card max-w-2xl space-y-5 p-6 sm:p-8">
      <Field label="Title" htmlFor="title" hint="Specific and outcome-focused, e.g. “Accessibility audit of our checkout flow”." error={err?.fieldErrors?.title}>
        <input id="title" name="title" required minLength={5} maxLength={140} className={inputClass} aria-invalid={Boolean(err?.fieldErrors?.title)} />
      </Field>
      <Field label="Category" htmlFor="category" hint="VeilProcure focuses on digital services with inspectable deliverables.">
        <select id="category" name="category" className={inputClass} defaultValue="ux_ui_design">
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {err && !err.fieldErrors && <Callout tone="bad">{err.message}</Callout>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating draft…" : "Create draft"}
      </Button>
    </form>
  );
}
