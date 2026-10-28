-- engine_type: free text (OEM / spreadsheet labels), not limited to induction enum.

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_engine_type_check;

COMMENT ON COLUMN public.vehicle_catalog.engine_type IS 'Free-text engine / induction label (e.g. Turbo, Hybrid, N/A)';
