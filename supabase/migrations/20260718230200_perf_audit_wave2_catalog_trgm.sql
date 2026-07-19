-- Perf audit Wave 2: vehicle catalog trigram search

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_make_trgm
  ON public.vehicle_catalog USING gin (make gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_model_trgm
  ON public.vehicle_catalog USING gin (model gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_trim_series_trgm
  ON public.vehicle_catalog USING gin (trim_series gin_trgm_ops);

DO $extra$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog'
      AND column_name = 'chassis_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_chassis_code_trgm
      ON public.vehicle_catalog USING gin (chassis_code gin_trgm_ops)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicle_catalog'
      AND column_name = 'engine_code'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_engine_code_trgm
      ON public.vehicle_catalog USING gin (engine_code gin_trgm_ops)';
  END IF;
END
$extra$;
