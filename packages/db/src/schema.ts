import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Conventions
 * - `*_enc` columns hold envelope-encrypted JSON (see apps/web/src/server/crypto.ts). The
 *   ciphertext's AAD binds table, row id and org id, so it cannot be moved to another row.
 * - Monetary chain amounts are yoctoNEAR in numeric(40,0) (exact; read as strings).
 * - Financial status columns are written only by the chain reconciler from verified chain state.
 * - audit_events, rfq_policy_versions and quote_revision payloads are append-only (DB triggers,
 *   see migrations/*_guards.sql). Quote tables are protected by row-level security.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const orgKind = pgEnum("org_kind", ["buyer", "supplier"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const rfqStatus = pgEnum("rfq_status", ["draft", "publishing", "open", "closed", "awarded", "settled", "cancelled"]);
export const slotStatus = pgEnum("slot_status", ["pending", "accepted", "declined", "revoked"]);
export const quoteStatus = pgEnum("quote_status", ["draft", "committing", "committed", "withdrawn"]);
export const revisionStatus = pgEnum("revision_status", ["prepared", "submitted", "committed", "superseded", "failed"]);
export const awardStatus = pgEnum("award_status", [
  "pending_signature",
  "awarded",
  "funded",
  "accepted",
  "delivered",
  "release_pending",
  "release_failed",
  "paid",
  "disputed",
  "refund_pending",
  "refund_failed",
  "refunded",
  "revoked",
  "declined",
]);
export const txStatus = pgEnum("tx_status", ["submitted", "confirmed", "failed"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "blocked"]);
export const scanStatus = pgEnum("scan_status", ["quarantined_unscanned", "clean", "rejected"]);
export const emailStatus = pgEnum("email_status", ["queued", "sent", "failed", "not_configured"]);

// ---------------------------------------------------------------- identity

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    emailVerifiedAt: ts("email_verified_at"),
    isPlatformOperator: boolean("is_platform_operator").notNull().default(false),
    createdAt: createdAt(),
    lastLoginAt: ts("last_login_at"),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), check("users_email_lower", sql`${t.email} = lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the session token; the raw token only ever lives in the HttpOnly cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrgId: uuid("active_org_id"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** Path to continue to after sign-in (validated as same-origin relative path). */
    nextPath: text("next_path"),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("login_tokens_hash_uq").on(t.tokenHash), index("login_tokens_email_idx").on(t.email)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: orgKind("kind").notNull(),
  website: text("website"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const memberInvites = pgTable(
  "member_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("member_invites_token_uq").on(t.tokenHash), index("member_invites_org_idx").on(t.orgId)],
);

export const walletBindings = pgTable(
  "wallet_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: text("network").notNull(),
    accountId: text("account_id").notNull(),
    publicKey: text("public_key").notNull(),
    boundAt: ts("bound_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    // One active binding per wallet account, and one active wallet per user per network.
    uniqueIndex("wallet_bindings_account_active_uq").on(t.network, t.accountId).where(sql`${t.revokedAt} is null`),
    uniqueIndex("wallet_bindings_user_active_uq").on(t.userId, t.network).where(sql`${t.revokedAt} is null`),
  ],
);

export const walletChallenges = pgTable("wallet_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  network: text("network").notNull(),
  accountId: text("account_id").notNull(),
  nonceHex: text("nonce_hex").notNull(),
  recipient: text("recipient").notNull(),
  message: text("message").notNull(),
  /** Set when the user explicitly confirmed moving a wallet away from another binding. */
  allowRebind: boolean("allow_rebind").notNull().default(false),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- procurement

export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerOrgId: uuid("buyer_org_id")
      .notNull()
      .references(() => organizations.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    status: rfqStatus("status").notNull().default("draft"),
    title: text("title").notNull(),
    category: text("category").notNull(),
    /** Encrypted editable draft (scope, criteria, terms). Frozen copy lives in rfq_policy_versions. */
    draftEnc: text("draft_enc").notNull(),
    /** Encrypted frozen policy awaiting its on-chain create_rfq confirmation (status=publishing). */
    pendingPublicationEnc: text("pending_publication_enc"),
    deadlineAt: ts("deadline_at"),
    network: text("network"),
    contractId: text("contract_id"),
    onchainId: bigint("onchain_id", { mode: "bigint" }),
    buyerAccountId: text("buyer_account_id"),
    policyHash: text("policy_hash"),
    termsHash: text("terms_hash"),
    publishedAt: ts("published_at"),
    closedAt: ts("closed_at"),
    cancelledAt: ts("cancelled_at"),
    chainSyncedAt: ts("chain_synced_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("rfqs_buyer_idx").on(t.buyerOrgId, t.createdAt),
    uniqueIndex("rfqs_onchain_uq").on(t.network, t.contractId, t.onchainId),
  ],
);

export const rfqPolicyVersions = pgTable(
  "rfq_policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    version: integer("version").notNull(),
    policyEnc: text("policy_enc").notNull(),
    policyHash: text("policy_hash").notNull(),
    termsHash: text("terms_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rfq_policy_versions_uq").on(t.rfqId, t.version)],
);

/** One invite slot per invited supplier e-mail; bound to an organisation on acceptance. */
export const rfqSuppliers = pgTable(
  "rfq_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    inviteEmail: text("invite_email").notNull(),
    supplierOrgId: uuid("supplier_org_id").references(() => organizations.id),
    status: slotStatus("status").notNull().default("pending"),
    /** Envelope-encrypted 32-byte invite secret; its leaf is public on chain. */
    inviteSecretEnc: text("invite_secret_enc"),
    inviteLeaf: text("invite_leaf"),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("rfq_suppliers_slot_uq").on(t.rfqId, t.slotIndex),
    uniqueIndex("rfq_suppliers_email_uq").on(t.rfqId, t.inviteEmail),
    uniqueIndex("rfq_suppliers_org_uq").on(t.rfqId, t.supplierOrgId),
    index("rfq_suppliers_org_idx").on(t.supplierOrgId),
  ],
);

/** E-mail invitation tokens for an invite slot (re-sendable, revocable, expiring). */
export const supplierInvites = pgTable(
  "supplier_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqSupplierId: uuid("rfq_supplier_id")
      .notNull()
      .references(() => rfqSuppliers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    revokedAt: ts("revoked_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("supplier_invites_token_uq").on(t.tokenHash)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    rfqSupplierId: uuid("rfq_supplier_id")
      .notNull()
      .references(() => rfqSuppliers.id),
    supplierOrgId: uuid("supplier_org_id")
      .notNull()
      .references(() => organizations.id),
    status: quoteStatus("status").notNull().default("draft"),
    /** Encrypted working draft (editable until committed); never shown to the buyer. */
    draftEnc: text("draft_enc"),
    committedRevisionId: uuid("committed_revision_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quotes_rfq_org_uq").on(t.rfqId, t.supplierOrgId), index("quotes_org_idx").on(t.supplierOrgId)],
);

export const quoteRevisions = pgTable(
  "quote_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    /** Denormalised for row-level security and tenant-scoped queries. */
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    supplierOrgId: uuid("supplier_org_id")
      .notNull()
      .references(() => organizations.id),
    version: integer("version").notNull(),
    /** Encrypted normalised quote payload — exactly what was committed. Immutable. */
    payloadEnc: text("payload_enc").notNull(),
    /** Encrypted 256-bit commitment salt. Immutable. */
    saltEnc: text("salt_enc").notNull(),
    attachmentDigests: text("attachment_digests").array().notNull().default(sql`'{}'::text[]`),
    supplierAccountId: text("supplier_account_id").notNull(),
    commitmentHex: text("commitment_hex").notNull(),
    status: revisionStatus("status").notNull().default("prepared"),
    commitTxHash: text("commit_tx_hash"),
    chainCommittedAtNs: numeric("chain_committed_at_ns", { precision: 25, scale: 0 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("quote_revisions_version_uq").on(t.quoteId, t.version),
    index("quote_revisions_rfq_idx").on(t.rfqId),
  ],
);

export const privateAttachments = pgTable(
  "private_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => organizations.id),
    rfqId: uuid("rfq_id").references(() => rfqs.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    deliveryId: uuid("delivery_id"),
    kind: text("kind").notNull(),
    filenameEnc: text("filename_enc").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    /** Wrapped data key + IV for the stored ciphertext. */
    encMeta: text("enc_meta").notNull(),
    scanStatus: scanStatus("scan_status").notNull().default("quarantined_unscanned"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("private_attachments_owner_idx").on(t.ownerOrgId), uniqueIndex("private_attachments_key_uq").on(t.storageKey)],
);

/** Chain transactions anchoring commitments (policy, bids, delivery evidence). */
export const commitmentReceipts = pgTable(
  "commitment_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    quoteRevisionId: uuid("quote_revision_id").references(() => quoteRevisions.id),
    network: text("network").notNull(),
    txHash: text("tx_hash").notNull(),
    signerAccountId: text("signer_account_id").notNull(),
    receiverId: text("receiver_id").notNull(),
    methodName: text("method_name").notNull(),
    status: txStatus("status").notNull().default("submitted"),
    blockHash: text("block_hash"),
    blockTimestampNs: numeric("block_timestamp_ns", { precision: 25, scale: 0 }),
    failureReason: text("failure_reason"),
    submittedBy: uuid("submitted_by").references(() => users.id),
    createdAt: createdAt(),
    verifiedAt: ts("verified_at"),
  },
  (t) => [uniqueIndex("commitment_receipts_tx_uq").on(t.network, t.txHash), index("commitment_receipts_rfq_idx").on(t.rfqId)],
);

export const evaluationJobs = pgTable(
  "evaluation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    kind: text("kind").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    policyVersion: integer("policy_version").notNull(),
    modelId: text("model_id"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: ts("run_after").notNull().defaultNow(),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("evaluation_jobs_queue_idx").on(t.status, t.runAfter), index("evaluation_jobs_rfq_idx").on(t.rfqId)],
);

/** Minimal, verifiable evidence for one AI evaluation — never raw prompts or quote text. */
export const attestationEvidence = pgTable("attestation_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationJobId: uuid("evaluation_job_id")
    .notNull()
    .references(() => evaluationJobs.id),
  verificationPolicyVersion: text("verification_policy_version").notNull(),
  modelId: text("model_id").notNull(),
  verified: boolean("verified").notNull(),
  failureReasons: text("failure_reasons").array().notNull().default(sql`'{}'::text[]`),
  nonceHex: text("nonce_hex").notNull(),
  signingAlgo: text("signing_algo"),
  signingAddress: text("signing_address"),
  signatureKind: text("signature_kind"),
  signedText: text("signed_text"),
  signature: text("signature"),
  requestSha256: text("request_sha256"),
  responseSha256: text("response_sha256"),
  gatewayQuoteSha256: text("gateway_quote_sha256"),
  modelQuoteSha256: text("model_quote_sha256"),
  tcbStatus: text("tcb_status"),
  gpuVerdict: text("gpu_verdict"),
  checks: jsonb("checks").notNull().default(sql`'[]'::jsonb`),
  fetchedAt: ts("fetched_at").notNull(),
  createdAt: createdAt(),
});

export const evaluationCriterionResults = pgTable(
  "evaluation_criterion_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationJobId: uuid("evaluation_job_id")
      .notNull()
      .references(() => evaluationJobs.id),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    criterionId: text("criterion_id").notNull(),
    label: text("label").notNull(),
    outcome: text("outcome").notNull(),
    basis: text("basis").notNull(),
    expected: text("expected").notNull(),
    actual: text("actual").notNull(),
    sourceField: text("source_field").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ecr_job_idx").on(t.evaluationJobId)],
);

/** AI qualitative notes per quote (encrypted); always advisory, never decisive. */
export const aiAssessments = pgTable("ai_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationJobId: uuid("evaluation_job_id")
    .notNull()
    .references(() => evaluationJobs.id),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id),
  notesEnc: text("notes_enc").notNull(),
  verified: boolean("verified").notNull(),
  createdAt: createdAt(),
});

