-- Advisor remediation Phase C: RLS on platform PII tables + invoker on platform views

-- ---------------------------------------------------------------------------
-- 1. platform.identities
-- ---------------------------------------------------------------------------
ALTER TABLE platform.identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identities_select_self_or_staff ON platform.identities;
CREATE POLICY identities_select_self_or_staff
  ON platform.identities
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR platform.current_user_is_platform_staff()
  );

DROP POLICY IF EXISTS identities_no_insert ON platform.identities;
CREATE POLICY identities_no_insert
  ON platform.identities
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS identities_no_update ON platform.identities;
CREATE POLICY identities_no_update
  ON platform.identities
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS identities_no_delete ON platform.identities;
CREATE POLICY identities_no_delete
  ON platform.identities
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE ALL ON TABLE platform.identities FROM PUBLIC, anon;
GRANT SELECT ON TABLE platform.identities TO authenticated;
GRANT ALL ON TABLE platform.identities TO service_role;

-- ---------------------------------------------------------------------------
-- 2. platform.pending_invites
-- ---------------------------------------------------------------------------
ALTER TABLE platform.pending_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_invites_select_staff_or_inviter ON platform.pending_invites;
CREATE POLICY pending_invites_select_staff_or_inviter
  ON platform.pending_invites
  FOR SELECT
  TO authenticated
  USING (
    platform.current_user_is_platform_staff()
    OR invited_by = auth.uid()
    OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS pending_invites_no_insert ON platform.pending_invites;
CREATE POLICY pending_invites_no_insert
  ON platform.pending_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS pending_invites_no_update ON platform.pending_invites;
CREATE POLICY pending_invites_no_update
  ON platform.pending_invites
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS pending_invites_no_delete ON platform.pending_invites;
CREATE POLICY pending_invites_no_delete
  ON platform.pending_invites
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE ALL ON TABLE platform.pending_invites FROM PUBLIC, anon;
GRANT SELECT ON TABLE platform.pending_invites TO authenticated;
GRANT ALL ON TABLE platform.pending_invites TO service_role;

-- ---------------------------------------------------------------------------
-- 3. platform.identity_communication_log
-- ---------------------------------------------------------------------------
ALTER TABLE platform.identity_communication_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_communication_log_select_staff ON platform.identity_communication_log;
CREATE POLICY identity_communication_log_select_staff
  ON platform.identity_communication_log
  FOR SELECT
  TO authenticated
  USING (platform.current_user_is_platform_staff());

DROP POLICY IF EXISTS identity_communication_log_no_insert ON platform.identity_communication_log;
CREATE POLICY identity_communication_log_no_insert
  ON platform.identity_communication_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS identity_communication_log_no_update ON platform.identity_communication_log;
CREATE POLICY identity_communication_log_no_update
  ON platform.identity_communication_log
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS identity_communication_log_no_delete ON platform.identity_communication_log;
CREATE POLICY identity_communication_log_no_delete
  ON platform.identity_communication_log
  FOR DELETE
  TO authenticated
  USING (false);

REVOKE ALL ON TABLE platform.identity_communication_log FROM PUBLIC, anon;
GRANT SELECT ON TABLE platform.identity_communication_log TO authenticated;
GRANT ALL ON TABLE platform.identity_communication_log TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Platform views: security_invoker
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'platform' AND c.relname = 'merchant_staff_role_aliases' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW platform.merchant_staff_role_aliases SET (security_invoker = true)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'platform' AND c.relname = 'identity_personas' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW platform.identity_personas SET (security_invoker = true)';
  END IF;
END $$;
