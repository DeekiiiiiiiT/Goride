-- Fleet Maintenance Enterprise Release 1: R-02, R-03, R-04 (+ recompute dateUnknown)

-- ---------------------------------------------------------------------------
-- B-01: Allow legacy R-02 remediation to touch completed import WOs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('fleet.legacy_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'completed work orders cannot be edited';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed work orders cannot be deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_voided timestamptz;
BEGIN
  IF current_setting('fleet.legacy_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status, voided_at INTO v_status, v_voided
  FROM public.maintenance_work_orders
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  IF v_status = 'completed' AND v_voided IS NULL THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be edited';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be deleted';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- R-02: Legacy R8 import remediation (idempotent)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_wo record;
  v_line record;
  v_corner text;
  v_comp uuid;
  v_pos text[];
  v_odo numeric;
  v_odo_estimated boolean := false;
BEGIN
  PERFORM set_config('fleet.legacy_repair', 'on', true);

  FOR v_wo IN
    SELECT wo.*
    FROM public.maintenance_work_orders wo
    WHERE coalesce(wo.payload_json->>'source', '') = 'inventory_r8_04'
      AND wo.voided_at IS NULL
  LOOP
    v_odo_estimated := false;
    SELECT r.reading INTO v_odo
    FROM fleet.odometer_readings r
    WHERE r.vehicle_id = v_wo.vehicle_id
      AND r.organization_id = v_wo.organization_id
      AND r.is_voided IS NOT TRUE
      AND r.recorded_at::date <= v_wo.performed_at_date
    ORDER BY r.recorded_at DESC
    LIMIT 1;

    IF v_odo IS NULL THEN
      SELECT r.reading INTO v_odo
      FROM fleet.odometer_readings r
      WHERE r.vehicle_id = v_wo.vehicle_id
        AND r.organization_id = v_wo.organization_id
        AND r.is_voided IS NOT TRUE
        AND r.recorded_at::date > v_wo.performed_at_date
      ORDER BY r.recorded_at ASC
      LIMIT 1;
      IF v_odo IS NOT NULL THEN
        v_odo_estimated := true;
      END IF;
    END IF;

    IF v_odo IS NOT NULL AND v_wo.odometer IS NULL THEN
      UPDATE public.maintenance_work_orders
      SET
        odometer = v_odo,
        payload_json = coalesce(payload_json, '{}'::jsonb)
          || CASE WHEN v_odo_estimated THEN jsonb_build_object('odometerEstimated', true) ELSE '{}'::jsonb END,
        updated_at = now()
      WHERE id = v_wo.id;
    END IF;

    IF v_wo.performed_at_date = DATE '2026-11-01'
       AND coalesce(v_wo.total_cost, 0) = 0 THEN
      UPDATE public.maintenance_work_orders
      SET payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('dateUnknown', true),
          updated_at = now()
      WHERE id = v_wo.id;
    END IF;

    FOR v_line IN
      SELECT * FROM public.maintenance_work_order_lines l WHERE l.work_order_id = v_wo.id
    LOOP
      v_corner := upper(trim(coalesce(v_wo.payload_json->>'corner', '')));
      IF v_corner = '' AND v_line.component_name ~* '(LF|RF|LR|RR)' THEN
        v_corner := upper(substring(v_line.component_name from '(LF|RF|LR|RR)'));
      END IF;
      IF v_corner = '' AND v_line.component_name ~* 'front\s+left' THEN
        v_corner := 'LF';
      ELSIF v_corner = '' AND v_line.component_name ~* 'front\s+right' THEN
        v_corner := 'RF';
      ELSIF v_corner = '' AND v_line.component_name ~* 'rear\s+left' THEN
        v_corner := 'LR';
      ELSIF v_corner = '' AND v_line.component_name ~* 'rear\s+right' THEN
        v_corner := 'RR';
      END IF;

      v_comp := NULL;
      v_pos := v_line.positions;

      IF v_line.component_name ILIKE '%spare%' THEN
        SELECT c.id INTO v_comp FROM public.maintenance_service_categories c
        WHERE c.kind = 'component'
          AND (c.name ILIKE '%spare%' OR c.code ILIKE '%spare%')
        ORDER BY c.sort_order NULLS LAST LIMIT 1;
      ELSIF v_line.component_name ILIKE '%wheel%' THEN
        SELECT c.id INTO v_comp FROM public.maintenance_service_categories c
        WHERE c.kind = 'component'
          AND (c.name ILIKE '%wheel%' OR c.code ILIKE '%wheel%')
        ORDER BY c.sort_order NULLS LAST LIMIT 1;
      ELSIF v_corner IN ('LF','RF','LR','RR') THEN
        SELECT c.id INTO v_comp FROM public.maintenance_service_categories c
        WHERE c.kind = 'component'
          AND c.position_aware IS TRUE
          AND (c.name ILIKE '%tire%' OR c.name ILIKE '%tyre%' OR c.code ILIKE '%tire%')
        ORDER BY c.sort_order NULLS LAST LIMIT 1;
        v_pos := ARRAY[v_corner];
      END IF;

      IF v_comp IS NOT NULL OR (v_pos IS DISTINCT FROM v_line.positions AND v_pos IS NOT NULL) THEN
        UPDATE public.maintenance_work_order_lines
        SET
          component_id = CASE WHEN v_comp IS NOT NULL THEN v_comp ELSE component_id END,
          positions = CASE WHEN v_pos IS NOT NULL THEN v_pos ELSE positions END,
          action = coalesce(nullif(action, ''), 'replace')
        WHERE id = v_line.id;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.maintenance_work_orders wo
  SET
    voided_at = coalesce(voided_at, now()),
    void_reason = coalesce(void_reason, 'same purchase as 9a0e45b7'),
    status = 'cancelled',
    notes = coalesce(notes, '') || E'\n[void: duplicate of finance WO 9a0e45b7]',
    updated_at = now()
  WHERE wo.id::text LIKE 'f3763a08%'
     OR wo.id::text LIKE 'fc02dfb7%';
END $$;

DO $$
DECLARE
  v_vehicle text;
BEGIN
  SELECT v.id INTO v_vehicle
  FROM fleet.vehicles v
  WHERE v.license_plate ILIKE '%5179%'
  LIMIT 1;
  IF v_vehicle IS NOT NULL THEN
    PERFORM fleet.recompute_maintenance_schedule(v_vehicle);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Recompute: skip dateUnknown legacy lines (R-02)
-- ---------------------------------------------------------------------------
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
      AND coalesce((wo.payload_json->>'dateUnknown')::boolean, false) IS NOT TRUE
      AND (
        v_row.position IS NULL
        OR l.positions @> ARRAY[v_row.position]::text[]
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
      AND coalesce((wo.payload_json->>'dateUnknown')::boolean, false) IS NOT TRUE
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
$$;

-- ---------------------------------------------------------------------------
-- R-03: Nightly check — snapshot, recompute, drift, then alerts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.run_maintenance_nightly_check(p_organization_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_org text;
  v_today date := current_date;
  v_alerts integer := 0;
  v_vehicles integer := 0;
  v_drift integer := 0;
  r record;
  v_key text;
BEGIN
  INSERT INTO fleet.maintenance_job_runs (id, organization_id, job_name, started_at, success)
  VALUES (v_run_id, p_organization_id, 'nightly_check', now(), false);

  DROP TABLE IF EXISTS pg_temp.maint_schedule_snapshot;
  CREATE TEMP TABLE maint_schedule_snapshot ON COMMIT DROP AS
  SELECT
    vcs.organization_id,
    vcs.vehicle_id,
    vcs.category_id,
    vcs.position,
    vcs.next_due_miles,
    vcs.next_due_date
  FROM public.vehicle_component_schedule vcs
  WHERE p_organization_id IS NULL OR vcs.organization_id = p_organization_id;

  FOR v_org IN
    SELECT DISTINCT organization_id FROM public.vehicle_component_schedule
    WHERE p_organization_id IS NULL OR organization_id = p_organization_id
  LOOP
    FOR r IN
      SELECT DISTINCT vehicle_id AS vehicle_id
      FROM public.vehicle_component_schedule
      WHERE organization_id = v_org
    LOOP
      PERFORM fleet.recompute_maintenance_schedule(r.vehicle_id);
    END LOOP;
  END LOOP;

  SELECT count(*) INTO v_drift
  FROM public.vehicle_component_schedule vcs
  JOIN maint_schedule_snapshot s
    ON s.organization_id = vcs.organization_id
   AND s.vehicle_id = vcs.vehicle_id
   AND s.category_id = vcs.category_id
   AND (s.position IS NOT DISTINCT FROM vcs.position)
  WHERE (s.next_due_miles IS DISTINCT FROM vcs.next_due_miles
      OR s.next_due_date IS DISTINCT FROM vcs.next_due_date);

  FOR v_org IN
    SELECT DISTINCT organization_id FROM public.vehicle_component_schedule
    WHERE p_organization_id IS NULL OR organization_id = p_organization_id
  LOOP
    FOR r IN
      SELECT * FROM fleet.maintenance_due_v
      WHERE organization_id = v_org
        AND due_status IN ('overdue', 'due_soon')
    LOOP
      v_key := format(
        'maint:%s:%s:%s:%s:%s',
        v_org,
        r.vehicle_id,
        r.category_id,
        coalesce(r.position, '-'),
        to_char(v_today, 'YYYY-MM-DD')
      );
      INSERT INTO fleet.maintenance_alerts (organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity, payload)
      VALUES (
        v_org,
        v_key,
        r.vehicle_id,
        r.category_id,
        r.position,
        v_today,
        r.due_status,
        jsonb_build_object('categoryName', r.category_name, 'kmOverdue', r.km_overdue)
      )
      ON CONFLICT (alert_key) DO NOTHING;
      IF FOUND THEN
        v_alerts := v_alerts + 1;
      END IF;
      INSERT INTO fleet.maintenance_events (organization_id, vehicle_id, type, payload)
      VALUES (
        v_org,
        r.vehicle_id,
        CASE WHEN r.due_status = 'overdue' THEN 'schedule.overdue' ELSE 'schedule.due_soon' END,
        jsonb_build_object('categoryId', r.category_id, 'position', r.position)
      );
    END LOOP;

    SELECT count(DISTINCT vehicle_id) INTO v_vehicles
    FROM fleet.maintenance_due_v
    WHERE organization_id = v_org;
  END LOOP;

  UPDATE fleet.maintenance_job_runs
  SET finished_at = now(),
      success = true,
      vehicles_checked = v_vehicles,
      alerts_written = v_alerts,
      drift_rows = v_drift
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- R-04: Event consumer + 5-minute cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.process_maintenance_events(p_batch_size integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH picked AS (
    SELECT id
    FROM fleet.maintenance_events
    WHERE processed_at IS NULL
    ORDER BY occurred_at ASC
    LIMIT greatest(1, least(p_batch_size, 1000))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE fleet.maintenance_events e
  SET processed_at = now()
  FROM picked p
  WHERE e.id = p.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'fleet-maintenance-events';
    PERFORM cron.schedule(
      'fleet-maintenance-events',
      '*/5 * * * *',
      $cron$SELECT fleet.process_maintenance_events(200)$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped fleet-maintenance-events';
  END IF;
END $$;

REVOKE ALL ON FUNCTION fleet.process_maintenance_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.process_maintenance_events(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.process_maintenance_events(p_batch_size integer DEFAULT 200)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.process_maintenance_events(p_batch_size); $$;

GRANT EXECUTE ON FUNCTION public.process_maintenance_events(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Integrity report extensions (R-03 schedule_drift, R-04 event_unprocessed_1h)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.maintenance_integrity_report(p_organization_id text DEFAULT NULL)
RETURNS TABLE (check_name text, detail jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT 'orphan_in_progress_log_path'::text,
    jsonb_build_object('work_order_id', wo.id, 'vehicle_id', wo.vehicle_id, 'opened_at', wo.opened_at)
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'in_progress'
    AND wo.opened_at < now() - interval '1 day'
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'missing_nightly_run_today',
    jsonb_build_object('today', current_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_job_runs r
    WHERE r.success = true
      AND r.started_at::date = current_date
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  )
  UNION ALL
  SELECT 'schedule_drift',
    jsonb_build_object(
      'run_id', r.id,
      'drift_rows', r.drift_rows,
      'started_at', r.started_at
    )
  FROM fleet.maintenance_job_runs r
  WHERE r.job_name = 'nightly_check'
    AND r.success = true
    AND r.drift_rows > 0
    AND r.started_at > now() - interval '2 days'
    AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  UNION ALL
  SELECT 'event_unprocessed_1h',
    jsonb_build_object(
      'event_id', e.id,
      'type', e.type,
      'occurred_at', e.occurred_at,
      'vehicle_id', e.vehicle_id
    )
  FROM fleet.maintenance_events e
  WHERE e.processed_at IS NULL
    AND e.occurred_at < now() - interval '1 hour'
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id);
$$;