export const awards = pgTable(
  "awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    round: integer("round").notNull(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    supplierOrgId: uuid("supplier_org_id")
      .notNull()
      .references(() => organizations.id),
    supplierAccountId: text("supplier_account_id").notNull(),
    amountYocto: numeric("amount_yocto", { precision: 40, scale: 0 }).notNull(),
    agreementEnc: text("agreement_enc").notNull(),
    agreementHash: text("agreement_hash").notNull(),
    acceptWindowMinutes: integer("accept_window_minutes").notNull(),
    reviewWindowMinutes: integer("review_window_minutes").notNull(),
    reviewerAccountId: text("reviewer_account_id"),
    status: awardStatus("status").notNull().default("pending_signature"),
    overrideReason: text("override_reason"),
    chosenBy: uuid("chosen_by")
      .notNull()
      .references(() => users.id),
    chainAttempt: integer("chain_attempt").notNull().default(0),
    chainSyncedAt: ts("chain_synced_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("awards_rfq_round_uq").on(t.rfqId, t.round), check("awards_amount_positive", sql`${t.amountYocto} > 0`)],
);

/** Chain transactions that move or govern escrow (award, fund, accept, release, refund…). */
export const escrowTransactions = pgTable(
  "escrow_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    awardId: uuid("award_id").references(() => awards.id),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    action: text("action").notNull(),
    network: text("network").notNull(),
    txHash: text("tx_hash").notNull(),
    signerAccountId: text("signer_account_id").notNull(),
    receiverId: text("receiver_id").notNull(),
    methodName: text("method_name").notNull(),
    depositYocto: numeric("deposit_yocto", { precision: 40, scale: 0 }).notNull().default("0"),
    status: txStatus("status").notNull().default("submitted"),
    blockHash: text("block_hash"),
    blockTimestampNs: numeric("block_timestamp_ns", { precision: 25, scale: 0 }),
    /** Transfer leg outcome for release/refund (from the callback receipt), when applicable. */
    transferOutcome: text("transfer_outcome"),
    failureReason: text("failure_reason"),
    submittedBy: uuid("submitted_by").references(() => users.id),
    createdAt: createdAt(),
    verifiedAt: ts("verified_at"),
  },
  (t) => [uniqueIndex("escrow_transactions_tx_uq").on(t.network, t.txHash), index("escrow_transactions_rfq_idx").on(t.rfqId)],
);

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  awardId: uuid("award_id")
    .notNull()
    .references(() => awards.id),
  noteEnc: text("note_enc").notNull(),
  fileDigests: text("file_digests").array().notNull().default(sql`'{}'::text[]`),
  evidenceHash: text("evidence_hash").notNull(),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  awardId: uuid("award_id")
    .notNull()
    .references(() => awards.id),
  openedByParty: text("opened_by_party").notNull(),
  reasonEnc: text("reason_enc").notNull(),
  outcome: text("outcome"),
  openedBy: uuid("opened_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  resolvedAt: ts("resolved_at"),
});

