import "server-only";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalJson, concat, u32le, utf8 } from "@veilprocure/shared";
import { env } from "./env";
import { AppError } from "./errors";

// ------------------------------------------------------------------ JSON-RPC

export class RpcError extends Error {
  constructor(
    message: string,
    readonly name_: string | undefined,
    readonly cause_: unknown,
  ) {
    super(message);
  }
}

async function rpc<T>(method: string, params: unknown, timeoutMs = 15_000): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(env().NEAR_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "veilprocure", method, params }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`RPC HTTP ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { name?: string; cause?: { name?: string; info?: unknown }; message?: string; data?: unknown } };
      if (body.error) {
        throw new RpcError(
          body.error.cause?.name ?? body.error.message ?? "RPC error",
          body.error.cause?.name ?? body.error.name,
          body.error.cause?.info ?? body.error.data,
        );
      }
      return body.result as T;
    } catch (err) {
      if (err instanceof RpcError) throw err; // deterministic RPC errors are not retried
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new RpcError(lastErr instanceof Error ? lastErr.message : "RPC unavailable", "RPC_UNAVAILABLE", lastErr);
}

export async function viewFunction<T>(contractId: string, methodName: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString("utf8")) as T;
}

export async function viewAccessKey(accountId: string, publicKey: string): Promise<"FullAccess" | "FunctionCall" | null> {
  try {
    const r = await rpc<{ permission: "FullAccess" | { FunctionCall: unknown } }>("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKey,
    });
    return r.permission === "FullAccess" ? "FullAccess" : "FunctionCall";
  } catch (err) {
    if (err instanceof RpcError && /UNKNOWN_ACCESS_KEY|UNKNOWN_ACCOUNT/.test(`${err.name_} ${err.message}`)) return null;
    throw err;
  }
}

export async function viewAccountBalance(accountId: string): Promise<bigint | null> {
  try {
    const r = await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId });
    return BigInt(r.amount);
  } catch (err) {
    if (err instanceof RpcError && /UNKNOWN_ACCOUNT/.test(`${err.name_} ${err.message}`)) return null;
    throw err;
  }
}

export async function networkStatus(): Promise<{ chainId: string; latestBlockHeight: number; latestBlockTime: string }> {
  const s = await rpc<{ chain_id: string; sync_info: { latest_block_height: number; latest_block_time: string } }>("status", []);
  return { chainId: s.chain_id, latestBlockHeight: s.sync_info.latest_block_height, latestBlockTime: s.sync_info.latest_block_time };
}

// ------------------------------------------------------------------ NEP-413

const NEP413_TAG = 2 ** 31 + 413;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function borshString(s: string): Uint8Array {
  const b = utf8(s);
  return concat(u32le(b.length), b);
}

/** sha256(borsh(u32 tag) || borsh({message, nonce[32], recipient, callbackUrl: None})). */
export function nep413Hash(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  if (nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  return sha256(concat(u32le(NEP413_TAG), borshString(message), nonce, borshString(recipient), new Uint8Array([0])));
}

function decodeSignature(sig: string): Uint8Array {
  const b64 = Buffer.from(sig, "base64");
  if (b64.length === 64) return new Uint8Array(b64);
  const stripped = sig.startsWith("ed25519:") ? sig.slice(8) : sig;
  const b58 = base58Decode(stripped);
  if (b58.length === 64) return b58;
  throw new Error("signature must be 64 bytes (base64 or base58)");
}

/**
 * Verifies a NEP-413 signed message and that the signing key is a *full-access* key of the
 * claimed account on the configured network (so a dapp-scoped function-call key cannot bind).
 */
export async function verifyNep413(input: {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  nonce: Uint8Array;
  recipient: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!input.publicKey.startsWith("ed25519:")) return { ok: false, reason: "Only ed25519 wallet keys are supported." };
  let pub: Uint8Array;
  let sig: Uint8Array;
  try {
    pub = base58Decode(input.publicKey.slice(8));
    sig = decodeSignature(input.signature);
  } catch {
    return { ok: false, reason: "Malformed public key or signature." };
  }
  if (pub.length !== 32) return { ok: false, reason: "Malformed public key." };
  const valid = ed25519.verify(sig, nep413Hash(input.message, input.nonce, input.recipient), pub);
  if (!valid) return { ok: false, reason: "Signature does not match the challenge." };
  const permission = await viewAccessKey(input.accountId, input.publicKey);
  if (permission === null) return { ok: false, reason: `This key is not registered on ${input.accountId} (testnet).` };
  if (permission !== "FullAccess") return { ok: false, reason: "The signing key must be a full-access key of the account." };
  return { ok: true };
}

// ------------------------------------------------------------------ transactions

export interface ContractEvent {
  standard: string;
  version: string;
  event: string;
  data: Record<string, string>[];
}

export interface VerifiedTx {
  txHash: string;
  signerId: string;
  receiverId: string;
  methodName: string;
  args: unknown;
  depositYocto: bigint;
  success: boolean;
  failure: string | null;
  /** Decoded return value of the final receipt (e.g. callback result), if any. */
  returnValue: unknown;
  blockHash: string;
  blockTimestampNs: string;
  events: ContractEvent[];
}

interface RpcAction {
  FunctionCall?: { method_name: string; args: string; gas: number; deposit: string };
}
interface RpcOutcome {
  status: { SuccessValue?: string; Failure?: unknown; SuccessReceiptId?: string } | string;
  transaction: { signer_id: string; receiver_id: string; hash: string; actions: (RpcAction | string)[] };
  transaction_outcome: { block_hash: string };
  receipts_outcome: { outcome: { logs: string[]; executor_id: string; status: { Failure?: unknown } | Record<string, unknown> } }[];
  final_execution_status?: string;
}

function failureText(f: unknown): string {
  const s = JSON.stringify(f);
  const m = /"(?:ExecutionError|panic_msg)"\s*:\s*"([^"]+)"/.exec(s);
  return (m?.[1] ?? s).slice(0, 400);
}

/** Fetches a finalised transaction. Returns null while it is unknown/pending (caller retries). */
export async function fetchTx(txHash: string, signerId: string): Promise<VerifiedTx | null> {
  let out: RpcOutcome;
  try {
    out = await rpc<RpcOutcome>("tx", { tx_hash: txHash, sender_account_id: signerId, wait_until: "FINAL" }, 30_000);
  } catch (err) {
    if (err instanceof RpcError && /UNKNOWN_TRANSACTION|TIMEOUT_ERROR|RPC_UNAVAILABLE/.test(`${err.name_} ${err.message}`)) return null;
    throw err;
  }
  const action = out.transaction.actions.find((a): a is RpcAction => typeof a === "object" && "FunctionCall" in a);
  const fc = action?.FunctionCall;
  const status = typeof out.status === "object" ? out.status : {};
  const success = "SuccessValue" in status || "SuccessReceiptId" in status;
  let returnValue: unknown = null;
  if ("SuccessValue" in status && status.SuccessValue) {
    try {
      returnValue = JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8"));
    } catch {
      returnValue = null;
    }
  }
  const events: ContractEvent[] = [];
  for (const r of out.receipts_outcome) {
    if (r.outcome.executor_id !== out.transaction.receiver_id) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        events.push(JSON.parse(log.slice("EVENT_JSON:".length)) as ContractEvent);
      } catch {
        /* ignore malformed */
      }
    }
  }
  const block = await rpc<{ header: { timestamp_nanosec: string } }>("block", { block_id: out.transaction_outcome.block_hash });
  let args: unknown = null;
  if (fc?.args) {
    try {
      args = JSON.parse(Buffer.from(fc.args, "base64").toString("utf8"));
    } catch {
      args = null;
    }
  }
  return {
    txHash: out.transaction.hash,
    signerId: out.transaction.signer_id,
    receiverId: out.transaction.receiver_id,
    methodName: fc?.method_name ?? "",
    args,
    depositYocto: BigInt(fc?.deposit ?? "0"),
    success,
    failure: success ? null : failureText("Failure" in status ? status.Failure : out.status),
    returnValue,
    blockHash: out.transaction_outcome.block_hash,
    blockTimestampNs: block.header.timestamp_nanosec,
    events,
  };
}

export interface TxExpectation {
  signerId: string;
  receiverId: string;
  methodName: string;
  /** Exact JSON args the server prepared; compared canonically. */
  args: Record<string, unknown>;
  depositYocto: bigint;
}

/**
 * Verifies that a reported transaction is exactly the one the server prepared: same signer
 * (the caller's bound wallet), contract, method, canonical args and deposit. A wallet approval
 * alone is never treated as success — only a finalised, matching on-chain transaction.
 */
export async function verifyExpectedTx(txHash: string, expect: TxExpectation): Promise<VerifiedTx> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) throw new AppError("INVALID_INPUT", "That is not a NEAR transaction hash.");
  const tx = await fetchTx(txHash, expect.signerId);
  if (!tx) {
    throw new AppError("PRECONDITION_FAILED", "The transaction is not final on NEAR testnet yet. We will keep checking; refresh in a few seconds.");
  }
  const mismatch: string[] = [];
  if (tx.signerId !== expect.signerId) mismatch.push(`signer ${tx.signerId}`);
  if (tx.receiverId !== expect.receiverId) mismatch.push(`receiver ${tx.receiverId}`);
  if (tx.methodName !== expect.methodName) mismatch.push(`method ${tx.methodName}`);
  if (tx.depositYocto !== expect.depositYocto) mismatch.push(`deposit ${tx.depositYocto}`);
  if (canonicalJson(tx.args ?? null) !== canonicalJson(expect.args)) mismatch.push("arguments");
  if (mismatch.length) {
    throw new AppError("CHAIN_VERIFICATION_FAILED", `Transaction does not match the prepared action (${mismatch.join(", ")}).`);
  }
  return tx;
}
