import "server-only";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  bidCommitmentHex,
  newSaltHex,
  normalizeQuote,
  type FrozenPolicy,
  type NormalizedQuote,
  type QuoteInput,
  quoteInputSchema,
} from "@veilprocure/shared";
import { audit } from "../audit";
import { orgIdsOf, requireMembership, type Actor } from "../authz";
import { db, tables, withActor } from "../db";
import { openJson, sealJson, sha256Hex } from "../crypto";
import { env } from "../env";
import { AppError, zodFieldErrors } from "../errors";
import { prepareIntent, requireContract, type IntentView } from "../chain/intents";
import { readChainRfq } from "../chain/sync";
import type { VerifiedTx } from "../near";
import { policyAad } from "./rfq";

const t = tables;
export const quoteDraftAad = (quoteId: string, org: string) => ({ table: "quotes", id: quoteId, org });
export const revisionPayloadAad = (revId: string, org: string) => ({ table: "quote_revisions.payload", id: revId, org });
export const revisionSaltAad = (revId: string, org: string) => ({ table: "quote_revisions.salt", id: revId, org });
export const filenameAad = (attId: string, org: string) => ({ table: "private_attachments.filename", id: attId, org });
export const blobAad = (storageKey: string, org: string) => ({ table: "private_attachments.blob", id: storageKey, org });

// ------------------------------------------------------------------ invitations

export async function loadInvite(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db()
    .select({ invite: t.supplierInvites, slot: t.rfqSuppliers, rfq: t.rfqs, buyerName: t.organizations.name })
    .from(t.supplierInvites)
    .innerJoin(t.rfqSuppliers, eq(t.rfqSuppliers.id, t.supplierInvites.rfqSupplierId))
    .innerJoin(t.rfqs, eq(t.rfqs.id, t.rfqSuppliers.rfqId))
    .innerJoin(t.organizations, eq(t.organizations.id, t.rfqs.buyerOrgId))
    .where(eq(t.supplierInvites.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row) return null;
  const now = Date.now();
  const state =
    row.invite.revokedAt || row.slot.status === "revoked"
      ? "revoked"
      : row.invite.consumedAt || row.slot.status === "accepted"
        ? "accepted"
        : row.slot.status === "declined"
          ? "declined"
          : row.invite.expiresAt.getTime() < now || row.rfq.status !== "open"
            ? "expired"
            : "valid";
  return { ...row, state } as const;
}

export async function acceptInvite(actor: Actor, token: string, choice: { orgId?: string; newOrgName?: string }): Promise<string> {
  const inv = await loadInvite(token);
  if (!inv || inv.state !== "valid") throw new AppError("PRECONDITION_FAILED", "This invitation is no longer valid.");
  if (inv.slot.inviteEmail !== actor.email) {
    throw new AppError("FORBIDDEN", `This invitation was sent to a different e-mail address. Sign in as the invited address to accept it.`);
  }
  if (inv.rfq.buyerOrgId && actor.memberships.some((m) => m.orgId === inv.rfq.buyerOrgId)) {
    throw new AppError("FORBIDDEN", "Members of the buying organisation cannot bid on its RFQs.");
  }
  return db().transaction(async (tx) => {
    let orgId = choice.orgId;
    if (orgId) {
      const m = requireMembership(actor, orgId, "quote:submit");
      if (m.orgKind !== "supplier") throw new AppError("INVALID_INPUT", "Choose a supplier organisation.");
    } else {
      const name = z.string().trim().min(2).max(120).safeParse(choice.newOrgName);
      if (!name.success) throw new AppError("INVALID_INPUT", "Enter your company name.", { newOrgName: "Enter your company name" });
      const [org] = await tx.insert(t.organizations).values({ name: name.data, kind: "supplier", createdBy: actor.id }).returning({ id: t.organizations.id });
      await tx.insert(t.memberships).values({ orgId: org!.id, userId: actor.id, role: "owner" });
      await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: org!.id, action: "org.created", targetType: "organization", targetId: org!.id, metadata: { kind: "supplier" } });
      orgId = org!.id;
    }
    const taken = await tx.select({ id: t.rfqSuppliers.id }).from(t.rfqSuppliers).where(and(eq(t.rfqSuppliers.rfqId, inv.rfq.id), eq(t.rfqSuppliers.supplierOrgId, orgId)));
    if (taken.length) throw new AppError("CONFLICT", "This organisation already holds an invitation for this RFQ.");
    const updated = await tx
      .update(t.rfqSuppliers)
      .set({ status: "accepted", supplierOrgId: orgId, acceptedBy: actor.id, acceptedAt: new Date() })
      .where(and(eq(t.rfqSuppliers.id, inv.slot.id), eq(t.rfqSuppliers.status, "pending")))
      .returning({ id: t.rfqSuppliers.id });
    if (!updated.length) throw new AppError("CONFLICT", "This invitation was already used.");
    await tx.update(t.supplierInvites).set({ consumedAt: new Date() }).where(eq(t.supplierInvites.id, inv.invite.id));
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId, rfqId: inv.rfq.id, action: "invite.accepted", targetType: "rfq_supplier", targetId: inv.slot.id });
    const buyers = await tx.select({ userId: t.memberships.userId }).from(t.memberships).where(eq(t.memberships.orgId, inv.rfq.buyerOrgId));
    for (const b of buyers) {
      await tx.insert(t.notifications).values({
        userId: b.userId,
        kind: "invite_accepted",
        title: "A supplier accepted your invitation",
        body: `An invited supplier joined "${inv.rfq.title}". Their quote stays sealed until the deadline.`,
        linkPath: `/app/rfqs/${inv.rfq.id}`,
      });
    }
    return inv.rfq.id;
  });
}

