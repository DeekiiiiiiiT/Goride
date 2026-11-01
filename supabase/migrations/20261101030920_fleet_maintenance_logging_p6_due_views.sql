CREATE OR REPLACE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT organization_id, due_soon_km, due_soon_days
  FROM fleet.organization_settings
),
cur AS (
  SELECT * FROM fleet.vehicle_current_odometer_v
)
SELECT
  vcs.organization_id,
  vcs.vehicle_id,
  vcs.category_id,
  vcs.position,
  c.name AS category_name,
  c.code AS category_code,
  vcs.last_performed_miles,
  vcs.last_performed_date,
  vcs.next_due_miles,
  vcs.next_due_miles_max,
  vcs.next_due_date,
  cur.reading AS current_odometer,
  CASE
    WHEN cur.reading IS NULL AND vcs.next_due_miles IS NOT NULL THEN 'odometer_needed'
    WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
      AND cur.reading >= coalesce(vcs.next_due_miles_max, vcs.next_due_miles) THEN 'overdue'
    WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date THEN 'overdue'
    WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
      AND cur.reading >= vcs.next_due_miles - coalesce(s.due_soon_km, 1000)
      AND cur.reading < coalesce(vcs.next_due_miles_max, vcs.next_due_miles) THEN 'due_soon'
    WHEN vcs.next_due_date IS NOT NULL
      AND vcs.next_due_date <= current_date + coalesce(s.due_soon_days, 14) THEN 'due_soon'
    ELSE 'ok'
  END AS due_status,
  CASE
    WHEN cur.reading IS NOT NULL AND vcs.next_due_miles IS NOT NULL
      THEN greatest(0, cur.reading - coalesce(vcs.next_due_miles_max, vcs.next_due_miles))
    ELSE NULL
  END AS km_overdue,
  CASE
    WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date
      THEN current_date - vcs.next_due_date
    ELSE NULL
  END AS days_overdue
FROM public.vehicle_component_schedule vcs
JOIN public.maintenance_service_categories c ON c.id = vcs.category_id
LEFT JOIN cur ON cur.vehicle_id = vcs.vehicle_id
LEFT JOIN settings s ON s.organization_id = vcs.organization_id;

CREATE OR REPLACE VIEW fleet.maintenance_vehicle_status_v AS
SELECT organization_id, vehicle_id,
  CASE
    WHEN bool_or(due_status = 'overdue') THEN 'overdue'
    WHEN bool_or(due_status = 'odometer_needed') THEN 'odometer_needed'
    WHEN bool_or(due_status = 'due_soon') THEN 'due_soon'
    ELSE 'ok'
  END AS fleet_status
FROM fleet.maintenance_due_v
GROUP BY organization_id, vehicle_id;

CREATE OR REPLACE VIEW fleet.maintenance_service_history_v AS
SELECT l.id AS line_id, wo.organization_id, wo.vehicle_id, wo.id AS work_order_id, wo.log_number,
  wo.performed_at_date, wo.odometer AS performed_at_miles, wo.provider, wo.currency, wo.invoice_url, wo.voided_at,
  l.component_id AS category_id, l.component_code AS category_code, l.component_name AS category_name,
  l.action, l.positions, l.part_number, l.brand, l.material, l.line_total, l.values_json, wo.closed_at AS completed_at
FROM public.maintenance_work_order_lines l
JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
WHERE wo.status = 'completed' AND wo.voided_at IS NULL;
