-- Optional OEM / platform model code (e.g. chassis code) beside generation.
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS model_code text;

COMMENT ON COLUMN public.vehicle_catalog.model_code IS 'OEM or platform model code (optional).';
