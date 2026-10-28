-- Body-type cargo capacity for haulage dispatch constraints.

ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS max_payload_kg NUMERIC(8, 2)
    CHECK (max_payload_kg IS NULL OR max_payload_kg > 0),
  ADD COLUMN IF NOT EXISTS cargo_length_cm NUMERIC(8, 2)
    CHECK (cargo_length_cm IS NULL OR cargo_length_cm > 0),
  ADD COLUMN IF NOT EXISTS cargo_width_cm NUMERIC(8, 2)
    CHECK (cargo_width_cm IS NULL OR cargo_width_cm > 0),
  ADD COLUMN IF NOT EXISTS cargo_height_cm NUMERIC(8, 2)
    CHECK (cargo_height_cm IS NULL OR cargo_height_cm > 0),
  ADD COLUMN IF NOT EXISTS supports_upright_load BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rides.vehicle_types.max_payload_kg IS 'Max cargo weight for haulage dispatch (vehicle body types only).';
COMMENT ON COLUMN rides.vehicle_types.cargo_length_cm IS 'Usable cargo length (vehicle body types only).';
COMMENT ON COLUMN rides.vehicle_types.supports_upright_load IS 'Can transport upright appliances (vans, trucks).';

DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

NOTIFY pgrst, 'reload schema';
