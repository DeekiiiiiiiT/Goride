-- Idempotent column + constraint parity for CSV import when a remote DB skipped earlier migrations.
-- Runtime evidence: POST body included production_start_month, engine_code, engine_type, PIM columns,
-- but SELECT returned NULL — inserts had dropped keys because columns were absent from PostgREST schema.

ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS production_start_month smallint,
  ADD COLUMN IF NOT EXISTS production_end_month smallint,
  ADD COLUMN IF NOT EXISTS engine_code text,
  ADD COLUMN IF NOT EXISTS full_model_code text,
  ADD COLUMN IF NOT EXISTS catalog_trim text,
  ADD COLUMN IF NOT EXISTS emissions_prefix text,
  ADD COLUMN IF NOT EXISTS trim_suffix_code text,
  ADD COLUMN IF NOT EXISTS fuel_category text,
  ADD COLUMN IF NOT EXISTS fuel_grade text;

-- Allow spreadsheet values like "N/A" (see 20260426120100_vehicle_catalog_engine_type_free_text.sql).
ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_type_check;