export async function declineInvite(actor: Actor, token: string): Promise<void> {
  const inv = await loadInvite(token);
  if (!inv || inv.state !== "valid") throw new AppError("PRECONDITION_FAILED", "This invitation is no longer valid.");
  if (inv.slot.inviteEmail !== actor.email) throw new AppError("FORBIDDEN", "Sign in as the invited address to decline.");
  await db().transaction(async (tx) => {
    await tx.update(t.rfqSuppliers).set({ status: "declined" }).where(and(eq(t.rfqSuppliers.id, inv.slot.id), eq(t.rfqSuppliers.status, "pending")));
    await tx.update(t.supplierInvites).set({ consumedAt: new Date() }).where(eq(t.supplierInvites.id, inv.invite.id));
    await audit(tx, { actorKind: "user", actorUserId: actor.id, rfqId: inv.rfq.id, action: "invite.declined", targetType: "rfq_supplier", targetId: inv.slot.id });
  });
}

// ------------------------------------------------------------------ supplier workspace

export async function listSupplierRfqs(actor: Actor) {
  const orgs = orgIdsOf(actor, "supplier");
  if (!orgs.length) return [];
  return db()
    .select({ rfq: t.rfqs, slot: t.rfqSuppliers, buyerName: t.organizations.name })
    .from(t.rfqSuppliers)
    .innerJoin(t.rfqs, eq(t.rfqs.id, t.rfqSuppliers.rfqId))
    .innerJoin(t.organizations, eq(t.organizations.id, t.rfqs.buyerOrgId))
    .where(and(inArray(t.rfqSuppliers.supplierOrgId, orgs), eq(t.rfqSuppliers.status, "accepted")))
    .orderBy(desc(t.rfqs.deadlineAt));
}

/** Pending invitations addressed to the signed-in user's verified e-mail. */
export async function listPendingInvitesForEmail(email: string) {
  return db()
    .select({ rfqTitle: t.rfqs.title, buyerName: t.organizations.name, deadlineAt: t.rfqs.deadlineAt, slotId: t.rfqSuppliers.id })
    .from(t.rfqSuppliers)
    .innerJoin(t.rfqs, eq(t.rfqs.id, t.rfqSuppliers.rfqId))
    .innerJoin(t.organizations, eq(t.organizations.id, t.rfqs.buyerOrgId))
    .where(and(eq(t.rfqSuppliers.inviteEmail, email), eq(t.rfqSuppliers.status, "pending"), eq(t.rfqs.status, "open"), gt(t.rfqs.deadlineAt, new Date())));
}