/**
 * Append-only, hash-chained audit log. `metadata` must already be redacted (no quote text,
 * tokens, secrets or signed URLs). `event_hash = sha256(prev_hash || canonical(event))`.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    actorAccountId: text("actor_account_id"),
    orgId: uuid("org_id"),
    rfqId: uuid("rfq_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    txHash: text("tx_hash"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    prevHash: text("prev_hash").notNull(),
    eventHash: text("event_hash").notNull(),
  },
  (t) => [index("audit_events_rfq_idx").on(t.rfqId, t.id), index("audit_events_org_idx").on(t.orgId, t.id)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    linkPath: text("link_path"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  toEmail: text("to_email").notNull(),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  status: emailStatus("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  sentAt: ts("sent_at"),
});

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    userId: uuid("user_id").notNull(),
    key: text("key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  contactEmail: text("contact_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
});

/** Cursor for the chain reconciler (last processed state per tracked object). */
export const chainCursors = pgTable("chain_cursors", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const intentStatus = pgEnum("intent_status", ["prepared", "submitted", "confirmed", "failed", "expired"]);

/**
 * A wallet transaction the server prepared. Verification compares the on-chain transaction to
 * this row (never to client input). Also the source of the pre-signature preview and the anchor
 * for duplicate-click protection: one open intent per (user, kind, ref).
 */
export const txIntents = pgTable(
  "tx_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind").notNull(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id),
    refId: text("ref_id").notNull(),
    network: text("network").notNull(),
    signerId: text("signer_id").notNull(),
    receiverId: text("receiver_id").notNull(),
    methodName: text("method_name").notNull(),
    args: jsonb("args").notNull(),
    depositYocto: numeric("deposit_yocto", { precision: 40, scale: 0 }).notNull(),
    gas: text("gas").notNull(),
    status: intentStatus("status").notNull().default("prepared"),
    txHash: text("tx_hash"),
    error: text("error"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    confirmedAt: ts("confirmed_at"),
  },
  (t) => [
    uniqueIndex("tx_intents_open_uq").on(t.userId, t.kind, t.refId).where(sql`${t.status} in ('prepared', 'submitted')`),
    index("tx_intents_rfq_idx").on(t.rfqId),
    index("tx_intents_pending_idx").on(t.status),
  ],
);
