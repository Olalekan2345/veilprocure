CREATE TYPE "public"."intent_status" AS ENUM('prepared', 'submitted', 'confirmed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "tx_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rfq_id" uuid NOT NULL,
	"ref_id" text NOT NULL,
	"network" text NOT NULL,
	"signer_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"method_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"deposit_yocto" numeric(40, 0) NOT NULL,
	"gas" text NOT NULL,
	"status" "intent_status" DEFAULT 'prepared' NOT NULL,
	"tx_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tx_intents" ADD CONSTRAINT "tx_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tx_intents" ADD CONSTRAINT "tx_intents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tx_intents" ADD CONSTRAINT "tx_intents_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_intents_open_uq" ON "tx_intents" USING btree ("user_id","kind","ref_id") WHERE "tx_intents"."status" in ('prepared', 'submitted');--> statement-breakpoint
CREATE INDEX "tx_intents_rfq_idx" ON "tx_intents" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "tx_intents_pending_idx" ON "tx_intents" USING btree ("status");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veil_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tx_intents TO veil_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO veil_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO veil_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veil_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tx_intents TO veil_worker;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO veil_worker;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO veil_worker;
  END IF;
END $$;