export async function loadSupplierContext(actor: Actor, rfqId: string) {
  if (!z.uuid().safeParse(rfqId).success) notFound();
  const orgs = orgIdsOf(actor, "supplier");
  if (!orgs.length) notFound();
  const [row] = await db()
    .select({ rfq: t.rfqs, slot: t.rfqSuppliers, buyerName: t.organizations.name })
    .from(t.rfqSuppliers)
    .innerJoin(t.rfqs, eq(t.rfqs.id, t.rfqSuppliers.rfqId))
    .innerJoin(t.organizations, eq(t.organizations.id, t.rfqs.buyerOrgId))
    .where(and(eq(t.rfqSuppliers.rfqId, rfqId), inArray(t.rfqSuppliers.supplierOrgId, orgs), eq(t.rfqSuppliers.status, "accepted")))
    .limit(1);
  if (!row) notFound();
  const supplierOrgId = row.slot.supplierOrgId!;
  const membership = requireMembership(actor, supplierOrgId, "quote:view");
  const [pv] = await db().select().from(t.rfqPolicyVersions).where(eq(t.rfqPolicyVersions.rfqId, rfqId)).orderBy(desc(t.rfqPolicyVersions.version)).limit(1);
  if (!pv) notFound();
  const policy = await openJson<FrozenPolicy>(pv.policyEnc, policyAad(pv.id, row.rfq.buyerOrgId));
  const quoteData = await withActor(db(), [supplierOrgId], async (tx) => {
    const [quote] = await tx.select().from(t.quotes).where(and(eq(t.quotes.rfqId, rfqId), eq(t.quotes.supplierOrgId, supplierOrgId))).limit(1);
    if (!quote) return { quote: null, draft: null, revisions: [], attachments: [] };
    const draft = quote.draftEnc ? await openJson<QuoteInput>(quote.draftEnc, quoteDraftAad(quote.id, supplierOrgId)) : null;
    const revisions = await tx.select().from(t.quoteRevisions).where(eq(t.quoteRevisions.quoteId, quote.id)).orderBy(desc(t.quoteRevisions.version));
    const atts = await tx
      .select()
      .from(t.privateAttachments)
      .where(and(eq(t.privateAttachments.quoteId, quote.id), eq(t.privateAttachments.kind, "quote"), isNull(t.privateAttachments.deletedAt)));
    const attachments = await Promise.all(
      atts.map(async (a) => ({ id: a.id, sha256: a.sha256, sizeBytes: a.sizeBytes, contentType: a.contentType, scanStatus: a.scanStatus, createdAt: a.createdAt, filename: (await openJson<{ name: string }>(a.filenameEnc, filenameAad(a.id, supplierOrgId))).name })),
    );
    return { quote, draft, revisions, attachments };
  });
  return { ...row, supplierOrgId, membership, policy, policyVersion: pv.version, ...quoteData };
}

function biddingOpen(rfq: typeof t.rfqs.$inferSelect): boolean {
  return rfq.status === "open" && !!rfq.deadlineAt && rfq.deadlineAt.getTime() > Date.now();
}

export async function saveQuoteDraft(actor: Actor, rfqId: string, input: unknown): Promise<void> {
  const ctx = await loadSupplierContext(actor, rfqId);
  requireMembership(actor, ctx.supplierOrgId, "quote:edit");
  if (!biddingOpen(ctx.rfq)) throw new AppError("PRECONDITION_FAILED", "Bidding is closed for this RFQ.");
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "Check the highlighted fields.", zodFieldErrors(parsed.error.issues));
  try {
    normalizeQuote(parsed.data, ctx.policy);
  } catch (err) {
    throw new AppError("INVALID_INPUT", err instanceof Error ? err.message : "Invalid quote.");
  }
  await withActor(db(), [ctx.supplierOrgId], async (tx) => {
    const id = ctx.quote?.id ?? crypto.randomUUID();
    const draftEnc = await sealJson(parsed.data, quoteDraftAad(id, ctx.supplierOrgId));
    if (ctx.quote) {
      await tx.update(t.quotes).set({ draftEnc, updatedAt: new Date() }).where(eq(t.quotes.id, id));
    } else {
      await tx.insert(t.quotes).values({ id, rfqId, rfqSupplierId: ctx.slot.id, supplierOrgId: ctx.supplierOrgId, draftEnc, createdBy: actor.id });
    }
    await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: ctx.supplierOrgId, rfqId, action: "quote.draft_saved", targetType: "quote", targetId: id });
  });
}

