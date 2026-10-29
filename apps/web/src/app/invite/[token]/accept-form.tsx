"use client";

import { useActionState, useState } from "react";
import { acceptInviteAction } from "@/server/actions/procurement";
import { Button, Callout, Field, inputClass } from "@/components/ui";

export function AcceptInviteForm({ token, supplierOrgs }: { token: string; supplierOrgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null);
  const [orgId, setOrgId] = useState(supplierOrgs[0]?.id ?? "new");
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="card space-y-5 p-6 sm:p-8">
      <input type="hidden" name="token" value={token} />
      <Field label="Quote as" htmlFor="orgId" hint="Your quote, files and payouts belong to this supplier organisation.">
        <select id="orgId" name="orgId" className={inputClass} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {supplierOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="new">A new supplier organisation…</option>
        </select>
      </Field>
      {orgId === "new" && (
        <Field label="Company name" htmlFor="newOrgName" error={err?.fieldErrors?.newOrgName}>
          <input id="newOrgName" name="newOrgName" className={inputClass} required minLength={2} maxLength={120} />
        </Field>
      )}
      {err && !err.fieldErrors && <Callout tone="bad">{err.message}</Callout>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}
