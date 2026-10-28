-- Vehicle catalog provenance for reversible bulk imports (§C1 enterprise hardening).
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Backfill any rows that somehow missed the default before the CHECK lands.
UPDATE public.vehicle_catalog
SET source = 'manual'
WHERE source IS NULL OR btrim(source) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicle_catalog_source_check'
      AND conrelid = 'public.vehicle_catalog'::regclass
  ) THEN
    ALTER TABLE public.vehicle_catalog
      ADD CONSTRAINT vehicle_catalog_source_check
      CHECK (source IN ('manual', 'csv_import', 'pending_approve'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_import_batch
  ON public.vehicle_catalog (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

COMMENT ON COLUMN public.vehicle_catalog.created_by IS 'Auth user that created the row (edge-stamped).';
COMMENT ON COLUMN public.vehicle_catalog.updated_by IS 'Auth user that last updated the row (edge-stamped).';
COMMENT ON COLUMN public.vehicle_catalog.import_batch_id IS 'UUID minted per CSV import run; enables undo-batch.';
COMMENT ON COLUMN public.vehicle_catalog.source IS 'manual | csv_import | pending_approve';
