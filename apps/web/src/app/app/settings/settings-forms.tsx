"use client";

import { useActionState } from "react";
import { updateDisplayName } from "@/server/actions/account";
import { Button, Field, inputClass } from "@/components/ui";

export function DisplayNameForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="space-y-3">
      <Field label="Display name" htmlFor="displayName">
        <input id="displayName" name="displayName" defaultValue={initial} maxLength={80} className={inputClass} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <p aria-live="polite" className="text-xs">
        {state?.ok ? <span className="text-ok">Saved.</span> : state && !state.ok ? <span className="text-bad">{state.error.message}</span> : null}
      </p>
    </form>
  );
}
