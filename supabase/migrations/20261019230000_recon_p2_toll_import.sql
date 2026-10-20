-- Week Reconciliation P2: staged toll import + provider_ref unique index.
-- See WEEK_RECONCILIATION_WIZARD_AUDIT.md §4.5 / WR-C3, WR-H1.

ALTER TABLE fleet.toll_ledger
  ADD COLUMN IF NOT EXISTS provider_ref text;

UPDATE fleet.toll_ledger l
SET provider_ref = NULLIF(trim(
  coalesce(
    l.payload_json->>'referenceNumber',
    l.metadata->>'referenceNumber',
    l.payload_json->'metadata'->>'referenceNumber'
  )
), '')
WHERE l.provider_ref IS NULL OR trim(l.provider_ref) = '';

CREATE OR REPLACE FUNCTION fleet.toll_ledger_sync_provider_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_ref IS NULL OR btrim(NEW.provider_ref) = '' THEN
    NEW.provider_ref := NULLIF(btrim(coalesce(
      NEW.payload_json->>'referenceNumber',
      NEW.metadata->>'referenceNumber',
      NEW.payload_json->'metadata'->>'referenceNumber'
    )), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS toll_ledger_provider_ref_biu ON fleet.toll_ledger;
CREATE TRIGGER toll_ledger_provider_ref_biu
  BEFORE INSERT OR UPDATE ON fleet.toll_ledger
  FOR EACH ROW
  EXECUTE FUNCTION fleet.toll_ledger_sync_provider_ref();

CREATE UNIQUE INDEX IF NOT EXISTS fleet_toll_ledger_org_provider_ref_uidx
  ON fleet.toll_ledger (organization_id, provider_ref)
  WHERE provider_ref IS NOT NULL AND trim(provider_ref) <> '';

COMMENT ON COLUMN fleet.toll_ledger.provider_ref IS
  'Provider transaction id (Txn ID). Authoritative dedupe key per org; do not rely on client fingerprint alone.';

-- Staged import pipeline (recon schema).
CREATE TABLE IF NOT EXISTS recon.import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'parsed', 'committed', 'rolled_back')),
  file_name text,
  file_sha256 text,
  week_key date CHECK (week_key IS NULL OR extract(isodow FROM week_key) = 1),
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_reason text,
  idempotency_key text,
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS recon_import_staging_org_status_idx
  ON recon.import_staging (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS recon.import_staging_rows (
  import_id uuid NOT NULL REFERENCES recon.import_staging (id) ON DELETE CASCADE,
  row_index int NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  classification text NOT NULL DEFAULT 'new'
    CHECK (classification IN (
      'new', 'duplicate_ref', 'duplicate_fingerprint', 'rejected', 'spill'
    )),
  week_key date,
  override_keep boolean NOT NULL DEFAULT false,
  PRIMARY KEY (import_id, row_index)
);

CREATE INDEX IF NOT EXISTS recon_import_staging_rows_import_class_idx
  ON recon.import_staging_rows (import_id, classification);

-- Tag balance is derived from toll_ledger (WR-C3). Vehicle payload may cache tollBalance;
-- toll CSV import must NOT read-modify-write that cache — use fleet.compute_vehicle_tag_balance.
COMMENT ON TABLE recon.import_staging IS
  'Server-staged imports for reconciliation sources. Toll commits write fleet.toll_ledger only; tag balance is Σ ledger.';

CREATE OR REPLACE FUNCTION fleet.compute_vehicle_tag_balance(p_vehicle_id text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT coalesce(sum(l.amount), 0)
  FROM fleet.toll_ledger l
  WHERE l.vehicle_id = p_vehicle_id
    AND lower(coalesce(l.status, '')) NOT IN ('voided', 'void')
    AND coalesce(l.metadata->>'voided', l.payload_json->'metadata'->>'voided', '') NOT IN ('true', 't')
    AND coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') NOT ILIKE '%cash%'
    AND coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') NOT ILIKE '%card%'
    AND coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') NOT ILIKE '%fleet%'
    AND coalesce(nullif(l.payment_method, ''), l.payload_json->>'paymentMethod', '') NOT ILIKE '%account%';
$$;

CREATE OR REPLACE FUNCTION public.fleet_compute_vehicle_tag_balance(p_vehicle_id text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT fleet.compute_vehicle_tag_balance(p_vehicle_id);
$$;

REVOKE ALL ON FUNCTION fleet.compute_vehicle_tag_balance(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_compute_vehicle_tag_balance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.compute_vehicle_tag_balance(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fleet_compute_vehicle_tag_balance(text) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON recon.import_staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON recon.import_staging_rows TO service_role;

CREATE OR REPLACE VIEW public.recon_import_staging AS
  SELECT * FROM recon.import_staging;

CREATE OR REPLACE VIEW public.recon_import_staging_rows AS
  SELECT * FROM recon.import_staging_rows;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recon_import_staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recon_import_staging_rows TO service_role;

NOTIFY pgrst, 'reload schema';
