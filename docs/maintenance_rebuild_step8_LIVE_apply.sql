-- Maintenance rebuild step 8: Odometer needed alert. Paste into the Supabase SQL editor (project csfllzzastacofsvcdsc). One run.

-- Maintenance rebuild step 8 (MER-13): one "Odometer needed" alert per car with no reading.
--
-- 1505LM and 5404LK have no odometer reading at all, so 50 schedule rows can never date anything, and nothing
-- asked for a reading unless someone opened that car. Now:
--   * fleet.mm_sync_odometer_needed_alerts(org) keeps exactly one open alert (severity 'odometer_needed', no
--     part) per car with no valid reading, and resolves it when the car has one.
--   * the nightly check runs it.
--   * a trigger on fleet.odometer_readings resolves the car's alert the moment a valid reading arrives.
-- The Fleet bell shows these alerts (screens: "Odometer needed").

-- ---------------------------------------------------------------------------------------------------------
-- 1. Open / resolve the alerts
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.mm_sync_odometer_needed_alerts(p_organization_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opened integer := 0;
  r record;
BEGIN
  -- A reading arrived: the car's open alert is done.
  UPDATE fleet.maintenance_alerts a
  SET status = 'resolved',
      resolved_at = now(),
      resolution_reason = 'performed'
  WHERE a.status = 'open'
    AND a.severity = 'odometer_needed'
    AND (p_organization_id IS NULL OR a.organization_id = p_organization_id)
    AND public.mm_fleet_has_valid_odometer(a.vehicle_id);

  -- A car with no reading and no open alert gets one.
  FOR r IN
    SELECT v.organization_id, v.id AS vehicle_id, v.license_plate
    FROM fleet.vehicles v
    WHERE (p_organization_id IS NULL OR v.organization_id = p_organization_id)
      AND v.organization_id IS NOT NULL
      AND NOT public.mm_fleet_has_valid_odometer(v.id)
      AND NOT EXISTS (
        SELECT 1 FROM fleet.maintenance_alerts a
        WHERE a.organization_id = v.organization_id
          AND a.vehicle_id = v.id
          AND a.severity = 'odometer_needed'
          AND a.status = 'open'
      )
  LOOP
    INSERT INTO fleet.maintenance_alerts (
      organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity, status, payload
    ) VALUES (
      r.organization_id,
      format('odo_needed:%s:%s:%s', r.organization_id, r.vehicle_id, to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')),
      r.vehicle_id,
      NULL,
      NULL,
      current_date,
      'odometer_needed',
      'open',
      jsonb_build_object('categoryName', 'Odometer reading needed', 'plate', r.license_plate)
    );
    v_opened := v_opened + 1;
  END LOOP;

  RETURN v_opened;
END;
$$;

COMMENT ON FUNCTION fleet.mm_sync_odometer_needed_alerts(text) IS
  'Maintenance step 8 (MER-13): exactly one open "Odometer needed" alert per car with no valid reading; resolved once the car has one.';

REVOKE ALL ON FUNCTION fleet.mm_sync_odometer_needed_alerts(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.mm_sync_odometer_needed_alerts(text) TO service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 2. A reading closes the alert at once
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.mm_odometer_reading_closes_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.is_voided, false) = false AND COALESCE(NEW.reading, 0) > 0 THEN
    UPDATE fleet.maintenance_alerts a
    SET status = 'resolved',
        resolved_at = now(),
        resolution_reason = 'performed'
    WHERE a.vehicle_id = NEW.vehicle_id
      AND a.severity = 'odometer_needed'
      AND a.status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_odometer_reading_closes_alert ON fleet.odometer_readings;
CREATE TRIGGER mm_odometer_reading_closes_alert
AFTER INSERT OR UPDATE OF reading, is_voided ON fleet.odometer_readings
FOR EACH ROW EXECUTE FUNCTION fleet.mm_odometer_reading_closes_alert();

-- ---------------------------------------------------------------------------------------------------------
-- 3. The nightly check runs it (same function as before, plus the sync before the run is closed)
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.run_maintenance_nightly_check(p_organization_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'fleet', 'public'
AS $function$
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

  -- Step 8: one "Odometer needed" alert per car with no reading.
  v_alerts := v_alerts + fleet.mm_sync_odometer_needed_alerts(p_organization_id);

  UPDATE fleet.maintenance_job_runs
  SET finished_at = now(),
      success = true,
      vehicles_checked = v_vehicles,
      alerts_written = v_alerts,
      drift_rows = v_drift
  WHERE id = v_run_id;

  RETURN v_run_id;
END;
$function$;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Today: the two cars with no reading get their alert now, not tonight
-- ---------------------------------------------------------------------------------------------------------
SELECT fleet.mm_sync_odometer_needed_alerts(NULL);

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261127213249', 'mm_odometer_needed_alert') ON CONFLICT (version) DO NOTHING;
