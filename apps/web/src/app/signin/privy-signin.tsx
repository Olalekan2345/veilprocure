"use client";

import { Mail } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type Privy from "@privy-io/js-sdk-core";
import { signInWithPrivy } from "@/server/actions/account";
import { Button, Callout, Field, inputClass } from "@/components/ui";

/**
 * Privy holds tokens only in memory, and never in cookies: they exist just long enough to prove
 * the e-mail address to our server, which then issues its own session. The SDK is loaded on demand
 * so no other page carries it.
 */
class MemoryStorage {
  private readonly items = new Map<string, unknown>();
  get(key: string) {
    return this.items.get(key);
  }
  put(key: string, value: unknown) {
    this.items.set(key, value);
  }
  del(key: string) {
    this.items.delete(key);
  }
  getKeys() {
    return [...this.items.keys()];
  }
}

async function createClient(appId: string): Promise<Privy> {
  const { default: PrivyClient } = await import("@privy-io/js-sdk-core");
  const client = new PrivyClient({ appId, storage: new MemoryStorage(), sessions: { cookieWriteBehavior: "never" } });
  await client.initialize();
  return client;
}

function describe(err: unknown, fallback: string): string {
  if ((err as { status?: number })?.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return fallback;
}

export function PrivySignIn({ appId, next }: { appId: string; next: string }) {
  const client = useRef<Promise<Privy> | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const privy = () => {
    client.current ??= createClient(appId).catch((err: unknown) => {
      client.current = null;
      throw err;
    });
    return client.current;
  };

  async function sendCode(address: string) {
    setPending(true);
    setError(null);
    try {
      await (await privy()).auth.email.sendCode(address);
      setEmail(address);
    } catch (err) {
      setError(describe(err, "We could not send a code to that address. Check it and try again in a minute."));
    } finally {
      setPending(false);
    }
  }

  async function onEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const address = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 160) return setError("Enter a valid e-mail address.");
    await sendCode(address);
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from the e-mail.");
    setPending(true);
    setError(null);
    try {
      const c = await privy();
      const session = await c.auth.email.loginWithCode(email!, code);
      const identityToken = session.identity_token ?? (await c.getIdentityToken());
      if (!identityToken) {
        setError("Sign-in cannot be verified: this server's Privy app does not issue identity tokens. Please contact the operator.");
        return;
      }
      const result = await signInWithPrivy(identityToken, next);
      await c.auth.logout().catch(() => undefined);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      window.location.assign(result.data.next);
    } catch (err) {
      setError(describe(err, "That code is not valid or has expired. Request a new one."));
    } finally {
      setPending(false);
    }
  }

  const alert = error && (
    <p role="alert" className="text-sm font-medium text-bad">
      {error}
    </p>
  );

  if (email) {
    return (
      <form onSubmit={onCode} className="space-y-4" noValidate>
        <Callout tone="ok" title="Check your inbox" icon={<Mail className="size-4" />}>
          We sent a 6-digit code to <strong>{email}</strong>.
        </Callout>
        <Field label="6-digit code" htmlFor="code">
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className={`${inputClass} tracking-[0.3em]`} placeholder="123456" />
        </Field>
        {alert}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Verifying…" : "Sign in"}
        </Button>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => sendCode(email)}>
            Send a new code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setEmail(null);
              setError(null);
            }}
          >
            Use a different address
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onEmail} className="space-y-4" noValidate>
      <Field label="Work e-mail" htmlFor="privy-email">
        <input id="privy-email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="you@company.com" />
      </Field>
      {alert}
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Sending code…" : "Email me a code"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-faint">No passwords. Invited to quote? Use the address the invitation was sent to.</p>
    </form>
  );
}
