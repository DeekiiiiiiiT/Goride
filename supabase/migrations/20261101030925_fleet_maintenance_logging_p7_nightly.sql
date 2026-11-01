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

  FOR v_org IN
    SELECT DISTINCT organization_id FROM public.vehicle_component_schedule
    WHERE p_organization_id IS NULL OR organization_id = p_organization_id
  LOOP
    FOR r IN
      SELECT * FROM fleet.maintenance_due_v
      WHERE organization_id = v_org AND due_status IN ('overdue', 'due_soon')
    LOOP
      v_key := format('maint:%s:%s:%s:%s:%s', v_org, r.vehicle_id, r.category_id, coalesce(r.position, '-'), to_char(v_today, 'YYYY-MM-DD'));
      INSERT INTO fleet.maintenance_alerts (organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity, payload)
      VALUES (v_org, v_key, r.vehicle_id, r.category_id, r.position, v_today, r.due_status,
        jsonb_build_object('categoryName', r.category_name, 'kmOverdue', r.km_overdue))
      ON CONFLICT (alert_key) DO NOTHING;
      IF FOUND THEN v_alerts := v_alerts + 1; END IF;
      INSERT INTO fleet.maintenance_events (organization_id, vehicle_id, type, payload)
      VALUES (v_org, r.vehicle_id,
        CASE WHEN r.due_status = 'overdue' THEN 'schedule.overdue' ELSE 'schedule.due_soon' END,
        jsonb_build_object('categoryId', r.category_id, 'position', r.position));
    END LOOP;
    SELECT count(DISTINCT vehicle_id) INTO v_vehicles FROM fleet.maintenance_due_v WHERE organization_id = v_org;
    FOR r IN SELECT DISTINCT vehicle_id FROM public.vehicle_component_schedule WHERE organization_id = v_org
    LOOP
      PERFORM fleet.recompute_maintenance_schedule(r.vehicle_id);
    END LOOP;
  END LOOP;
  UPDATE fleet.maintenance_job_runs SET finished_at = now(), success = true,
    vehicles_checked = v_vehicles, alerts_written = v_alerts, drift_rows = v_drift WHERE id = v_run_id;
  RETURN v_run_id;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fleet-maintenance-nightly';
    PERFORM cron.schedule('fleet-maintenance-nightly', '0 7 * * *',
      $cron$SELECT fleet.run_maintenance_nightly_check(NULL)$cron$);
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped fleet-maintenance-nightly';
  END IF;
END $$;;
