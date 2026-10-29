"use client";

import { Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { changeMemberRole, inviteMember } from "@/server/actions/account";
import { Button, Callout, Field, inputClass } from "@/components/ui";

export function InviteMemberForm() {
  const [state, action, pending] = useActionState(inviteMember, null);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" htmlFor="m-email">
        <input id="m-email" name="email" type="email" required className={inputClass} />
      </Field>
      <Field label="Role" htmlFor="m-role">
        <select id="m-role" name="role" className={inputClass} defaultValue="member">
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Send invitation"}
      </Button>
      <div aria-live="polite">
        {state?.ok && state.data.delivery === "sent" && <Callout tone="ok">Invitation e-mailed.</Callout>}
        {state?.ok && state.data.link && (
          <Callout tone="warn" title="E-mail delivery is not configured">
            No e-mail was sent. Share this one-time link with your teammate yourself:
            <button
              type="button"
              className="mt-2 flex items-center gap-1 font-medium underline"
              onClick={async () => {
                await navigator.clipboard.writeText(state.data.link!);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" aria-hidden /> {copied ? "Copied" : "Copy invitation link"}
            </button>
          </Callout>
        )}
        {state && !state.ok && <Callout tone="bad">{state.error.message}</Callout>}
      </div>
    </form>
  );
}

export function RoleSelect({ membershipId, role }: { membershipId: string; role: string }) {
  const [state, action, pending] = useActionState(changeMemberRole, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="membershipId" value={membershipId} />
      <span className="flex items-center gap-2">
        <label htmlFor={`role-${membershipId}`} className="sr-only">
          Role
        </label>
        <select id={`role-${membershipId}`} name="role" defaultValue={role} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm">
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Save
        </Button>
      </span>
      {state && !state.ok && (
        <span role="alert" className="text-xs text-bad">
          {state.error.message}
        </span>
      )}
    </form>
  );
}
