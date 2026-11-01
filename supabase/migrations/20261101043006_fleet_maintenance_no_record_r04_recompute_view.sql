CREATE OR REPLACE FUNCTION fleet.recompute_maintenance_schedule(p_vehicle_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_last record;
  v_line record;
  v_updated integer := 0;
  v_interval_miles numeric;
  v_interval_months integer;
  v_base_miles numeric;
  v_base_date date;
  v_in_package boolean;
  v_org text;
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

    SELECT EXISTS (
      SELECT 1
      FROM public.maintenance_package_categories mpc
      WHERE mpc.template_id = v_row.source_template_id
        AND mpc.category_id = v_row.category_id
    ) INTO v_in_package;

    IF v_in_package AND v_row.source_template_id IS NOT NULL THEN
      SELECT t.interval_miles, t.interval_months
      INTO v_interval_miles, v_interval_months
      FROM public.maintenance_task_templates t
      WHERE t.id = v_row.source_template_id;
    ELSE
      SELECT c.default_interval_miles, c.default_interval_months
      INTO v_interval_miles, v_interval_months
      FROM public.maintenance_service_categories c
      WHERE c.id = v_row.category_id;
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
    ELSIF v_row.baseline_odometer IS NOT NULL OR v_row.baseline_date IS NOT NULL THEN
      v_base_miles := coalesce(v_row.baseline_odometer, 0);
      v_base_date := v_row.baseline_date;
      UPDATE public.vehicle_component_schedule vcs
      SET
        last_performed_miles = NULL,
        last_performed_date = NULL,
        next_due_miles = CASE
          WHEN v_interval_miles IS NOT NULL THEN v_base_miles + v_interval_miles
          ELSE vcs.next_due_miles
        END,
        next_due_date = CASE
          WHEN v_interval_months IS NOT NULL AND v_base_date IS NOT NULL
            THEN (v_base_date + (v_interval_months || ' months')::interval)::date
          ELSE vcs.next_due_date
        END,
        schedule_status = 'active',
        updated_at = now()
      WHERE vcs.id = v_row.id;
      v_updated := v_updated + 1;
    ELSIF v_row.last_performed_date IS NULL
      AND v_row.last_performed_miles IS NULL
      AND v_row.baseline_odometer IS NULL
      AND v_row.baseline_date IS NULL
    THEN
      UPDATE public.vehicle_component_schedule vcs
      SET
        next_due_miles = NULL,
        next_due_date = NULL,
        next_due_miles_max = NULL,
        schedule_status = 'active',
        updated_at = now()
      WHERE vcs.id = v_row.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT DISTINCT
      wo.organization_id,
      l.component_id,
      CASE
        WHEN coalesce(array_length(l.positions, 1), 0) > 0 THEN l.positions[1]
        ELSE NULL
      END AS position,
      wo.performed_at_date,
      wo.odometer
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE wo.vehicle_id = p_vehicle_id
      AND wo.status = 'completed'
      AND wo.voided_at IS NULL
      AND l.component_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.vehicle_component_schedule x
      WHERE x.vehicle_id = p_vehicle_id
        AND x.category_id = v_line.component_id
        AND (
          (x.position IS NULL AND v_line.position IS NULL)
          OR x.position = v_line.position
        )
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.default_interval_miles, c.default_interval_months
    INTO v_interval_miles, v_interval_months
    FROM public.maintenance_service_categories c
    WHERE c.id = v_line.component_id;

    v_org := v_line.organization_id;

    INSERT INTO public.vehicle_component_schedule (
      organization_id,
      vehicle_id,
      category_id,
      position,
      last_performed_miles,
      last_performed_date,
      next_due_miles,
      next_due_date,
      schedule_status,
      updated_at
    ) VALUES (
      v_org,
      p_vehicle_id,
      v_line.component_id,
      v_line.position,
      v_line.odometer,
      v_line.performed_at_date,
      CASE
        WHEN v_interval_miles IS NOT NULL AND v_line.odometer IS NOT NULL
          THEN v_line.odometer + v_interval_miles
        ELSE NULL
      END,
      CASE
        WHEN v_interval_months IS NOT NULL AND v_line.performed_at_date IS NOT NULL
          THEN (v_line.performed_at_date + (v_interval_months || ' months')::interval)::date
        ELSE NULL
      END,
      'active',
      now()
    );
    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;;
