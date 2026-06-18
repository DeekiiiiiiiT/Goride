-- Product line for rider-facing services (rideshare tiers vs courier, event, haulage).

ALTER TABLE rides.vehicle_types
  ADD COLUMN IF NOT EXISTS service_category TEXT
  CHECK (
    service_category IS NULL
    OR service_category IN ('rideshare', 'courier', 'event', 'haulage')
  );

UPDATE rides.vehicle_types
SET service_category = 'courier'
WHERE solution_kind = 'service' AND slug = 'courier';

UPDATE rides.vehicle_types
SET service_category = 'rideshare'
WHERE solution_kind = 'service'
  AND slug <> 'courier'
  AND service_category IS NULL;

INSERT INTO rides.vehicle_types (
  slug,
  label,
  description,
  seats,
  capacity_label,
  tagline,
  sort_order,
  is_active,
  solution_kind,
  service_category
)
VALUES
  (
    'event-booking',
    'Event booking',
    'Weddings, parties, group trips',
    0,
    'Variable',
    NULL,
    50,
    TRUE,
    'service',
    'event'
  ),
  (
    'haulage',
    'Haulage',
    'Move large items and heavy loads',
    0,
    'Variable',
    NULL,
    60,
    TRUE,
    'service',
    'haulage'
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  capacity_label = EXCLUDED.capacity_label,
  solution_kind = 'service',
  service_category = EXCLUDED.service_category;

DROP VIEW IF EXISTS public.rides_vehicle_types;
CREATE VIEW public.rides_vehicle_types AS
  SELECT * FROM rides.vehicle_types;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_vehicle_types TO service_role;

NOTIFY pgrst, 'reload schema';
