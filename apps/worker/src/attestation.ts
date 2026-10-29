/**
 * Independent verification of NEAR AI Cloud evidence, following
 * https://docs.near.ai/cloud/verification (gateway attestation, model attestations,
 * quote/nonce/signer bindings, response signatures). Every check is recorded; any failure makes
 * the whole evaluation UNVERIFIED and no quote content is sent (fail closed).
 */
import { getCollateralAndVerify, type TDReport10 } from "@phala/dcap-qvl";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256, sha384 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const VERIFICATION_POLICY_VERSION = "vp-nearai-1";
const NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AttestationEntry {
  intel_quote?: string;
  event_log?: string | unknown[];
  request_nonce?: string;
  signing_address?: string;
  signing_algo?: string;
  nvidia_payload?: string;
  info?: { tcb_info?: string | { app_compose?: string } };
}

export interface VerifiedSigner {
  role: "gateway" | "model";
  signingAddress: string;
  signingAlgo: string;
  quoteSha256: string;
  tcbStatus: string;
  gpuVerdict: string | null;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const unhex = (s: string) => new Uint8Array(Buffer.from(s.replace(/^0x/, ""), "hex"));
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export function acceptedTcb(): string[] {
  return (process.env.NEARAI_ACCEPTED_TCB ?? "UpToDate,SWHardeningNeeded").split(",").map((s) => s.trim());
}

/** RTMR3 replay: rtmr = sha384(rtmr || sha384(u32le(type) ":" event ":" payload)). */
export function replayRtmr3(eventLog: unknown[]): { rtmr3: Uint8Array; error: string | null } {
  let rtmr = new Uint8Array(48);
  for (const raw of eventLog) {
    const e = raw as { imr?: number; event_type?: number; event?: string; event_payload?: string; digest?: string };
    if (e.imr !== 3) continue;
    const type = new Uint8Array(4);
    new DataView(type.buffer).setUint32(0, e.event_type ?? 0, true);
    const digest = sha384(Buffer.concat([type, Buffer.from(":"), Buffer.from(e.event ?? "", "utf8"), Buffer.from(":"), Buffer.from(e.event_payload ?? "", "hex")]));
    if (e.digest && e.digest.toLowerCase() !== hex(digest)) return { rtmr3: rtmr, error: `event "${e.event}" digest mismatch` };
    rtmr = sha384(Buffer.concat([rtmr, digest]));
  }
  return { rtmr3: rtmr, error: null };
}

/** Expected 32-byte signer binding: ecdsa = 20-byte address + 12 zero bytes; ed25519 = 32-byte key. */
export function signerBinding(signingAddress: string, algo: string): Uint8Array | null {
  const id = unhex(signingAddress);
  if (algo === "ecdsa" && id.length === 20) return Uint8Array.from([...id, ...new Uint8Array(12)]);
  if (algo === "ed25519" && id.length === 32) return id;
  return null;
}

/** Verifies one TDX attestation entry (gateway or model candidate) against our nonce. */
export async function verifyEntry(entry: AttestationEntry, nonceHex: string, role: "gateway" | "model"): Promise<{ checks: Check[]; signer: VerifiedSigner | null }> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name: `${role}: ${name}`, ok, detail });
    return ok;
  };
  if (!add("quote present", Boolean(entry.intel_quote), entry.intel_quote ? "intel_quote returned" : "missing intel_quote")) return { checks, signer: null };
  const quote = unhex(entry.intel_quote!);
  const quoteSha256 = hex(sha256(quote));
  let td: TDReport10 | null = null;
  let tcbStatus = "Unknown";
  try {
    const vr = await getCollateralAndVerify(Buffer.from(quote));
    tcbStatus = vr.status;
    td = vr.report.asTd10() ?? vr.report.asTd15()?.base ?? vr.report.asTd15Ex()?.base.base ?? null;
    add("Intel DCAP quote signature & collateral", true, `verified with dcap-qvl; TCB ${vr.status}${vr.advisory_ids.length ? `; advisories ${vr.advisory_ids.join(",")}` : ""}`);
  } catch (err) {
    add("Intel DCAP quote signature & collateral", false, err instanceof Error ? err.message.slice(0, 200) : "verification error");
    return { checks, signer: null };
  }
  let ok = add("TCB status accepted by policy", acceptedTcb().includes(tcbStatus), `${tcbStatus}; accepted: ${acceptedTcb().join(", ")}`);
  if (!td) return { checks: [...checks, { name: `${role}: TDX report`, ok: false, detail: "not a TDX quote" }], signer: null };
  ok = add("not a debug TD", (td.tdAttributes[0]! & 1) === 0, "td_attributes debug bit clear") && ok;

  const algo = entry.signing_algo ?? "";
  const binding = entry.signing_address ? signerBinding(entry.signing_address, algo) : null;
  ok = add("signer identity well-formed", binding !== null, `${algo} ${entry.signing_address ?? "(none)"}`) && ok;
  const nonce = unhex(nonceHex);
  ok = add("report_data binds signer", binding !== null && eq(td.reportData.slice(0, 32), binding), "report_data[0..32] equals signing identity") && ok;
  ok = add("report_data binds our fresh nonce", eq(td.reportData.slice(32, 64), nonce), "report_data[32..64] equals client nonce") && ok;
  ok = add("echoed nonce matches", (entry.request_nonce ?? "").toLowerCase() === nonceHex.toLowerCase(), "request_nonce equals client nonce") && ok;

  let appCompose: string | null = null;
  try {
    const tcb = typeof entry.info?.tcb_info === "string" ? (JSON.parse(entry.info.tcb_info) as { app_compose?: string }) : entry.info?.tcb_info;
    appCompose = tcb?.app_compose ?? null;
  } catch {
    appCompose = null;
  }
  if (appCompose !== null) {
    const expected = Uint8Array.from([1, ...sha256(Buffer.from(appCompose, "utf8")), ...new Uint8Array(15)]);
    ok = add("MRCONFIGID matches app_compose", eq(td.mrConfigId, expected), "0x01 || sha256(app_compose) || 15 zero bytes") && ok;
  } else {
    ok = add("MRCONFIGID matches app_compose", false, "app_compose missing") && ok;
  }

  try {
    const events = typeof entry.event_log === "string" ? (JSON.parse(entry.event_log) as unknown[]) : (entry.event_log ?? []);
    const { rtmr3, error } = replayRtmr3(events);
    ok = add("RTMR3 event-log replay", !error && eq(rtmr3, td.rtMr3), error ?? "replayed RTMR3 equals quote RTMR3") && ok;
  } catch {
    ok = add("RTMR3 event-log replay", false, "event_log not parseable") && ok;
  }

  let gpuVerdict: string | null = null;
  if (role === "model") {
    if (!entry.nvidia_payload) {
      ok = add("NVIDIA GPU evidence", false, "policy requires GPU evidence for model reports; none returned") && ok;
    } else {
      try {
        const payload = JSON.parse(entry.nvidia_payload) as { nonce?: unknown };
        const nonceOk = typeof payload.nonce === "string" && payload.nonce.toLowerCase() === nonceHex.toLowerCase();
        ok = add("GPU evidence binds our nonce", nonceOk, "nvidia_payload.nonce equals client nonce") && ok;
        if (nonceOk) {
          const res = await fetch(NRAS_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: entry.nvidia_payload, signal: AbortSignal.timeout(30_000) });
          const body = (await res.json()) as unknown[];
          const jwt = Array.isArray(body) && Array.isArray(body[0]) && body[0][0] === "JWT" ? String(body[0][1]) : "";
          const claims = jwt ? (JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>) : {};
          const pass = claims["x-nvidia-overall-att-result"] === true;
          gpuVerdict = pass ? "NRAS overall attestation true" : "NRAS verdict not true";
          ok = add("NVIDIA NRAS verdict", pass, gpuVerdict) && ok;
        }
      } catch (err) {
        ok = add("NVIDIA NRAS verdict", false, err instanceof Error ? err.message.slice(0, 160) : "NRAS error") && ok;
      }
    }
  }
  return { checks, signer: ok ? { role, signingAddress: entry.signing_address!.toLowerCase(), signingAlgo: algo, quoteSha256, tcbStatus, gpuVerdict } : null };
}

/** EIP-191 personal_sign recovery → lowercase 0x address. */
export function recoverEip191(text: string, signatureHex: string): string | null {
  try {
    const sig = unhex(signatureHex);
    if (sig.length !== 65) return null;
    const msg = Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(text, "utf8")}`), Buffer.from(text, "utf8")]);
    const digest = keccak_256(msg);
    const v = sig[64]! >= 27 ? sig[64]! - 27 : sig[64]!;
    const recovered = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact").addRecoveryBit(v).recoverPublicKey(digest);
    const uncompressed = recovered.toBytes(false);
    return `0x${hex(keccak_256(uncompressed.slice(1)).slice(-20))}`;
  } catch {
    return null;
  }
}
