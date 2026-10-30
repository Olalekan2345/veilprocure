/**
 * Privy identity-token verification: tokens are signed here with locally generated P-256 keys,
 * so every forgery, audience, freshness and account-shape case is exercised without Privy.
 */
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { verifyPrivyIdentityToken, type PrivyJwk, type PrivyKeySource } from "./privy";

const APP = "cmvum9d5i08qj0gifbjpora8c";
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const nowS = Math.floor(NOW / 1000);

function keyPair(kid: string): { jwk: PrivyJwk; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { jwk: { ...(publicKey.export({ format: "jwk" }) as PrivyJwk), kid, alg: "ES256", use: "sig" }, privateKey };
}

const main = keyPair("key-1");
const other = keyPair("key-1");

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
function token(claims: Record<string, unknown> = {}, opts: { key?: KeyObject; header?: Record<string, unknown> } = {}): string {
  const header = b64({ alg: "ES256", typ: "JWT", kid: "key-1", ...opts.header });
  const payload = b64({
    iss: "privy.io",
    aud: APP,
    sub: "did:privy:abc123",
    iat: nowS - 5,
    exp: nowS + 3600,
    linked_accounts: JSON.stringify([{ type: "email", address: "Buyer@Example.com", verified_at: nowS - 5 }]),
    ...claims,
  });
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), { key: opts.key ?? main.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${sig.toString("base64url")}`;
}

const keys: PrivyKeySource = async () => [main.jwk];
const verifyAt = (t: string, source: PrivyKeySource = keys) => verifyPrivyIdentityToken(t, APP, source, NOW);

describe("Privy identity token", () => {
  it("accepts a fresh token signed by the app's key and returns the verified e-mail", async () => {
    await expect(verifyAt(token())).resolves.toEqual({ privyUserId: "did:privy:abc123", email: "buyer@example.com" });
  });

  it("rejects forged, tampered or mis-addressed tokens", async () => {
    const good = token();
    const [h, , s] = good.split(".");
    const tampered = `${h}.${b64({ iss: "privy.io", aud: APP, sub: "did:privy:abc123", iat: nowS, exp: nowS + 60, linked_accounts: '[{"type":"email","address":"ceo@victim.com"}]' })}.${s}`;
    for (const bad of [
      tampered,
      token({}, { key: other.privateKey }),
      token({ aud: "another-app" }),
      token({ iss: "evil.example" }),
      token({ sub: "user-1" }),
      token({}, { header: { alg: "HS256" } }),
      token({}, { header: { alg: "none" } }),
      `${h}.${good.split(".")[1]}.`,
      "not-a-token",
    ]) {
      await expect(verifyAt(bad), bad.slice(0, 40)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("accepts only fresh tokens", async () => {
    await expect(verifyAt(token({ exp: nowS - 120 }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(verifyAt(token({ iat: nowS - 11 * 60 }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(verifyAt(token({ iat: nowS + 300 }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("requires exactly one verified e-mail account", async () => {
    await expect(verifyAt(token({ linked_accounts: JSON.stringify([{ type: "wallet", address: "0xabc" }]) }))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const two = JSON.stringify([
      { type: "email", address: "a@example.com" },
      { type: "email", address: "b@example.com" },
    ]);
    await expect(verifyAt(token({ linked_accounts: two }))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(verifyAt(token({ linked_accounts: JSON.stringify([{ type: "email", address: "not an email" }]) }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("re-fetches keys once for an unknown key id (rotation) and rejects keys it still cannot find", async () => {
    const rotated = keyPair("key-2");
    const source = vi.fn(async (refresh: boolean) => (refresh ? [main.jwk, rotated.jwk] : [main.jwk]));
    await expect(verifyAt(token({}, { key: rotated.privateKey, header: { kid: "key-2" } }), source)).resolves.toMatchObject({ email: "buyer@example.com" });
    expect(source).toHaveBeenCalledWith(true);
    await expect(verifyAt(token({}, { header: { kid: "key-9" } }), source)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
