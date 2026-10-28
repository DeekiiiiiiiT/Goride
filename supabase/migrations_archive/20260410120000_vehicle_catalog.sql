-- Motor vehicle master catalog (Super Admin). Edge function uses service role (bypasses RLS).

CREATE TABLE IF NOT EXISTS public.vehicle_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary identification
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL CHECK (year >= 1900 AND year <= 2100),
  trim_series text,
  generation integer,

  -- Physical & body
  body_type text,
  doors integer,
  exterior_color text,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  wheelbase_mm numeric,
  ground_clearance_mm numeric,

  -- Technical & engine
  engine_displacement_l numeric,
  engine_displacement_cc numeric,
  engine_configuration text,
  fuel_type text,
  transmission text,
  drivetrain text,
  horsepower numeric,
  torque numeric,
  torque_unit text,

  -- Capacities & weight
  fuel_tank_capacity numeric,
  fuel_tank_unit text DEFAULT 'L',
  seating_capacity integer,
  curb_weight_kg numeric,
  gross_vehicle_weight_kg numeric,
  max_payload_kg numeric,
  max_towing_kg numeric,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_make_model_year ON public.vehicle_catalog (make, model, year);

COMMENT ON TABLE public.vehicle_catalog IS 'Platform-wide motor vehicle specification catalog (admin-managed).';

ALTER TABLE public.vehicle_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_catalog_no_direct_access" ON public.vehicle_catalog;
CREATE POLICY "vehicle_catalog_no_direct_access"
  ON public.vehicle_catalog FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
