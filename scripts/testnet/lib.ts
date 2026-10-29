/**
 * NEAR testnet tooling for VeilProcure (testnet only — refuses anything else).
 * Keys live in the standard legacy keychain, ~/.near-credentials/testnet/<account>.json, which
 * near-cli also reads. They are never written inside the repository.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Account, KeyPair, type KeyPairString } from "near-api-js";

export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const FAUCET_URL = "https://helper.nearprotocol.com/account"; // as used by near-cli-rs
export const EXPLORER = "https://testnet.nearblocks.io";
export const REPO_ROOT = resolve(import.meta.dirname, "../..");
const KEYCHAIN = join(homedir(), ".near-credentials", "testnet");

export function assertTestnet(accountId: string): void {
  if (!accountId.endsWith(".testnet")) throw new Error(`refusing non-testnet account ${accountId}`);
}

export function keyFile(accountId: string): string {
  return join(KEYCHAIN, `${accountId}.json`);
}

export function loadAccount(accountId: string): Account {
  assertTestnet(accountId);
  const { private_key } = JSON.parse(readFileSync(keyFile(accountId), "utf8")) as { private_key: KeyPairString };
  return new Account(accountId, RPC_URL, private_key);
}

export function loadKey(accountId: string): { publicKey: string; privateKey: KeyPairString } {
  const k = JSON.parse(readFileSync(keyFile(accountId), "utf8")) as { public_key: string; private_key: KeyPairString };
  return { publicKey: k.public_key, privateKey: k.private_key };
}

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "s", method, params }) });
  const body = (await res.json()) as { result?: T; error?: { cause?: { name?: string }; message?: string } };
  if (body.error) throw new Error(body.error.cause?.name ?? body.error.message ?? "rpc error");
  return body.result as T;
}

export async function accountExists(accountId: string): Promise<boolean> {
  try {
    await rpc("query", { request_type: "view_account", finality: "final", account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

/** Creates a faucet-funded top-level testnet account. The key is saved before the request. */
export async function createFaucetAccount(accountId: string): Promise<void> {
  assertTestnet(accountId);
  if (await accountExists(accountId)) throw new Error(`${accountId} already exists`);
  if (existsSync(keyFile(accountId))) throw new Error(`a key for ${accountId} already exists in the keychain`);
  const kp = KeyPair.fromRandom("ed25519");
  mkdirSync(KEYCHAIN, { recursive: true });
  writeFileSync(keyFile(accountId), JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`faucet HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  for (let i = 0; i < 30; i++) {
    if (await accountExists(accountId)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${accountId} did not appear on testnet`);
}

export const MANIFEST = join(REPO_ROOT, ".local", "testnet-accounts.json");

export interface Manifest {
  createdAt: string;
  contract: string;
  buyer: string;
  supplierA: string;
  supplierB: string;
  outsider: string;
  deployTx?: string;
  codeHashBase58?: string;
  wasmSha256?: string;
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
}

export function writeManifest(m: Manifest): void {
  mkdirSync(join(REPO_ROOT, ".local"), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

export function txHashOf(r: { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }): string {
  return r.transaction?.hash ?? r.transaction_outcome?.id ?? "";
}
