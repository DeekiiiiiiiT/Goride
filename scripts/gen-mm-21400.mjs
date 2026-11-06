import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const dueSrc = fs.readFileSync(
  path.join(root, "supabase/migrations/20261101043015_fleet_maintenance_no_record_r04_due_view.sql"),
  "utf8",
);
const recomputeSrc = fs.readFileSync(
  path.join(root, "supabase/migrations/20261101190100_fleet_maintenance_enterprise_release1.sql"),
  "utf8",
);
const reMatch = recomputeSrc.match(
  /CREATE OR REPLACE FUNCTION fleet.recompute_maintenance_schedule[\s\S]*?^\$\$;/m,
);
if (!reMatch) throw new Error("recompute not found");

function toKm(sql) {
  return sql
    .replace(/default_interval_miles/g, "default_interval_km")
    .replace(/interval_miles/g, "interval_km")
    .replace(/last_performed_miles/g, "last_performed_km")
    .replace(/next_due_miles_max/g, "next_due_km_max")
    .replace(/next_due_miles/g, "next_due_km")
    .replace(/v_interval_miles/g, "v_interval_km");
}

const recompute = toKm(reMatch[0]);
const dueView = toKm(dueSrc);

const nightly = `-- M-13: one open alert per car + part + position
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
`;

const outPath = path.join(root, "supabase/migrations/20261106131200_mm_rename_db_readers.sql");
const out =
  "-- S-02 / S-03: km column readers + M-13 open alert lifecycle\n\n" +
  recompute +
  "\n\n" +
  dueView +
  "\n\n" +
  nightly +
  "\n";
fs.writeFileSync(outPath, out);
console.log("Wrote", outPath, out.length, "bytes");
