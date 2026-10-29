CREATE TYPE "public"."award_status" AS ENUM('pending_signature', 'awarded', 'funded', 'accepted', 'delivered', 'release_pending', 'release_failed', 'paid', 'disputed', 'refund_pending', 'refund_failed', 'refunded', 'revoked', 'declined');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed', 'not_configured');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('buyer', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'committing', 'committed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('prepared', 'submitted', 'committed', 'superseded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('draft', 'publishing', 'open', 'closed', 'awarded', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('quarantined_unscanned', 'clean', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TABLE "ai_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_job_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"notes_enc" text NOT NULL,
	"verified" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attestation_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_job_id" uuid NOT NULL,
	"verification_policy_version" text NOT NULL,
	"model_id" text NOT NULL,
	"verified" boolean NOT NULL,
	"failure_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"nonce_hex" text NOT NULL,
	"signing_algo" text,
	"signing_address" text,
	"signature_kind" text,
	"signed_text" text,
	"signature" text,
	"request_sha256" text,
	"response_sha256" text,
	"gateway_quote_sha256" text,
	"model_quote_sha256" text,
	"tcb_status" text,
	"gpu_verdict" text,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_account_id" text,
	"org_id" uuid,
	"rfq_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"tx_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"event_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"quote_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"supplier_account_id" text NOT NULL,
	"amount_yocto" numeric(40, 0) NOT NULL,
	"agreement_enc" text NOT NULL,
	"agreement_hash" text NOT NULL,
	"accept_window_minutes" integer NOT NULL,
	"review_window_minutes" integer NOT NULL,
	"reviewer_account_id" text,
	"status" "award_status" DEFAULT 'pending_signature' NOT NULL,
	"override_reason" text,
	"chosen_by" uuid NOT NULL,
	"chain_attempt" integer DEFAULT 0 NOT NULL,
	"chain_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "awards_amount_positive" CHECK ("awards"."amount_yocto" > 0)
);
--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"rfq_id" uuid NOT NULL,
	"quote_revision_id" uuid,
	"network" text NOT NULL,
	"tx_hash" text NOT NULL,
	"signer_account_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"method_name" text NOT NULL,
	"status" "tx_status" DEFAULT 'submitted' NOT NULL,
	"block_hash" text,
	"block_timestamp_ns" numeric(25, 0),
	"failure_reason" text,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"award_id" uuid NOT NULL,
	"note_enc" text NOT NULL,
	"file_digests" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidence_hash" text NOT NULL,
	"submitted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"award_id" uuid NOT NULL,
	"opened_by_party" text NOT NULL,
	"reason_enc" text NOT NULL,
	"outcome" text,
	"opened_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"award_id" uuid,
	"rfq_id" uuid NOT NULL,
	"action" text NOT NULL,
	"network" text NOT NULL,
	"tx_hash" text NOT NULL,
	"signer_account_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"method_name" text NOT NULL,
	"deposit_yocto" numeric(40, 0) DEFAULT '0' NOT NULL,
	"status" "tx_status" DEFAULT 'submitted' NOT NULL,
	"block_hash" text,
	"block_timestamp_ns" numeric(25, 0),
	"transfer_outcome" text,
	"failure_reason" text,
	"submitted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evaluation_criterion_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_job_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"criterion_id" text NOT NULL,
	"label" text NOT NULL,
	"outcome" text NOT NULL,
	"basis" text NOT NULL,
	"expected" text NOT NULL,
	"actual" text NOT NULL,
	"source_field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"requested_by" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"model_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"next_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link_path" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "org_kind" NOT NULL,
	"website" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"rfq_id" uuid,
	"quote_id" uuid,
	"delivery_id" uuid,
	"kind" text NOT NULL,
	"filename_enc" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"enc_meta" text NOT NULL,
	"scan_status" "scan_status" DEFAULT 'quarantined_unscanned' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quote_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload_enc" text NOT NULL,
	"salt_enc" text NOT NULL,
	"attachment_digests" text[] DEFAULT '{}'::text[] NOT NULL,
	"supplier_account_id" text NOT NULL,
	"commitment_hex" text NOT NULL,
	"status" "revision_status" DEFAULT 'prepared' NOT NULL,
	"commit_tx_hash" text,
	"chain_committed_at_ns" numeric(25, 0),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"rfq_supplier_id" uuid NOT NULL,
	"supplier_org_id" uuid NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"draft_enc" text,
	"committed_revision_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "rfq_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"policy_enc" text NOT NULL,
	"policy_hash" text NOT NULL,
	"terms_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"slot_index" integer NOT NULL,
	"invite_email" text NOT NULL,
	"supplier_org_id" uuid,
	"status" "slot_status" DEFAULT 'pending' NOT NULL,
	"invite_secret_enc" text,
	"invite_leaf" text,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "rfq_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"draft_enc" text NOT NULL,
	"deadline_at" timestamp with time zone,
	"network" text,
	"contract_id" text,
	"onchain_id" bigint,
	"buyer_account_id" text,
	"policy_hash" text,
	"terms_hash" text,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"chain_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"active_org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "supplier_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_supplier_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"contact_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"email_verified_at" timestamp with time zone,
	"is_platform_operator" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_lower" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "wallet_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"public_key" text NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wallet_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"nonce_hex" text NOT NULL,
	"recipient" text NOT NULL,
	"message" text NOT NULL,
	"allow_rebind" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_assessments" ADD CONSTRAINT "ai_assessments_evaluation_job_id_evaluation_jobs_id_fk" FOREIGN KEY ("evaluation_job_id") REFERENCES "public"."evaluation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_assessments" ADD CONSTRAINT "ai_assessments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_evidence" ADD CONSTRAINT "attestation_evidence_evaluation_job_id_evaluation_jobs_id_fk" FOREIGN KEY ("evaluation_job_id") REFERENCES "public"."evaluation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_chosen_by_users_id_fk" FOREIGN KEY ("chosen_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_receipts" ADD CONSTRAINT "commitment_receipts_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_receipts" ADD CONSTRAINT "commitment_receipts_quote_revision_id_quote_revisions_id_fk" FOREIGN KEY ("quote_revision_id") REFERENCES "public"."quote_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_receipts" ADD CONSTRAINT "commitment_receipts_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criterion_results" ADD CONSTRAINT "evaluation_criterion_results_evaluation_job_id_evaluation_jobs_id_fk" FOREIGN KEY ("evaluation_job_id") REFERENCES "public"."evaluation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criterion_results" ADD CONSTRAINT "evaluation_criterion_results_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD CONSTRAINT "evaluation_jobs_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_jobs" ADD CONSTRAINT "evaluation_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invites" ADD CONSTRAINT "member_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attachments" ADD CONSTRAINT "private_attachments_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attachments" ADD CONSTRAINT "private_attachments_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attachments" ADD CONSTRAINT "private_attachments_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_attachments" ADD CONSTRAINT "private_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_supplier_id_rfq_suppliers_id_fk" FOREIGN KEY ("rfq_supplier_id") REFERENCES "public"."rfq_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_policy_versions" ADD CONSTRAINT "rfq_policy_versions_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_policy_versions" ADD CONSTRAINT "rfq_policy_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_supplier_org_id_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_rfq_supplier_id_rfq_suppliers_id_fk" FOREIGN KEY ("rfq_supplier_id") REFERENCES "public"."rfq_suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invites" ADD CONSTRAINT "supplier_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_bindings" ADD CONSTRAINT "wallet_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_challenges" ADD CONSTRAINT "wallet_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_rfq_idx" ON "audit_events" USING btree ("rfq_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_org_idx" ON "audit_events" USING btree ("org_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "awards_rfq_round_uq" ON "awards" USING btree ("rfq_id","round");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_receipts_tx_uq" ON "commitment_receipts" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE INDEX "commitment_receipts_rfq_idx" ON "commitment_receipts" USING btree ("rfq_id");--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_transactions_tx_uq" ON "escrow_transactions" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE INDEX "escrow_transactions_rfq_idx" ON "escrow_transactions" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "ecr_job_idx" ON "evaluation_criterion_results" USING btree ("evaluation_job_id");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_queue_idx" ON "evaluation_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "evaluation_jobs_rfq_idx" ON "evaluation_jobs" USING btree ("rfq_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_uq" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_invites_token_uq" ON "member_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "member_invites_org_idx" ON "member_invites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "private_attachments_owner_idx" ON "private_attachments" USING btree ("owner_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "private_attachments_key_uq" ON "private_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_revisions_version_uq" ON "quote_revisions" USING btree ("quote_id","version");--> statement-breakpoint
CREATE INDEX "quote_revisions_rfq_idx" ON "quote_revisions" USING btree ("rfq_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_rfq_org_uq" ON "quotes" USING btree ("rfq_id","supplier_org_id");--> statement-breakpoint
CREATE INDEX "quotes_org_idx" ON "quotes" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_policy_versions_uq" ON "rfq_policy_versions" USING btree ("rfq_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_suppliers_slot_uq" ON "rfq_suppliers" USING btree ("rfq_id","slot_index");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_suppliers_email_uq" ON "rfq_suppliers" USING btree ("rfq_id","invite_email");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_suppliers_org_uq" ON "rfq_suppliers" USING btree ("rfq_id","supplier_org_id");--> statement-breakpoint
CREATE INDEX "rfq_suppliers_org_idx" ON "rfq_suppliers" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE INDEX "rfqs_buyer_idx" ON "rfqs" USING btree ("buyer_org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfqs_onchain_uq" ON "rfqs" USING btree ("network","contract_id","onchain_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invites_token_uq" ON "supplier_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_bindings_account_active_uq" ON "wallet_bindings" USING btree ("network","account_id") WHERE "wallet_bindings"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_bindings_user_active_uq" ON "wallet_bindings" USING btree ("user_id","network") WHERE "wallet_bindings"."revoked_at" is null;