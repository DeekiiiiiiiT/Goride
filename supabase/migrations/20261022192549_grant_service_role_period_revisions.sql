-- Applied on production from the dashboard. Service role can read and write
-- ledger period revisions. anon and authenticated are not granted here.
DO $$
BEGIN
  IF to_regclass('ledger.driver_period_revisions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE ledger.driver_period_revisions TO service_role;
  END IF;
END $$;
