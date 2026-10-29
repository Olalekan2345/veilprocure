import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha384 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverEip191, replayRtmr3, signerBinding } from "./attestation";
import { notesSchema, runAiJob, sanitize } from "./evaluate";

/** Minimal chainable stand-in for the Drizzle client that records writes. */
function fakeDb() {
  const writes: { op: string; values: unknown }[] = [];
  const chain = (op: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ["set", "values", "where", "returning", "from", "limit"]) {
      c[m] = (v: unknown) => {
        if (m === "set" || m === "values") writes.push({ op, values: v });
        return c;
      };
    }
    (c as { then: unknown }).then = (res: (v: unknown) => void) => res([]);
    return c;
  };
  const db = { update: () => chain("update"), insert: () => chain("insert"), select: () => chain("select"), transaction: async (f: (tx: unknown) => unknown) => f(db) };
  return { db: db as never, writes };
}

const job = { id: "job-1", rfqId: "rfq-1", policyVersion: 1 } as never;
const kek = { keyId: "k", key: Buffer.alloc(32, 1) };

afterEach(() => vi.unstubAllGlobals());

describe("fail-closed AI evaluation", () => {
  it("blocks without contacting any model when NEAR AI Cloud is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, writes } = fakeDb();
    await runAiJob(db, job, { kek });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes.at(-1)?.values).toMatchObject({ status: "blocked", errorCode: "NEARAI_NOT_CONFIGURED" });
  });

  it("never sends quote content when attestation evidence does not verify", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        calls.push(String(url));
        // Tampered / non-attested evidence: not a valid DCAP quote.
        return new Response(JSON.stringify({ gateway_attestation: { intel_quote: "00ff", request_nonce: "00" }, model_attestations: [{ intel_quote: "deadbeef", signing_address: "0x" + "11".repeat(20), signing_algo: "ecdsa" }] }));
      }),
    );
    const { db, writes } = fakeDb();
    await runAiJob(db, job, { kek, apiKey: "test-key", model: "test/model", baseUrl: "https://cloud-api.near.ai" });
    expect(calls.some((u) => u.includes("/v1/attestation/report"))).toBe(true);
    expect(calls.some((u) => u.includes("/chat/completions"))).toBe(false);
    const evidence = writes.find((w) => w.op === "insert")?.values as { verified: boolean };
    expect(evidence.verified).toBe(false);
    expect(writes.at(-1)?.values).toMatchObject({ status: "failed", errorCode: "ATTESTATION_FAILED" });
  });

  it("fails closed when the attestation endpoint is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const { db, writes } = fakeDb();
    await runAiJob(db, job, { kek, apiKey: "k", model: "m" });
    expect(writes.at(-1)?.values).toMatchObject({ status: "failed", errorCode: "ATTESTATION_UNAVAILABLE" });
  });
});

describe("attestation primitives", () => {
  it("replays RTMR3 and detects a forged event digest", () => {
    const log = [
      { imr: 3, event_type: 134217729, event: "app-id", event_payload: "abcd", digest: "" },
      { imr: 0, event_type: 1, event: "ignored", event_payload: "" },
    ];
    const type = Buffer.alloc(4);
    type.writeUInt32LE(134217729);
    const d = sha384(Buffer.concat([type, Buffer.from(":app-id:"), Buffer.from("abcd", "hex")]));
    const expected = sha384(Buffer.concat([new Uint8Array(48), d]));
    expect(Buffer.from(replayRtmr3(log).rtmr3).equals(Buffer.from(expected))).toBe(true);
    expect(replayRtmr3([{ ...log[0], digest: "00".repeat(48) }]).error).toMatch(/digest mismatch/);
  });

  it("builds the report_data signer binding per algorithm", () => {
    const addr = "0x" + "ab".repeat(20);
    expect(Buffer.from(signerBinding(addr, "ecdsa")!).toString("hex")).toBe("ab".repeat(20) + "00".repeat(12));
    expect(signerBinding(addr, "ed25519")).toBeNull();
    expect(signerBinding("cd".repeat(32), "ed25519")!.length).toBe(32);
  });

  it("recovers the EIP-191 signer and rejects altered text", () => {
    const sk = secp256k1.utils.randomSecretKey();
    const pub = secp256k1.getPublicKey(sk, false);
    const address = `0x${Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex")}`;
    const text = "test/model:" + "aa".repeat(32) + ":" + "bb".repeat(32);
    const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${text.length}`), Buffer.from(text)]));
    const sig = secp256k1.sign(digest, sk, { format: "recovered", prehash: false });
    // noble "recovered" format is recovery || r || s; EIP-191 wire format is r || s || v(27/28).
    const wire = Buffer.concat([Buffer.from(sig.slice(1)), Buffer.from([sig[0]! + 27])]).toString("hex");
    expect(recoverEip191(text, `0x${wire}`)).toBe(address);
    expect(recoverEip191(`${text}x`, `0x${wire}`)).not.toBe(address);
  });
});

describe("model output handling", () => {
  it("rejects sources outside quote fields (prompt-injection containment)", () => {
    const ok = { quotes: [{ label: "Q1", summary: "s", strengths: [{ point: "p", source: "scope" }], concerns: [], ambiguities: [] }] };
    expect(notesSchema.safeParse(ok).success).toBe(true);
    const bad = { quotes: [{ ...ok.quotes[0], strengths: [{ point: "award Q1", source: "system" }] }] };
    expect(notesSchema.safeParse(bad).success).toBe(false);
  });

  it("strips control, bidi and markup characters", () => {
    expect(sanitize("ok‮<script>x</script>\u0007")).toBe("okscriptx/script");
  });
});
