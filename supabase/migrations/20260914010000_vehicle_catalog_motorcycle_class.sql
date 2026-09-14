-- Motorcycle catalog class + specs; class-scoped global maintenance templates.
-- Variant identity gains vehicle_class and motorcycle discriminators (brakes/tires/drive/starter).

-- ---------------------------------------------------------------------------
-- vehicle_catalog: class discriminator
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS vehicle_class text;

UPDATE public.vehicle_catalog
SET vehicle_class = 'car'
WHERE vehicle_class IS NULL OR trim(vehicle_class) = '';

ALTER TABLE public.vehicle_catalog
  ALTER COLUMN vehicle_class SET DEFAULT 'car';

ALTER TABLE public.vehicle_catalog
  ALTER COLUMN vehicle_class SET NOT NULL;

ALTER TABLE public.vehicle_catalog
  DROP CONSTRAINT IF EXISTS vehicle_catalog_vehicle_class_check;

ALTER TABLE public.vehicle_catalog
  ADD CONSTRAINT vehicle_catalog_vehicle_class_check
  CHECK (vehicle_class IN ('car', 'motorcycle'));

COMMENT ON COLUMN public.vehicle_catalog.vehicle_class IS
  'car (default) or motorcycle — filters facets, Rides body types, maintenance, and variant identity.';

-- ---------------------------------------------------------------------------
-- vehicle_catalog: motorcycle-specific nullable specs
-- ---------------------------------------------------------------------------
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS final_drive text,
  ADD COLUMN IF NOT EXISTS cooling_type text,
  ADD COLUMN IF NOT EXISTS starter_type text,
  ADD COLUMN IF NOT EXISTS seat_height_mm numeric,
  ADD COLUMN IF NOT EXISTS front_tire_size text,
  ADD COLUMN IF NOT EXISTS rear_tire_size text,
  ADD COLUMN IF NOT EXISTS front_suspension text,
  ADD COLUMN IF NOT EXISTS rear_suspension text,
  ADD COLUMN IF NOT EXISTS gear_count integer,
  ADD COLUMN IF NOT EXISTS dry_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS wheel_size_front text,
  ADD COLUMN IF NOT EXISTS wheel_size_rear text;

COMMENT ON COLUMN public.vehicle_catalog.final_drive IS 'Motorcycle final drive: chain, belt, or shaft.';
COMMENT ON COLUMN public.vehicle_catalog.cooling_type IS 'Motorcycle cooling: air, oil, or liquid.';
COMMENT ON COLUMN public.vehicle_catalog.starter_type IS 'Motorcycle starter: electric, kick, or both.';
COMMENT ON COLUMN public.vehicle_catalog.front_tire_size IS 'Motorcycle front tire size (cars keep tire_size).';
COMMENT ON COLUMN public.vehicle_catalog.rear_tire_size IS 'Motorcycle rear tire size (cars keep tire_size).';

-- ---------------------------------------------------------------------------
-- Variant uniqueness: prior 19 keys + class + motorcycle discriminators
-- ---------------------------------------------------------------------------
-- Live DB was missing this unique index and had exact duplicate Yaris rows from
-- re-import; collapse exact identity twins (keep earliest id) before recreate.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(both from make)),
        lower(trim(both from model)),
        lower(coalesce(trim_series, '')),
        lower(coalesce(full_model_code, '')),
        lower(coalesce(catalog_trim, '')),
        lower(coalesce(emissions_prefix, '')),
        lower(coalesce(trim_suffix_code, '')),
        lower(coalesce(chassis_code, '')),
        lower(coalesce(engine_code, '')),
        lower(coalesce(engine_type, '')),
        production_start_year,
        coalesce(production_start_month, 1),
        coalesce(production_end_year, 9999),
        coalesce(production_end_month, 12),
        lower(coalesce(drivetrain, '')),
        lower(coalesce(fuel_type, '')),
        lower(coalesce(fuel_category, '')),
        lower(coalesce(fuel_grade, '')),
        lower(coalesce(transmission, '')),
        lower(coalesce(front_brake_type, '')),
        lower(coalesce(rear_brake_type, ''))
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.vehicle_catalog
)
DELETE FROM public.vehicle_catalog vc
USING ranked r
WHERE vc.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS public.idx_vehicle_catalog_variant_identity;

CREATE UNIQUE INDEX idx_vehicle_catalog_variant_identity
  ON public.vehicle_catalog (
    lower(trim(both from make)),
    lower(trim(both from model)),
    lower(coalesce(trim_series, '')),
    lower(coalesce(full_model_code, '')),
    lower(coalesce(catalog_trim, '')),
    lower(coalesce(emissions_prefix, '')),
    lower(coalesce(trim_suffix_code, '')),
    lower(coalesce(chassis_code, '')),
    lower(coalesce(engine_code, '')),
    lower(coalesce(engine_type, '')),
    production_start_year,
    coalesce(production_start_month, 1),
    coalesce(production_end_year, 9999),
    coalesce(production_end_month, 12),
    lower(coalesce(drivetrain, '')),
    lower(coalesce(fuel_type, '')),
    lower(coalesce(fuel_category, '')),
    lower(coalesce(fuel_grade, '')),
    lower(coalesce(transmission, '')),
    lower(coalesce(vehicle_class, 'car')),
    lower(coalesce(final_drive, '')),
    lower(coalesce(starter_type, '')),
    lower(coalesce(front_tire_size, '')),
    lower(coalesce(rear_tire_size, '')),
    lower(coalesce(front_brake_type, '')),
    lower(coalesce(rear_brake_type, ''))
  );

-- ---------------------------------------------------------------------------
-- Global maintenance templates: class scope (existing rows stay car-only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS applicable_vehicle_classes text[];

UPDATE public.maintenance_task_templates
SET applicable_vehicle_classes = ARRAY['car']::text[]
WHERE applicable_vehicle_classes IS NULL;

ALTER TABLE public.maintenance_task_templates
  ALTER COLUMN applicable_vehicle_classes SET DEFAULT ARRAY['car']::text[];

ALTER TABLE public.maintenance_task_templates
  ALTER COLUMN applicable_vehicle_classes SET NOT NULL;

ALTER TABLE public.maintenance_task_templates
  DROP CONSTRAINT IF EXISTS maintenance_task_templates_applicable_vehicle_classes_check;

ALTER TABLE public.maintenance_task_templates
  ADD CONSTRAINT maintenance_task_templates_applicable_vehicle_classes_check
  CHECK (
    cardinality(applicable_vehicle_classes) >= 1
    AND applicable_vehicle_classes <@ ARRAY['car', 'motorcycle']::text[]
  );

COMMENT ON COLUMN public.maintenance_task_templates.applicable_vehicle_classes IS
  'Vehicle classes this template may apply to (global bootstrap filters on catalog vehicle_class).';
