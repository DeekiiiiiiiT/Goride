-- Run in the Supabase SQL Editor (live). WRA-72: cash tolls from toll v2 + data beats attest.
-- Paste the body of supabase/migrations/20261117204932_cash_tolls_driver_reported.sql here, then run this block:
BEGIN;

-- (run migration 20261117204932_cash_tolls_driver_reported.sql in the editor first, in the same transaction if you prefer)

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261117204932', 'cash_tolls_driver_reported')
ON CONFLICT (version) DO NOTHING;

COMMIT;

SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261117204932') AS logbook_line,
       to_regprocedure('public.cash_tolls_week_volume(text, date)') IS NOT NULL AS volume_rpc;