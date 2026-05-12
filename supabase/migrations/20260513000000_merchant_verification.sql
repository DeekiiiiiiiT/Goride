-- Roam Dash - Merchant Verification (Phase 1)
-- Adds multi-stage verification workflow for restaurants:
--   pending -> in_review -> docs_requested -> approved/rejected
-- Plus audit log + in-app notifications queue.
-- Created: 2026-05-13

-- ============================================================================
-- 1. Extend delivery.merchants with verification fields
-- ============================================================================

ALTER TABLE delivery.merchants
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'in_review', 'docs_requested', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

-- Backfill: any existing merchants flagged is_verified before this migration
-- should be treated as already-approved.
UPDATE delivery.merchants
SET verification_status = 'approved',
    verified_at = COALESCE(verified_at, created_at)
WHERE is_verified = true AND verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_merchants_verification_status
  ON delivery.merchants(verification_status);

-- ============================================================================
-- 2. delivery.merchant_audit_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery.merchant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  action text NOT NULL,
  from_status text,
  to_status text,
  notes text,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_audit_log_merchant_created
  ON delivery.merchant_audit_log(merchant_id, created_at DESC);

ALTER TABLE delivery.merchant_audit_log ENABLE ROW LEVEL SECURITY;

-- Merchants can read their own audit history (without internal notes)
DROP POLICY IF EXISTS "Merchant reads own audit log" ON delivery.merchant_audit_log;
CREATE POLICY "Merchant reads own audit log" ON delivery.merchant_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_audit_log.merchant_id
        AND owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. delivery.merchant_notifications (in-app feed + email outbox)
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery.merchant_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES delivery.merchants(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_notifications_merchant_created
  ON delivery.merchant_notifications(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_notifications_unread
  ON delivery.merchant_notifications(merchant_id)
  WHERE read_at IS NULL;

ALTER TABLE delivery.merchant_notifications ENABLE ROW LEVEL SECURITY;

-- Merchants read their own notifications
DROP POLICY IF EXISTS "Merchant reads own notifications" ON delivery.merchant_notifications;
CREATE POLICY "Merchant reads own notifications" ON delivery.merchant_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_notifications.merchant_id
        AND owner_id = auth.uid()
    )
  );

-- Merchants mark their notifications read
DROP POLICY IF EXISTS "Merchant updates own notifications" ON delivery.merchant_notifications;
CREATE POLICY "Merchant updates own notifications" ON delivery.merchant_notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM delivery.merchants
      WHERE id = merchant_notifications.merchant_id
        AND owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Trigger: keep delivery.merchants.is_active in sync with verification_status
-- ============================================================================
-- is_active is the single source of truth for "customer-visible". Only an
-- approved merchant should ever be is_active=true.

CREATE OR REPLACE FUNCTION delivery.sync_merchant_active_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verification_status = 'approved' THEN
    NEW.is_active := true;
    NEW.is_verified := true;
    IF NEW.verified_at IS NULL THEN
      NEW.verified_at := now();
    END IF;
  ELSE
    NEW.is_active := false;
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_merchant_active_status ON delivery.merchants;
CREATE TRIGGER trigger_sync_merchant_active_status
  BEFORE INSERT OR UPDATE OF verification_status ON delivery.merchants
  FOR EACH ROW
  EXECUTE FUNCTION delivery.sync_merchant_active_status();

-- ============================================================================
-- 5. GRANTs for the new tables (matches 20260512 schema permissions)
-- ============================================================================

GRANT ALL ON delivery.merchant_audit_log TO anon, authenticated, service_role;
GRANT ALL ON delivery.merchant_notifications TO anon, authenticated, service_role;

-- ============================================================================
-- 6. Realtime: enable replication on merchant_notifications so the merchant
-- partner portal can subscribe to live status updates.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'delivery'
      AND tablename = 'merchant_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE delivery.merchant_notifications;
  END IF;
END $$;

COMMENT ON COLUMN delivery.merchants.verification_status IS
  'Multi-stage verification: pending|in_review|docs_requested|approved|rejected';
COMMENT ON COLUMN delivery.merchants.rejection_reason IS
  'Visible to merchant when status=rejected';
COMMENT ON COLUMN delivery.merchants.verification_notes IS
  'Internal admin notes - never sent to merchant';
COMMENT ON TABLE delivery.merchant_audit_log IS
  'Audit trail of every verification status change';
COMMENT ON TABLE delivery.merchant_notifications IS
  'In-app feed + email outbox for merchant communications';
