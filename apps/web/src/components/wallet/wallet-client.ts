"use client";

import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";

/**
 * Thin wrapper around NEAR Connect (the wallet connector recommended by docs.near.org).
 * The connector is pinned to testnet; the server additionally refuses non-testnet accounts and
 * verifies every reported transaction on testnet RPC.
 */
let connectorPromise: Promise<NearConnector> | null = null;

/**
 * End-to-end test bridge. Compiled in only when NEXT_PUBLIC_VEIL_E2E_WALLET=1 (refused in
 * production by the server env validator) and active only when the Playwright harness has
 * injected these functions; signing happens in the Node test process with testnet keys, so no
 * private key ever enters the page. Real users always go through NEAR Connect.
 */
interface E2EWallet {
  __veilE2EAccount: () => Promise<string>;
  __veilE2ESignMessage: (json: string) => Promise<string>;
  __veilE2ESendTx: (json: string) => Promise<string>;
}
function e2e(): E2EWallet | null {
  if (process.env.NEXT_PUBLIC_VEIL_E2E_WALLET !== "1" || typeof window === "undefined") return null;
  const w = window as unknown as Partial<E2EWallet>;
  return w.__veilE2EAccount && w.__veilE2ESignMessage && w.__veilE2ESendTx ? (w as E2EWallet) : null;
}

function connector(): Promise<NearConnector> {
  connectorPromise ??= import("@hot-labs/near-connect").then(({ NearConnector }) => new NearConnector({ network: "testnet" }));
  return connectorPromise;
}

export class WalletError extends Error {
  constructor(
    message: string,
    readonly kind: "rejected" | "wrong_account" | "unavailable" | "failed",
  ) {
    super(message);
  }
}

function classify(err: unknown): WalletError {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/reject|denied|cancel|closed|user/i.test(msg)) return new WalletError("You declined the request in your wallet. Nothing was signed or sent.", "rejected");
  return new WalletError(msg ? `Wallet error: ${msg.slice(0, 200)}` : "The wallet did not respond.", "failed");
}

export async function connectedAccount(): Promise<{ wallet: NearWalletBase; accountId: string } | null> {
  try {
    const c = await connector();
    const { wallet, accounts } = await c.getConnectedWallet();
    const accountId = accounts[0]?.accountId;
    return accountId ? { wallet, accountId } : null;
  } catch {
    return null;
  }
}

export async function connect(): Promise<{ wallet: NearWalletBase; accountId: string }> {
  const test = e2e();
  if (test) return { wallet: null as unknown as NearWalletBase, accountId: await test.__veilE2EAccount() };
  try {
    const c = await connector();
    const wallet = await c.connect();
    const accounts = await wallet.getAccounts();
    const accountId = accounts[0]?.accountId;
    if (!accountId) throw new WalletError("The wallet returned no account.", "failed");
    return { wallet, accountId };
  } catch (err) {
    throw err instanceof WalletError ? err : classify(err);
  }
}

export async function disconnect(): Promise<void> {
  try {
    const c = await connector();
    const current = await connectedAccount();
    if (current) await c.disconnect(current.wallet);
  } catch {
    /* already disconnected */
  }
}

/** Connected wallet for `expectedAccountId`, prompting the user to connect if necessary. */
export async function walletFor(expectedAccountId: string): Promise<NearWalletBase> {
  const test = e2e();
  if (test) {
    const id = await test.__veilE2EAccount();
    if (id !== expectedAccountId) throw new WalletError(`Your wallet is connected as ${id}, but this step must be signed by ${expectedAccountId}.`, "wrong_account");
    return null as unknown as NearWalletBase;
  }
  const current = (await connectedAccount()) ?? (await connect());
  if (current.accountId !== expectedAccountId) {
    throw new WalletError(
      `Your wallet is connected as ${current.accountId}, but this step must be signed by ${expectedAccountId}. Switch accounts in your wallet and try again.`,
      "wrong_account",
    );
  }
  return current.wallet;
}

export async function signBindingMessage(input: { accountId: string; message: string; recipient: string; nonceHex: string }) {
  const wallet = await walletFor(input.accountId);
  const test = e2e();
  if (test) return JSON.parse(await test.__veilE2ESignMessage(JSON.stringify(input))) as { accountId: string; publicKey: string; signature: string };
  const nonce = Uint8Array.from(input.nonceHex.match(/../g)!.map((h) => Number.parseInt(h, 16)));
  try {
    const signed = await wallet.signMessage({ message: input.message, recipient: input.recipient, nonce, network: "testnet", signerId: input.accountId });
    return signed;
  } catch (err) {
    throw classify(err);
  }
}

export interface IntentLike {
  signerId: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  depositYocto: string;
}

/** Signs and sends exactly the server-prepared call. Returns the transaction hash. */
export async function sendIntent(intent: IntentLike): Promise<string> {
  const wallet = await walletFor(intent.signerId);
  const test = e2e();
  if (test) {
    const hash = await test.__veilE2ESendTx(JSON.stringify(intent));
    if (!hash) throw new WalletError("The test wallet did not return a transaction hash.", "failed");
    return hash;
  }
  try {
    const outcome = await wallet.signAndSendTransaction({
      network: "testnet",
      signerId: intent.signerId,
      receiverId: intent.receiverId,
      actions: [{ type: "FunctionCall", params: { methodName: intent.methodName, args: intent.args, gas: intent.gas, deposit: intent.depositYocto } }],
    });
    const o = outcome as unknown as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
    const hash = o.transaction?.hash ?? o.transaction_outcome?.id;
    if (!hash) throw new WalletError("The wallet did not return a transaction hash.", "failed");
    return hash;
  } catch (err) {
    throw err instanceof WalletError ? err : classify(err);
  }
}