/** Seals the current draft into an immutable revision and returns the commit_bid intent. */
export async function prepareCommit(actor: Actor, rfqId: string): Promise<IntentView> {
  requireContract();
  const ctx = await loadSupplierContext(actor, rfqId);
  requireMembership(actor, ctx.supplierOrgId, "quote:submit");
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind your NEAR testnet wallet; it signs the bid commitment.");
  if (!biddingOpen(ctx.rfq)) throw new AppError("PRECONDITION_FAILED", "Bidding is closed for this RFQ.");
  if (!ctx.quote || !ctx.draft) throw new AppError("PRECONDITION_FAILED", "Save your quote before submitting it.");
  const committedAccount = ctx.revisions.find((r) => r.status === "committed")?.supplierAccountId;
  if (committedAccount && committedAccount !== actor.wallet.accountId) {
    throw new AppError("FORBIDDEN", `Your organisation already committed from ${committedAccount}. Revisions must be signed by the same account.`);
  }
  const quote = normalizeQuote(ctx.draft, ctx.policy);
  const digests = ctx.attachments.map((a) => a.sha256);
  const secretRow = await db().select({ enc: t.rfqSuppliers.inviteSecretEnc }).from(t.rfqSuppliers).where(eq(t.rfqSuppliers.id, ctx.slot.id)).limit(1);
  if (!secretRow[0]?.enc) throw new AppError("INTERNAL", "Invite slot is missing its secret.");
  const { secret } = await openJson<{ secret: string }>(secretRow[0].enc, { table: "rfq_suppliers", id: ctx.slot.id, org: ctx.rfq.buyerOrgId });

  // Re-use an unsent prepared revision for the same content (double-click safe).
  const latest = ctx.revisions[0];
  let revision = latest && latest.status === "prepared" && latest.supplierAccountId === actor.wallet.accountId ? latest : null;
  if (revision) {
    const payload = await openJson<NormalizedQuote>(revision.payloadEnc, revisionPayloadAad(revision.id, ctx.supplierOrgId));
    if (JSON.stringify(payload) !== JSON.stringify(quote) || revision.attachmentDigests.join() !== [...digests].sort().join()) revision = null;
  }
  if (!revision) {
    const version = (ctx.revisions[0]?.version ?? 0) + 1;
    const saltHex = newSaltHex();
    const commitment = bidCommitmentHex({
      network: "testnet",
      contractId: env().NEAR_CONTRACT_ID,
      rfqOnchainId: ctx.rfq.onchainId!,
      supplierAccountId: actor.wallet.accountId,
      version,
      quote,
      attachmentDigests: digests,
      saltHex,
    });
    const id = crypto.randomUUID();
    revision = await withActor(db(), [ctx.supplierOrgId], async (tx) => {
      // Older unsent prepared revisions are marked failed so only one can be signed.
      await tx.update(t.quoteRevisions).set({ status: "failed" }).where(and(eq(t.quoteRevisions.quoteId, ctx.quote!.id), eq(t.quoteRevisions.status, "prepared")));
      const [row] = await tx
        .insert(t.quoteRevisions)
        .values({
          id,
          quoteId: ctx.quote!.id,
          rfqId,
          supplierOrgId: ctx.supplierOrgId,
          version,
          payloadEnc: await sealJson(quote, revisionPayloadAad(id, ctx.supplierOrgId)),
          saltEnc: await sealJson({ salt: saltHex }, revisionSaltAad(id, ctx.supplierOrgId)),
          attachmentDigests: [...digests].sort(),
          supplierAccountId: actor.wallet!.accountId,
          commitmentHex: commitment,
          createdBy: actor.id,
        })
        .returning();
      await tx.update(t.quotes).set({ status: "committing", updatedAt: new Date() }).where(eq(t.quotes.id, ctx.quote!.id));
      await audit(tx, { actorKind: "user", actorUserId: actor.id, actorAccountId: actor.wallet!.accountId, orgId: ctx.supplierOrgId, rfqId, action: "quote.revision_sealed", targetType: "quote_revision", targetId: id, metadata: { version, commitment } });
      return row!;
    });
  }
  return prepareIntent({
    actor,
    orgId: ctx.supplierOrgId,
    kind: "commit_bid",
    rfqId,
    refId: ctx.quote.id,
    signerId: actor.wallet.accountId,
    args: { rfq_id: ctx.rfq.onchainId!.toString(), commitment: revision.commitmentHex, version: revision.version, invite_secret: secret },
  });
}

