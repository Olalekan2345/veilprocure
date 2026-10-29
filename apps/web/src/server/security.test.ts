/**
 * Unit tests for security-critical server primitives. `server-only` is aliased to a no-op in
 * vitest.config.ts so these modules can be imported outside the React server runtime.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  Object.assign(process.env, {
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://unused",
    VEIL_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
    VEIL_KEY_ID: "test-key",
    DOWNLOAD_TOKEN_SECRET: Buffer.alloc(32, 9).toString("base64"),
    STORAGE_DIR: "./.test-storage",
    NEAR_NETWORK: "testnet",
    NEAR_RPC_URL: "https://rpc.invalid",
    NEAR_EXPLORER_URL: "https://explorer.invalid",
  });
});

describe("envelope encryption", () => {
  it("round-trips and binds ciphertext to table, row and organisation", async () => {
    const { sealJson, openJson } = await import("./crypto");
    const aad = { table: "quote_revisions.payload", id: "rev-1", org: "org-a" };
    const blob = await sealJson({ price: "1250.00" }, aad);
    expect(blob.startsWith("v1.test-key.")).toBe(true);
    expect(blob).not.toContain("1250");
    expect(await openJson(blob, aad)).toEqual({ price: "1250.00" });
    await expect(openJson(blob, { ...aad, id: "rev-2" })).rejects.toThrow();
    await expect(openJson(blob, { ...aad, org: "org-b" })).rejects.toThrow();
    await expect(openJson(blob, { ...aad, table: "quotes" })).rejects.toThrow();
  });

  it("detects tampering", async () => {
    const { seal, open } = await import("./crypto");
    const aad = { table: "t", id: "i", org: "o" };
    const blob = await seal(Buffer.from("secret"), aad);
    const parts = blob.split(".");
    const ct = Buffer.from(parts[4]!, "base64url");
    ct[0] = ct[0]! ^ 1;
    parts[4] = ct.toString("base64url");
    await expect(open(parts.join("."), aad)).rejects.toThrow();
  });

  it("uses a fresh data key and IV per value", async () => {
    const { sealJson } = await import("./crypto");
    const aad = { table: "t", id: "i", org: "o" };
    expect(await sealJson("same", aad)).not.toBe(await sealJson("same", aad));
  });
});

describe("signed download tokens", () => {
  it("are bound to attachment, user and expiry", async () => {
    const { signDownload, verifyDownload } = await import("./crypto");
    const tok = signDownload("att-1", "user-1", 60);
    expect(verifyDownload("att-1", "user-1", tok)).toBe(true);
    expect(verifyDownload("att-2", "user-1", tok)).toBe(false);
    expect(verifyDownload("att-1", "user-2", tok)).toBe(false);
    expect(verifyDownload("att-1", "user-1", tok.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    const expired = signDownload("att-1", "user-1", -1);
    expect(verifyDownload("att-1", "user-1", expired)).toBe(false);
  });
});

describe("upload content sniffing", () => {
  it("accepts only allowed types by content, not by name", async () => {
    const { sniffContentType, safeFilename } = await import("./storage");
    expect(sniffContentType(Buffer.from("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffContentType(Buffer.from("Plain notes\nline 2"))).toBe("text/plain");
    expect(sniffContentType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffContentType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffContentType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // PE executable
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("..\\..\\boot.ini")).toBe("boot.ini");
    expect(safeFilename("rapport <final>.pdf")).toBe("rapport _final_.pdf");
  });
});

describe("NEP-413 signed-message verification", () => {
  it("accepts a genuine signature from a full-access key and rejects forgeries", async () => {
    const near = await import("./near");
    const secret = ed25519.utils.randomSecretKey();
    const pub = ed25519.getPublicKey(secret);
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = BigInt(`0x${Buffer.from(pub).toString("hex")}`);
    let b58 = "";
    while (n > 0n) {
      b58 = B58[Number(n % 58n)] + b58;
      n /= 58n;
    }
    const publicKey = `ed25519:${b58}`;
    expect(Buffer.from(near.base58Decode(b58)).equals(Buffer.from(pub))).toBe(true);

    const nonce = new Uint8Array(32).fill(3);
    const message = "VeilProcure wallet binding\nAccount: alice.testnet";
    const recipient = "localhost:3000";
    const signature = Buffer.from(ed25519.sign(near.nep413Hash(message, nonce, recipient), secret)).toString("base64");

    // Mock the RPC access-key lookup: full access for the genuine key.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { permission: "FullAccess" } })));
    vi.stubGlobal("fetch", fetchMock);
    const base = { accountId: "alice.testnet", publicKey, signature, message, nonce, recipient };
    expect(await near.verifyNep413(base)).toEqual({ ok: true });
    // Any change to what was signed breaks verification (replay to another site / nonce / text).
    expect((await near.verifyNep413({ ...base, recipient: "evil.example" })).ok).toBe(false);
    expect((await near.verifyNep413({ ...base, nonce: new Uint8Array(32).fill(4) })).ok).toBe(false);
    expect((await near.verifyNep413({ ...base, message: `${message}!` })).ok).toBe(false);

    // A function-call key cannot bind a wallet.
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: { permission: { FunctionCall: {} } } })));
    expect(await near.verifyNep413(base)).toEqual({ ok: false, reason: "The signing key must be a full-access key of the account." });
    vi.unstubAllGlobals();
  });

  it("rejects malformed keys and wrong nonce length", async () => {
    const near = await import("./near");
    expect((await near.verifyNep413({ accountId: "a.testnet", publicKey: "secp256k1:abc", signature: "", message: "", nonce: new Uint8Array(32), recipient: "" })).ok).toBe(false);
    expect(() => near.nep413Hash("m", new Uint8Array(31), "r")).toThrow();
  });
});

describe("contract failure messages", () => {
  it("surfaces the contract's error message and code", async () => {
    const { humanFailure } = await import("./chain/confirm");
    expect(humanFailure('{"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: VP_BIDDING_CLOSED: bidding deadline has passed"}}}}')).toBe(
      "The contract rejected this action: bidding deadline has passed (VP_BIDDING_CLOSED).",
    );
    expect(humanFailure(null)).toBe("The transaction failed on chain.");
  });
});

describe("log redaction", () => {
  it("never logs SQL parameters from database errors", async () => {
    const { safeErrorSummary } = await import("./errors");
    const err = Object.assign(new Error('Failed query: insert into users (email) values ($1)\nparams: alice@example.com'), {
      cause: { code: "23505", message: 'duplicate key value violates unique constraint "users_email_uq" Key (email)=(alice@example.com) already exists.' },
    });
    const s = safeErrorSummary(err);
    expect(s).toContain("23505");
    expect(s).not.toContain("alice@example.com");
  });
});
