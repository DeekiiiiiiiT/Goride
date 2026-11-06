-- S-02 / S-03: km column readers + M-13 open alert lifecycle

-- Delegate to M-09 component recompute (no category.default_interval_* columns in schema).
CREATE OR REPLACE FUNCTION fleet.recompute_maintenance_schedule(p_vehicle_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_org text;
  v_result jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.vehicle_component_schedule
  WHERE vehicle_id = p_vehicle_id
  LIMIT 1;

  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org
    FROM fleet.vehicles
    WHERE id = p_vehicle_id
    LIMIT 1;
  END IF;

  IF v_org IS NULL THEN
    RETURN 0;
  END IF;

  v_result := public.recompute_component_schedules_for_car(v_org, p_vehicle_id);
  RETURN coalesce((v_result->>'created')::int, 0)
       + coalesce((v_result->>'updated')::int, 0)
       + coalesce((v_result->>'no_rule')::int, 0);
END;
$$;

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
    vcs.last_performed_km,
    vcs.last_performed_date,
    vcs.baseline_odometer,
    vcs.baseline_date,
    vcs.baseline_source,
    vcs.next_due_km,
    vcs.next_due_km_max,
    vcs.next_due_date,
    cur.reading AS current_odometer,
    ak.avg_km_per_day,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN 'no_record'
      WHEN cur.reading IS NULL AND vcs.next_due_km IS NOT NULL THEN 'odometer_needed'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        AND cur.reading >= vcs.next_due_km THEN 'overdue'
      WHEN vcs.next_due_date IS NOT NULL AND vcs.next_due_date < current_date THEN 'overdue'
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        AND cur.reading >= vcs.next_due_km - coalesce(s.due_soon_km, 1000)
        AND cur.reading < vcs.next_due_km THEN 'due_soon'
      WHEN vcs.next_due_date IS NOT NULL
        AND vcs.next_due_date <= current_date + coalesce(s.due_soon_days, 14) THEN 'due_soon'
      ELSE 'ok'
    END AS due_status,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
        AND vcs.baseline_odometer IS NULL
        AND vcs.baseline_date IS NULL
        THEN NULL
      WHEN cur.reading IS NOT NULL AND vcs.next_due_km IS NOT NULL
        THEN greatest(0, cur.reading - vcs.next_due_km)
      ELSE NULL
    END AS km_overdue,
    CASE
      WHEN vcs.last_performed_date IS NULL
        AND vcs.last_performed_km IS NULL
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
      AND scored.next_due_km IS NOT NULL
      AND scored.avg_km_per_day IS NOT NULL
      AND scored.avg_km_per_day > 0
      AND scored.current_odometer < scored.next_due_km
    THEN least(
      coalesce(scored.next_due_date, current_date + 3650),
      current_date + ceil((scored.next_due_km - scored.current_odometer) / scored.avg_km_per_day)::int
    )
    ELSE scored.next_due_date
  END AS projected_due_date
FROM scored;

CREATE OR REPLACE VIEW public.fleet_maintenance_due_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_due_v;

GRANT SELECT ON public.fleet_maintenance_due_v TO service_role;;


-- M-13: one open alert per car + part + position
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
  v_sched_id uuid;
  v_open_id uuid;
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
    vcs.next_due_km,
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
  WHERE (s.next_due_km IS DISTINCT FROM vcs.next_due_km
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
      SELECT vcs.id INTO v_sched_id
      FROM public.vehicle_component_schedule vcs
      WHERE vcs.organization_id = v_org
        AND vcs.vehicle_id = r.vehicle_id
        AND vcs.category_id = r.category_id
        AND vcs.position IS NOT DISTINCT FROM r.position
      LIMIT 1;

      SELECT a.id INTO v_open_id
      FROM fleet.maintenance_alerts a
      WHERE a.organization_id = v_org
        AND a.vehicle_id = r.vehicle_id
        AND a.category_id = r.category_id
        AND a.position IS NOT DISTINCT FROM r.position
        AND a.status = 'open'
      LIMIT 1;

      IF v_open_id IS NOT NULL THEN
        UPDATE fleet.maintenance_alerts a
        SET
          alert_date = v_today,
          severity = r.due_status,
          due_km = r.next_due_km,
          due_date = r.next_due_date,
          component_schedule_id = v_sched_id,
          payload = jsonb_build_object('categoryName', r.category_name, 'kmOverdue', r.km_overdue)
        WHERE a.id = v_open_id;
      ELSE
        v_key := format(
          'maint:%s:%s:%s:%s:open',
          v_org,
          r.vehicle_id,
          r.category_id,
          coalesce(r.position, '-')
        );
        INSERT INTO fleet.maintenance_alerts (
          organization_id,
          alert_key,
          vehicle_id,
          category_id,
          position,
          alert_date,
          severity,
          status,
          component_schedule_id,
          due_km,
          due_date,
          payload
        )
        VALUES (
          v_org,
          v_key,
          r.vehicle_id,
          r.category_id,
          r.position,
          v_today,
          r.due_status,
          'open',
          v_sched_id,
          r.next_due_km,
          r.next_due_date,
          jsonb_build_object('categoryName', r.category_name, 'kmOverdue', r.km_overdue)
        );
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

