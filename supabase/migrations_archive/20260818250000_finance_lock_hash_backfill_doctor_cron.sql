-- Stamp historical import money with the batch content fingerprint, persist doctor runs,
-- and schedule nightly finance-recon + finance-doctor (same caller as evidence-cleanup).

CREATE TABLE IF NOT EXISTS ledger.entries_hash_backfill_backup_20260818 AS
SELECT * FROM ledger.entries WHERE false;

ALTER TABLE ledger.entries_hash_backfill_backup_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ledger.entries_hash_backfill_backup_20260818 FROM PUBLIC;
GRANT SELECT ON TABLE ledger.entries_hash_backfill_backup_20260818 TO service_role;

INSERT INTO ledger.entries_hash_backfill_backup_20260818
SELECT e.*
FROM ledger.entries e
WHERE e.entry_type IN (
    'payout_cash',
    'payout_bank',
    'promotion',
    'statement_line',
    'payment_line',
    'toll_support_adjustment'
  )
  AND coalesce(e.metadata->>'sourceFileHash', '') = ''
  AND NOT EXISTS (
    SELECT 1 FROM ledger.entries_hash_backfill_backup_20260818 b WHERE b.id = e.id
  );

UPDATE ledger.entries e
SET metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
  'sourceFileHash', b.payload_json->>'contentFingerprint'
)
FROM fleet.import_batches b
WHERE b.id = e.metadata->>'batchId'
  AND coalesce(e.metadata->>'sourceFileHash', '') = ''
  AND length(coalesce(b.payload_json->>'contentFingerprint', '')) >= 8
  AND e.entry_type IN (
    'payout_cash',
    'payout_bank',
    'promotion',
    'statement_line',
    'payment_line',
    'toll_support_adjustment'
  );

CREATE TABLE IF NOT EXISTS ledger.finance_doctor_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL DEFAULT false,
  blocking BOOLEAN NOT NULL DEFAULT false,
  c1_clusters INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE ledger.finance_doctor_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON TABLE ledger.finance_doctor_runs TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_finance_recon()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/finance-recon',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_finance_doctor()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $$
DECLARE
  secret text;
  req_id bigint;
BEGIN
  SELECT value INTO secret FROM private.fleet_ops_secrets WHERE name = 'fleet_cron_secret';
  IF secret IS NULL OR length(secret) < 8 THEN
    RAISE EXCEPTION 'fleet_cron_secret missing';
  END IF;
  SELECT net.http_post(
    url := 'https://csfllzzastacofsvcdsc.supabase.co/functions/v1/finance-doctor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Fleet-Cron-Secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_finance_recon() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.invoke_finance_doctor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.invoke_finance_recon() TO postgres;
GRANT EXECUTE ON FUNCTION private.invoke_finance_doctor() TO postgres;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('fleet-finance-recon-nightly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('fleet-finance-doctor-nightly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'fleet-finance-recon-nightly',
      '0 4 * * *',
      $cmd$SELECT private.invoke_finance_recon();$cmd$
    );
    PERFORM cron.schedule(
      'fleet-finance-doctor-nightly',
      '10 4 * * *',
      $cmd$SELECT private.invoke_finance_doctor();$cmd$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available; schedule finance controls manually.';
END;
$cron$;

INSERT INTO ledger.cutover_meta (key, value)
VALUES ('finance_lock_source_file_hash_backfill_at', now()::text)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
