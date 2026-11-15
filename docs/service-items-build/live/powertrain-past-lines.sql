-- Read-only: lines logged as not usual (PT-8). Run by hand against live or local.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_n bigint;
  v_m bigint;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.maintenance_work_order_lines l
  WHERE l.fit_at_log = 'no'
    AND l.voided_at IS NULL;

  SELECT count(*) INTO v_m
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  JOIN fleet.vehicles v
    ON v.id = wo.vehicle_id
   AND v.organization_id::text = wo.organization_id
  WHERE l.fit_at_log = 'no'
    AND l.voided_at IS NULL
    AND l.component_id IS NOT NULL
    AND (
      SELECT f.fits
      FROM public.job_fits_car(nullif(v.vehicle_catalog_id, '')::uuid, ARRAY[l.component_id]) f
      LIMIT 1
    ) = 'no';

  RAISE NOTICE '% lines were logged as not usual; % of them still don''t fit today', v_n, v_m;
END $$;

SELECT
  v.id AS vehicle_id,
  v.license_plate,
  wo.performed_at_date,
  c.name AS job_name,
  l.id AS line_id
FROM public.maintenance_work_order_lines l
JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
JOIN fleet.vehicles v
  ON v.id = wo.vehicle_id
 AND v.organization_id::text = wo.organization_id
JOIN public.maintenance_service_categories c ON c.id = l.component_id
WHERE l.fit_at_log = 'no'
  AND l.voided_at IS NULL
  AND l.component_id IS NOT NULL
  AND (
    SELECT f.fits
    FROM public.job_fits_car(nullif(v.vehicle_catalog_id, '')::uuid, ARRAY[l.component_id]) f
    LIMIT 1
  ) = 'no'
ORDER BY wo.performed_at_date DESC NULLS LAST, l.created_at DESC;
