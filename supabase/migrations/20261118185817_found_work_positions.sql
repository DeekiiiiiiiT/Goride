CREATE OR REPLACE FUNCTION public.fleet_open_found_work(
  p_organization_id text,
  p_vehicle_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."foundDate", x."lineId"), '[]'::jsonb)
  FROM (
    SELECT
      l.id AS "lineId",
      wo.id AS "workOrderId",
      wo.vehicle_id AS "vehicleId",
      l.component_id AS "jobId",
      l.component_name AS "jobName",
      l.system_name AS "systemName",
      l.notes AS "note",
      coalesce(
        wo.performed_at_date,
        (wo.opened_at AT TIME ZONE 'UTC')::date
      ) AS "foundDate",
      greatest(
        0,
        (current_date - coalesce(
          wo.performed_at_date,
          (wo.opened_at AT TIME ZONE 'UTC')::date
        ))
      )::integer AS "daysWaiting",
      wo.provider AS "garage",
      (
        SELECT il.component_name
        FROM public.maintenance_work_order_lines il
        JOIN public.maintenance_service_categories c ON c.id = il.component_id
        WHERE il.work_order_id = wo.id
          AND il.voided_at IS NULL
          AND c.records_findings = true
        ORDER BY il.sort_order, il.created_at, il.id
        LIMIT 1
      ) AS "inspectionJobName",
      coalesce(l.positions, ARRAY[]::text[]) AS "positions",
      c.position_scheme AS "positionScheme",
      c.position_aware AS "positionAware"
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    LEFT JOIN public.maintenance_service_categories c ON c.id = l.component_id
    WHERE wo.organization_id = p_organization_id
      AND (p_vehicle_id IS NULL OR wo.vehicle_id = p_vehicle_id)
      AND l.recommended = true
      AND l.voided_at IS NULL
      AND public.maintenance_found_line_is_open(l.id)
  ) x;
$$;

REVOKE ALL ON FUNCTION public.fleet_open_found_work(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_open_found_work(text, text) TO service_role;