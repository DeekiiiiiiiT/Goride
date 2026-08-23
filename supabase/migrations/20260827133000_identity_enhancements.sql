-- Phase 8 foundations: phone verification, communication log, merchant role alias view

ALTER TABLE delivery.customers
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

ALTER TABLE delivery.courier_profiles
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON delivery.customers(phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.identity_communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  template_key TEXT,
  subject TEXT,
  body_preview TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_identity_comm_log_user ON platform.identity_communication_log(user_id, sent_at DESC);

-- Unified merchant staff role alias (reconciliation layer)
CREATE OR REPLACE VIEW platform.merchant_staff_role_aliases AS
SELECT
  mtm.id AS member_id,
  mtm.user_id,
  mtm.merchant_id,
  mtm.role AS legacy_role,
  CASE mtm.role
    WHEN 'admin' THEN 'merchant.staff.admin'
    WHEN 'manager' THEN 'merchant.staff.manager'
    ELSE 'merchant.staff.member'
  END AS platform_role
FROM delivery.merchant_team_members mtm;

GRANT SELECT ON platform.identity_communication_log TO service_role;
GRANT SELECT ON platform.merchant_staff_role_aliases TO service_role;
