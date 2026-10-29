/**
 * Database-layer security tests against a real PostgreSQL (the project-local test database).
 * Fixtures are created through the worker role (BYPASSRLS) and labelled `test-*`; assertions are
 * made through the app role (veil_app), which is what the web server uses.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, withActor, type Db } from "./index";
import * as t from "./schema";

function loadLocalEnv(): void {
  const file = new URL("../../../.local/db.env", import.meta.url);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && process.env[line.slice(0, i)] === undefined) {
      process.env[line.slice(0, i)] = line.slice(i + 1);
    }
  }
}
loadLocalEnv();

/** Drizzle wraps driver errors ("Failed query: …"); the Postgres message is on `cause`. */
async function expectPgError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    expect(`${e.message ?? ""} ${e.cause?.message ?? ""}`).toMatch(pattern);
    return;
  }
  throw new Error(`expected rejection matching ${pattern}`);
}

const appUrl = process.env.TEST_DATABASE_URL;
const workerUrl = process.env.TEST_WORKER_DATABASE_URL;
const enabled = Boolean(appUrl && workerUrl);

describe.skipIf(!enabled)("row-level security and immutability (real Postgres)", () => {
  let app: Db;
  let worker: Db;
  const closers: (() => Promise<void>)[] = [];
  const run = randomUUID().slice(0, 8);
  const ids = {
    buyerUser: randomUUID(),
    supAUser: randomUUID(),
    supBUser: randomUUID(),
    buyerOrg: randomUUID(),
    otherBuyerOrg: randomUUID(),
    supAOrg: randomUUID(),
    supBOrg: randomUUID(),
    rfq: randomUUID(),
    slotA: randomUUID(),
    slotB: randomUUID(),
    quoteA: randomUUID(),
    quoteB: randomUUID(),
    revA1: randomUUID(),
    revA2: randomUUID(),
    revB1: randomUUID(),
  };

  beforeAll(async () => {
    const a = createDb(appUrl!, { max: 2 });
    const w = createDb(workerUrl!, { max: 2 });
    app = a.db;
    worker = w.db;
    closers.push(a.close, w.close);

    await worker.insert(t.users).values([
      { id: ids.buyerUser, email: `test-buyer-${run}@example.test` },
      { id: ids.supAUser, email: `test-sup-a-${run}@example.test` },
      { id: ids.supBUser, email: `test-sup-b-${run}@example.test` },
    ]);
    await worker.insert(t.organizations).values([
      { id: ids.buyerOrg, name: `test buyer ${run}`, kind: "buyer" },
      { id: ids.otherBuyerOrg, name: `test other buyer ${run}`, kind: "buyer" },
      { id: ids.supAOrg, name: `test supplier A ${run}`, kind: "supplier" },
      { id: ids.supBOrg, name: `test supplier B ${run}`, kind: "supplier" },
    ]);
    await worker.insert(t.rfqs).values({
      id: ids.rfq,
      buyerOrgId: ids.buyerOrg,
      createdBy: ids.buyerUser,
      status: "open",
      title: "test rfq",
      category: "qa_testing",
      draftEnc: "test-ciphertext",
    });
    await worker.insert(t.rfqSuppliers).values([
      { id: ids.slotA, rfqId: ids.rfq, slotIndex: 0, inviteEmail: `test-sup-a-${run}@example.test`, supplierOrgId: ids.supAOrg, status: "accepted" },
      { id: ids.slotB, rfqId: ids.rfq, slotIndex: 1, inviteEmail: `test-sup-b-${run}@example.test`, supplierOrgId: ids.supBOrg, status: "accepted" },
    ]);
    await worker.insert(t.quotes).values([
      { id: ids.quoteA, rfqId: ids.rfq, rfqSupplierId: ids.slotA, supplierOrgId: ids.supAOrg, createdBy: ids.supAUser, status: "committed" },
      { id: ids.quoteB, rfqId: ids.rfq, rfqSupplierId: ids.slotB, supplierOrgId: ids.supBOrg, createdBy: ids.supBUser, status: "committed" },
    ]);
    const rev = (id: string, quoteId: string, org: string, version: number, status: "prepared" | "committed" | "superseded") => ({
      id,
      quoteId,
      rfqId: ids.rfq,
      supplierOrgId: org,
      version,
      payloadEnc: `test-payload-${id}`,
      saltEnc: `test-salt-${id}`,
      supplierAccountId: "test.testnet",
      commitmentHex: "ab".repeat(32),
      status,
      createdBy: ids.supAUser,
    });
    await worker.insert(t.quoteRevisions).values([
      rev(ids.revA1, ids.quoteA, ids.supAOrg, 1, "superseded"),
      rev(ids.revA2, ids.quoteA, ids.supAOrg, 2, "committed"),
      rev(ids.revB1, ids.quoteB, ids.supBOrg, 1, "committed"),
    ]);
  });

  afterAll(async () => {
    for (const close of closers) await close();
  });

  const visibleRevisions = (orgs: string[]) =>
    withActor(app, orgs, (tx) => tx.select({ id: t.quoteRevisions.id }).from(t.quoteRevisions).where(eq(t.quoteRevisions.rfqId, ids.rfq)));

  it("supplier sees only its own quote and revisions", async () => {
    const quotesA = await withActor(app, [ids.supAOrg], (tx) =>
      tx.select({ id: t.quotes.id }).from(t.quotes).where(eq(t.quotes.rfqId, ids.rfq)),
    );
    expect(quotesA.map((q) => q.id)).toEqual([ids.quoteA]);
    const revs = await visibleRevisions([ids.supAOrg]);
    expect(revs.map((r) => r.id).sort()).toEqual([ids.revA1, ids.revA2].sort());
  });

  it("supplier B cannot read supplier A's quote by id (IDOR)", async () => {
    const rows = await withActor(app, [ids.supBOrg], (tx) => tx.select().from(t.quotes).where(eq(t.quotes.id, ids.quoteA)));
    expect(rows).toHaveLength(0);
    const revRows = await withActor(app, [ids.supBOrg], (tx) =>
      tx.select().from(t.quoteRevisions).where(eq(t.quoteRevisions.id, ids.revA2)),
    );
    expect(revRows).toHaveLength(0);
  });

  it("supplier B cannot write into supplier A's quote or create one in A's name", async () => {
    const updated = await withActor(app, [ids.supBOrg], (tx) =>
      tx.update(t.quotes).set({ draftEnc: "tampered" }).where(eq(t.quotes.id, ids.quoteA)).returning({ id: t.quotes.id }),
    );
    expect(updated).toHaveLength(0);
    await expectPgError(
      withActor(app, [ids.supBOrg], (tx) =>
        tx.insert(t.quotes).values({ rfqId: ids.rfq, rfqSupplierId: ids.slotA, supplierOrgId: ids.supAOrg, createdBy: ids.supBUser }),
      ),
      /row-level security/,
    );
  });

  it("buyer cannot read any quote before close, even with the right RFQ", async () => {
    expect(await visibleRevisions([ids.buyerOrg])).toHaveLength(0);
    const quotes = await withActor(app, [ids.buyerOrg], (tx) => tx.select().from(t.quotes).where(eq(t.quotes.rfqId, ids.rfq)));
    expect(quotes).toHaveLength(0);
  });

  it("without an actor context nothing is visible (fails closed)", async () => {
    const rows = await app.select().from(t.quoteRevisions).where(eq(t.quoteRevisions.rfqId, ids.rfq));
    expect(rows).toHaveLength(0);
  });

  it("after close the buyer sees only committed revisions; other buyers see nothing", async () => {
    await worker.update(t.rfqs).set({ status: "closed" }).where(eq(t.rfqs.id, ids.rfq));
    const revs = await visibleRevisions([ids.buyerOrg]);
    expect(revs.map((r) => r.id).sort()).toEqual([ids.revA2, ids.revB1].sort());
    expect(await visibleRevisions([ids.otherBuyerOrg])).toHaveLength(0);
    // buyer has read-only access: updates match no rows
    const upd = await withActor(app, [ids.buyerOrg], (tx) =>
      tx.update(t.quoteRevisions).set({ status: "failed" }).where(eq(t.quoteRevisions.id, ids.revB1)).returning({ id: t.quoteRevisions.id }),
    );
    expect(upd).toHaveLength(0);
    // supplier B still cannot see A after close
    const crossAfter = await visibleRevisions([ids.supBOrg]);
    expect(crossAfter.map((r) => r.id)).toEqual([ids.revB1]);
  });

  it("committed quote content is immutable even for the owning supplier", async () => {
    await expectPgError(
      withActor(app, [ids.supAOrg], (tx) =>
        tx.update(t.quoteRevisions).set({ payloadEnc: "tampered" }).where(eq(t.quoteRevisions.id, ids.revA2)),
      ),
      /VEIL_IMMUTABLE/,
    );
    await expectPgError(worker.update(t.quoteRevisions).set({ commitmentHex: "cd".repeat(32) }).where(eq(t.quoteRevisions.id, ids.revA2)), /VEIL_IMMUTABLE/);
    await expectPgError(worker.delete(t.quoteRevisions).where(eq(t.quoteRevisions.id, ids.revA2)), /VEIL_IMMUTABLE/);
    // lifecycle status may still advance
    await worker.update(t.quoteRevisions).set({ status: "committed" }).where(eq(t.quoteRevisions.id, ids.revA2));
  });

  it("audit log is append-only", async () => {
    const [ev] = await app
      .insert(t.auditEvents)
      .values({ actorKind: "system", action: `test.${run}`, prevHash: "0".repeat(64), eventHash: "1".repeat(64) })
      .returning({ id: t.auditEvents.id });
    // app role lacks the privilege outright; worker role is stopped by the trigger
    await expectPgError(app.update(t.auditEvents).set({ action: "x" }).where(eq(t.auditEvents.id, ev!.id)), /permission denied/);
    await expectPgError(worker.update(t.auditEvents).set({ action: "x" }).where(eq(t.auditEvents.id, ev!.id)), /permission denied|VEIL_IMMUTABLE/);
    await expectPgError(worker.delete(t.auditEvents).where(eq(t.auditEvents.id, ev!.id)), /permission denied|VEIL_IMMUTABLE/);
  });

  it("published RFQ policy fields cannot be silently changed", async () => {
    await worker
      .update(t.rfqs)
      .set({ onchainId: BigInt(Date.now()), network: "testnet", contractId: `test-${run}.testnet`, policyHash: "aa".repeat(32) })
      .where(eq(t.rfqs.id, ids.rfq));
    await expectPgError(worker.update(t.rfqs).set({ policyHash: "bb".repeat(32) }).where(eq(t.rfqs.id, ids.rfq)), /VEIL_IMMUTABLE/);
    await worker.update(t.rfqs).set({ status: "awarded" }).where(eq(t.rfqs.id, ids.rfq));
  });

  it("a wallet account can be actively bound to only one user", async () => {
    const account = `test-${run}.testnet`;
    await worker.insert(t.walletBindings).values({ userId: ids.buyerUser, network: "testnet", accountId: account, publicKey: "ed25519:test" });
    await expect(
      worker.insert(t.walletBindings).values({ userId: ids.supAUser, network: "testnet", accountId: account, publicKey: "ed25519:test" }),
    ).rejects.toThrow();
    await worker.execute(sql`update wallet_bindings set revoked_at = now() where account_id = ${account}`);
    await worker.insert(t.walletBindings).values({ userId: ids.supAUser, network: "testnet", accountId: account, publicKey: "ed25519:test" });
  });
});
