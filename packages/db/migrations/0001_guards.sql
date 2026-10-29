-- VeilProcure database guards (defence in depth beneath application authorization).
--
-- 1. Least-privilege grants for the app (veil_app) and worker (veil_worker) roles, if present.
-- 2. Append-only / immutable tables enforced by triggers, not just by convention.
-- 3. Row-level security on quote tables: a supplier org sees only its own quotes; a buyer org
--    sees committed quote revisions only after its RFQ has closed. The web app connects as
--    veil_app (subject to RLS) and sets `veil.org_ids` per transaction (packages/db withActor).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veil_app') THEN
    GRANT USAGE ON SCHEMA public TO veil_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO veil_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO veil_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, rfq_policy_versions FROM veil_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veil_worker') THEN
    GRANT USAGE ON SCHEMA public TO veil_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO veil_worker;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO veil_worker;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, rfq_policy_versions FROM veil_worker;
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION veil_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'VEIL_IMMUTABLE: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION veil_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION veil_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER rfq_policy_versions_immutable
  BEFORE UPDATE OR DELETE ON rfq_policy_versions
  FOR EACH ROW EXECUTE FUNCTION veil_forbid_mutation();
--> statement-breakpoint
-- Quote revisions: lifecycle status / chain fields may advance; the committed content may not.
CREATE OR REPLACE FUNCTION veil_quote_revision_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VEIL_IMMUTABLE: quote revisions cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.payload_enc IS DISTINCT FROM OLD.payload_enc
     OR NEW.salt_enc IS DISTINCT FROM OLD.salt_enc
     OR NEW.commitment_hex IS DISTINCT FROM OLD.commitment_hex
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
     OR NEW.rfq_id IS DISTINCT FROM OLD.rfq_id
     OR NEW.supplier_org_id IS DISTINCT FROM OLD.supplier_org_id
     OR NEW.supplier_account_id IS DISTINCT FROM OLD.supplier_account_id
     OR NEW.attachment_digests IS DISTINCT FROM OLD.attachment_digests THEN
    RAISE EXCEPTION 'VEIL_IMMUTABLE: committed quote content cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quote_revisions_guard
  BEFORE UPDATE OR DELETE ON quote_revisions
  FOR EACH ROW EXECUTE FUNCTION veil_quote_revision_guard();
--> statement-breakpoint
-- Frozen RFQ policy fields cannot change once an on-chain id has been recorded.
CREATE OR REPLACE FUNCTION veil_rfq_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.onchain_id IS NOT NULL AND (
       NEW.policy_hash IS DISTINCT FROM OLD.policy_hash
    OR NEW.terms_hash IS DISTINCT FROM OLD.terms_hash
    OR NEW.onchain_id IS DISTINCT FROM OLD.onchain_id
    OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
    OR NEW.network IS DISTINCT FROM OLD.network
    OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at
    OR NEW.buyer_org_id IS DISTINCT FROM OLD.buyer_org_id) THEN
    RAISE EXCEPTION 'VEIL_IMMUTABLE: published RFQ policy fields cannot change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rfqs_guard
  BEFORE UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION veil_rfq_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION veil_actor_orgs() RETURNS uuid[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('veil.org_ids', true), ''), '{}')::uuid[]
$$;
--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quote_revisions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE private_attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY quotes_supplier_all ON quotes FOR ALL
  USING (supplier_org_id = ANY (veil_actor_orgs()))
  WITH CHECK (supplier_org_id = ANY (veil_actor_orgs()));
--> statement-breakpoint
CREATE POLICY quotes_buyer_after_close ON quotes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM rfqs r
    WHERE r.id = quotes.rfq_id
      AND r.buyer_org_id = ANY (veil_actor_orgs())
      AND r.status IN ('closed', 'awarded', 'settled')));
--> statement-breakpoint
CREATE POLICY quote_revisions_supplier_all ON quote_revisions FOR ALL
  USING (supplier_org_id = ANY (veil_actor_orgs()))
  WITH CHECK (supplier_org_id = ANY (veil_actor_orgs()));
--> statement-breakpoint
CREATE POLICY quote_revisions_buyer_committed_after_close ON quote_revisions FOR SELECT
  USING (status = 'committed' AND EXISTS (
    SELECT 1 FROM rfqs r
    WHERE r.id = quote_revisions.rfq_id
      AND r.buyer_org_id = ANY (veil_actor_orgs())
      AND r.status IN ('closed', 'awarded', 'settled')));
--> statement-breakpoint
CREATE POLICY attachments_owner_all ON private_attachments FOR ALL
  USING (owner_org_id = ANY (veil_actor_orgs()))
  WITH CHECK (owner_org_id = ANY (veil_actor_orgs()));
--> statement-breakpoint
-- Buyer may read quote attachments that are part of a committed revision, after close.
CREATE POLICY attachments_buyer_quote_after_close ON private_attachments FOR SELECT
  USING (kind = 'quote' AND EXISTS (
    SELECT 1 FROM quote_revisions qr JOIN rfqs r ON r.id = qr.rfq_id
    WHERE qr.quote_id = private_attachments.quote_id
      AND qr.status = 'committed'
      AND private_attachments.sha256 = ANY (qr.attachment_digests)
      AND r.buyer_org_id = ANY (veil_actor_orgs())
      AND r.status IN ('closed', 'awarded', 'settled')));
--> statement-breakpoint
-- Buyer may read delivery evidence for awards on its own RFQs.
CREATE POLICY attachments_buyer_delivery ON private_attachments FOR SELECT
  USING (kind = 'delivery' AND EXISTS (
    SELECT 1 FROM deliveries d JOIN awards a ON a.id = d.award_id JOIN rfqs r ON r.id = a.rfq_id
    WHERE d.id = private_attachments.delivery_id
      AND r.buyer_org_id = ANY (veil_actor_orgs())));
--> statement-breakpoint
-- Accepted invitees may read the buyer's RFQ attachments once the RFQ is published.
CREATE POLICY attachments_invitee_rfq ON private_attachments FOR SELECT
  USING (kind = 'rfq' AND EXISTS (
    SELECT 1 FROM rfq_suppliers s JOIN rfqs r ON r.id = s.rfq_id
    WHERE s.rfq_id = private_attachments.rfq_id
      AND s.status = 'accepted'
      AND s.supplier_org_id = ANY (veil_actor_orgs())
      AND r.status <> 'draft'));
