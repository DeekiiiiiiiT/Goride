-- Native rides.payment_* tables had RLS enabled but no service_role GRANTs.
-- Edge wallet/debt paths via PostgREST schema=rides then hit "permission denied".
-- Public views already granted (20260620120002); also grant native tables for
-- environments that expose the rides schema in API settings.

GRANT SELECT, INSERT, UPDATE, DELETE ON rides.payment_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON rides.payment_journal_entries TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'rides' AND table_name = 'payment_obligations'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON rides.payment_obligations TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
