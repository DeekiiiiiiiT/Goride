DROP VIEW IF EXISTS public.fleet_maintenance_due_v CASCADE;
DROP VIEW IF EXISTS fleet.maintenance_due_v CASCADE;

CREATE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT organization_id, due_soon_km, due_soon_days
  FROM fleet.organization_settings
),
cur AS (
  SELECT * FROM fleet.vehicle_current_odometer_v
),
avg_km AS (
  SELECT
    vehicle_id,
    CASE
      WHEN count(*) >= 2 AND max(recorded_at) > min(recorded_at) THEN
        (max(reading) - min(reading)) / greatest(
          1,
          extract(epoch FROM (max(recorded_at) - min(recorded_at))) / 86400.0
        )
      ELSE NULL
    END AS avg_km_per_day
  FROM fleet.odometer_readings
  WHERE is_voided = false
    AND is_anomaly = false
    AND recorded_at >= now() - interval '30 days'
  GROUP BY vehicle_id
),
scored AS (
  SELECT
    vcs.organization_id,
    vcs.vehicle_id,
    vcs.category_id,
    vcs.position,
    c.name AS category_name,
    c.code AS category_code,
    c.overdue_effect,
    vcs.last_performed_miles,
    vcs.last_performed_date,
    vcs.baseline_odometer,
    vcs.baseline_date,
    vcs.baseline_source,
    vcs.next_due_miles,
    vcs.next_due_miles_max,
    vcs.next_due_date,
    cur.reading AS current_odometer,
    ak.avg_km_per_day,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_miles IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN 'no_record'
      WHEN cur.reading IS NULL AND vcs.next_due_miles IS NOT NULL THEN 'odometer_needed'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        AND cur.reading >= vcs.next_due_miles THEN 'overdue'
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date THEN 'overdue'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        AND cur.reading >= vcs.next_due_miles - coalesce(s.due_soon_km, 1000)
        AND cur.reading < vcs.next_due_miles THEN 'due_soon'
      WHEN vcs.next_due_date IS NOT NULL
        AND vcs.next_due_date <= current_date + coalesce(s.due_soon_days, 14) THEN 'due_soon'
      ELSE 'ok'
    END AS due_status,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_miles IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN NULL
      WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
        THEN greatest(0, cur.reading - vcs.next_due_miles)
      ELSE NULL
    END AS km_overdue,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_miles IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN NULL
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date
        THEN current_date - vcs.next_due_date
      ELSE NULL
    END AS days_overdue
  FROM public.vehicle_component_schedule vcs
  JOIN public.maintenance_service_categories c ON c.id = vcs.category_id
  LEFT JOIN cur ON cur.vehicle_id = vcs.vehicle_id
  LEFT JOIN settings s ON s.organization_id = vcs.organization_id
  LEFT JOIN avg_km ak ON ak.vehicle_id = vcs.vehicle_id
)
SELECT
  scored.*,
  CASE
    WHEN scored.due_status = 'overdue' THEN NULL
    WHEN scored.due_status = 'no_record' THEN NULL
    WHEN scored.current_odometer IS NOT NULL
      AND scored.next_due_miles IS NOT NULL
      AND scored.avg_km_per_day IS NOT NULL
      AND scored.avg_km_per_day > 0
      AND scored.current_odometer < scored.next_due_miles
    THEN least(
      coalesce(scored.next_due_date, current_date + 3650),
      current_date + ceil((scored.next_due_miles - scored.current_odometer) / scored.avg_km_per_day)::int
    )
    ELSE scored.next_due_date
  END AS projected_due_date
FROM scored;

CREATE OR REPLACE VIEW public.fleet_maintenance_due_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_due_v;

GRANT SELECT ON public.fleet_maintenance_due_v TO service_role;
