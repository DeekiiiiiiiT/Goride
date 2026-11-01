CREATE OR REPLACE FUNCTION fleet.recompute_maintenance_schedule(p_vehicle_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_last record;
  v_tpl record;
  v_updated integer := 0;
  v_interval_miles numeric;
  v_interval_months integer;
BEGIN
  FOR v_row IN
    SELECT vcs.*
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.vehicle_id = p_vehicle_id
  LOOP
    SELECT wo.performed_at_date, wo.odometer
    INTO v_last
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.vehicle_id = p_vehicle_id
      AND wo.status = 'completed'
      AND wo.voided_at IS NULL
      AND l.component_id = v_row.category_id
      AND (
        v_row.position IS NULL
        OR l.positions @> ARRAY[v_row.position]::text[]
        OR (v_row.position IS NOT NULL AND coalesce(array_length(l.positions, 1), 0) = 0)
      )
    ORDER BY wo.performed_at_date DESC NULLS LAST, wo.closed_at DESC NULLS LAST
    LIMIT 1;

    SELECT t.interval_miles, t.interval_months, t.interval_miles_max
    INTO v_tpl
    FROM public.maintenance_task_templates t
    WHERE t.id = v_row.source_template_id
    LIMIT 1;

    IF v_tpl.interval_miles IS NULL THEN
      SELECT c.default_interval_miles, c.default_interval_months
      INTO v_interval_miles, v_interval_months
      FROM public.maintenance_service_categories c
      WHERE c.id = v_row.category_id;
    ELSE
      v_interval_miles := v_tpl.interval_miles;
      v_interval_months := v_tpl.interval_months;
    END IF;

    IF v_last.performed_at_date IS NOT NULL THEN
      UPDATE public.vehicle_component_schedule vcs
      SET
        last_performed_date = v_last.performed_at_date,
        last_performed_miles = v_last.odometer,
        next_due_miles = CASE
          WHEN v_interval_miles IS NOT NULL AND v_last.odometer IS NOT NULL
            THEN v_last.odometer + v_interval_miles
          ELSE vcs.next_due_miles
        END,
        next_due_date = CASE
          WHEN v_interval_months IS NOT NULL AND v_last.performed_at_date IS NOT NULL
            THEN (v_last.performed_at_date + (v_interval_months || ' months')::interval)::date
          ELSE vcs.next_due_date
        END,
        schedule_status = 'active',
        updated_at = now()
      WHERE vcs.id = v_row.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  RETURN v_updated;
END;
$$;