/** Applies a verified commit_bid: the on-chain bid must carry exactly this revision's commitment. */
export async function applyCommit(intent: typeof t.txIntents.$inferSelect, tx: VerifiedTx, userId: string): Promise<void> {
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, intent.rfqId)).limit(1);
  const chain = await readChainRfq(rfq!.onchainId!);
  const bid = chain?.bids.find((b) => b.supplier === tx.signerId);
  const args = intent.args as { commitment: string; version: number };
  if (!bid || bid.commitment !== args.commitment || bid.version !== args.version || bid.withdrawn) {
    throw new AppError("CHAIN_VERIFICATION_FAILED", "The on-chain bid does not carry this commitment.");
  }
  await withActor(db(), [intent.orgId], async (dbtx) => {
    const [rev] = await dbtx
      .select()
      .from(t.quoteRevisions)
      .where(and(eq(t.quoteRevisions.quoteId, intent.refId), eq(t.quoteRevisions.version, args.version), eq(t.quoteRevisions.commitmentHex, args.commitment)))
      .limit(1);
    if (!rev) throw new AppError("NOT_FOUND", "Sealed revision not found.");
    if (rev.status === "committed") return;
    await dbtx.update(t.quoteRevisions).set({ status: "superseded" }).where(and(eq(t.quoteRevisions.quoteId, rev.quoteId), eq(t.quoteRevisions.status, "committed")));
    await dbtx.update(t.quoteRevisions).set({ status: "committed", commitTxHash: tx.txHash, chainCommittedAtNs: bid.committed_at_ns }).where(eq(t.quoteRevisions.id, rev.id));
    await dbtx.update(t.quotes).set({ status: "committed", committedRevisionId: rev.id, updatedAt: new Date() }).where(eq(t.quotes.id, rev.quoteId));
    await dbtx
      .insert(t.commitmentReceipts)
      .values({ kind: "bid", rfqId: intent.rfqId, quoteRevisionId: rev.id, network: "testnet", txHash: tx.txHash, signerAccountId: tx.signerId, receiverId: tx.receiverId, methodName: "commit_bid", status: "confirmed", blockTimestampNs: tx.blockTimestampNs, submittedBy: userId, verifiedAt: new Date() })
      .onConflictDoNothing();
    await audit(dbtx, { actorKind: "user", actorUserId: userId, actorAccountId: tx.signerId, orgId: intent.orgId, rfqId: intent.rfqId, action: "quote.committed_on_chain", targetType: "quote_revision", targetId: rev.id, txHash: tx.txHash, metadata: { version: rev.version, commitment: rev.commitmentHex } });
  });
}

export async function prepareWithdraw(actor: Actor, rfqId: string): Promise<IntentView> {
  const ctx = await loadSupplierContext(actor, rfqId);
  requireMembership(actor, ctx.supplierOrgId, "quote:submit");
  if (!actor.wallet) throw new AppError("WALLET_REQUIRED", "Bind your NEAR testnet wallet first.");
  if (!biddingOpen(ctx.rfq)) throw new AppError("PRECONDITION_FAILED", "Bidding is closed.");
  if (ctx.quote?.status !== "committed") throw new AppError("PRECONDITION_FAILED", "There is no committed bid to withdraw.");
  return prepareIntent({ actor, orgId: ctx.supplierOrgId, kind: "withdraw_bid", rfqId, refId: ctx.quote.id, signerId: actor.wallet.accountId, args: { rfq_id: ctx.rfq.onchainId!.toString() } });
}

export async function applyWithdraw(intent: typeof t.txIntents.$inferSelect, tx: VerifiedTx, userId: string): Promise<void> {
  const [rfq] = await db().select().from(t.rfqs).where(eq(t.rfqs.id, intent.rfqId)).limit(1);
  const chain = await readChainRfq(rfq!.onchainId!);
  const bid = chain?.bids.find((b) => b.supplier === tx.signerId);
  if (!bid?.withdrawn) throw new AppError("CHAIN_VERIFICATION_FAILED", "The bid is not withdrawn on chain.");
  await withActor(db(), [intent.orgId], async (dbtx) => {
    await dbtx.update(t.quotes).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(t.quotes.id, intent.refId));
    await audit(dbtx, { actorKind: "user", actorUserId: userId, actorAccountId: tx.signerId, orgId: intent.orgId, rfqId: intent.rfqId, action: "quote.withdrawn_on_chain", targetType: "quote", targetId: intent.refId, txHash: tx.txHash });
  });
}
