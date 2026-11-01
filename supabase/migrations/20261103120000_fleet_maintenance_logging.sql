-- Fleet maintenance logging program (audit Rev 2): odometer trust, derived schedules, nightly job, events.

-- ---------------------------------------------------------------------------
-- 1. Org + L-15 columns
-- ---------------------------------------------------------------------------
ALTER TABLE fleet.organization_settings
  ADD COLUMN IF NOT EXISTS due_soon_km integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS due_soon_days integer NOT NULL DEFAULT 14;

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS fleet_unit_id text,
  ADD COLUMN IF NOT EXISTS home_base text;

ALTER TABLE fleet.odometer_readings
  ADD COLUMN IF NOT EXISTS anomaly_reason text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.maintenance_service_categories
  ADD COLUMN IF NOT EXISTS overdue_effect text;

ALTER TABLE public.maintenance_task_templates
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS log_number text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mwo_log_number
  ON public.maintenance_work_orders (log_number)
  WHERE log_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mwo_org_idempotency
  ON public.maintenance_work_orders (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.vehicle_component_schedule
  ADD COLUMN IF NOT EXISTS baseline_source text,
  ADD COLUMN IF NOT EXISTS baseline_odometer numeric,
  ADD COLUMN IF NOT EXISTS baseline_date date;

CREATE SEQUENCE IF NOT EXISTS fleet.maintenance_log_number_seq START 1;

CREATE OR REPLACE FUNCTION fleet.next_maintenance_log_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('fleet.maintenance_log_number_seq');
  RETURN 'LOG-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Events, alerts, job runs, audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet.maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  vehicle_id text,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_maint_events_org_occurred
  ON fleet.maintenance_events (organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  alert_key text NOT NULL,
  vehicle_id text NOT NULL,
  category_id uuid,
  position text,
  alert_date date NOT NULL,
  severity text NOT NULL DEFAULT 'overdue',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_maint_alert_key UNIQUE (alert_key)
);

CREATE INDEX IF NOT EXISTS idx_maint_alerts_org_created
  ON fleet.maintenance_alerts (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text,
  job_name text NOT NULL DEFAULT 'nightly_check',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  vehicles_checked integer NOT NULL DEFAULT 0,
  alerts_written integer NOT NULL DEFAULT 0,
  drift_rows integer NOT NULL DEFAULT 0,
  error text,
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_maint_job_runs_started
  ON fleet.maintenance_job_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS fleet.maintenance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  actor_id uuid,
  reason text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fleet.maintenance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet.maintenance_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_events_service') THEN
    CREATE POLICY maint_events_service ON fleet.maintenance_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_alerts_service') THEN
    CREATE POLICY maint_alerts_service ON fleet.maintenance_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_job_runs_service') THEN
    CREATE POLICY maint_job_runs_service ON fleet.maintenance_job_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'fleet' AND policyname = 'maint_audit_service') THEN
    CREATE POLICY maint_audit_service ON fleet.maintenance_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON fleet.maintenance_events TO service_role;
GRANT ALL ON fleet.maintenance_alerts TO service_role;
GRANT ALL ON fleet.maintenance_job_runs TO service_role;
GRANT ALL ON fleet.maintenance_audit_log TO service_role;
GRANT USAGE ON SEQUENCE fleet.maintenance_log_number_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Trusted current odometer view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW fleet.vehicle_current_odometer_v AS
SELECT DISTINCT ON (r.vehicle_id)
  r.vehicle_id,
  r.organization_id,
  r.reading,
  r.recorded_at,
  r.source,
  r.reading_date
FROM fleet.odometer_readings r
WHERE r.is_voided = false
  AND r.is_anomaly = false
  AND r.reading > 0
ORDER BY r.vehicle_id, r.recorded_at DESC, r.reading DESC;

COMMENT ON VIEW fleet.vehicle_current_odometer_v IS
  'Latest trusted odometer per vehicle (not max ever).';

-- ---------------------------------------------------------------------------
-- 4. Anomaly assessment (L-03)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.assess_odometer_anomaly(
  p_vehicle_id text,
  p_reading numeric,
  p_recorded_at timestamptz
)
RETURNS TABLE (
  is_anomaly boolean,
  anomaly_reason text,
  prior_reading numeric,
  prior_recorded_at timestamptz,
  next_reading numeric,
  next_recorded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_prior record;
  v_next record;
  v_reason text;
  v_anom boolean := false;
  v_km_tol constant numeric := 50;
  v_daily_tol constant numeric := 1500;
BEGIN
  SELECT reading, recorded_at INTO v_prior
  FROM fleet.odometer_readings
  WHERE vehicle_id = p_vehicle_id
    AND is_voided = false
    AND is_anomaly = false
    AND recorded_at <= p_recorded_at
    AND id IS NOT NULL
  ORDER BY recorded_at DESC, reading DESC
  LIMIT 1;

  SELECT reading, recorded_at INTO v_next
  FROM fleet.odometer_readings
  WHERE vehicle_id = p_vehicle_id
    AND is_voided = false
    AND is_anomaly = false
    AND recorded_at > p_recorded_at
  ORDER BY recorded_at ASC, reading ASC
  LIMIT 1;

  IF v_prior.reading IS NOT NULL AND p_reading < v_prior.reading - v_km_tol THEN
    v_anom := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Below prior reading by more than 50 km';
  END IF;

  IF v_next.reading IS NOT NULL AND p_reading > v_next.reading + v_km_tol THEN
    v_anom := true;
    v_reason := coalesce(v_reason || '; ', '') || 'Above next reading by more than 50 km';
  END IF;

  IF v_prior.reading IS NOT NULL AND v_prior.recorded_at IS NOT NULL THEN
    IF abs(p_reading - v_prior.reading) / greatest(1, extract(epoch FROM (p_recorded_at - v_prior.recorded_at)) / 86400.0) > v_daily_tol THEN
      v_anom := true;
      v_reason := coalesce(v_reason || '; ', '') || 'Implausible km/day vs prior reading';
    END IF;
  END IF;

  IF v_next.reading IS NOT NULL AND v_next.recorded_at IS NOT NULL THEN
    IF abs(v_next.reading - p_reading) / greatest(1, extract(epoch FROM (v_next.recorded_at - p_recorded_at)) / 86400.0) > v_daily_tol THEN
      v_anom := true;
      v_reason := coalesce(v_reason || '; ', '') || 'Implausible km/day vs next reading';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_anom,
    v_reason,
    v_prior.reading,
    v_prior.recorded_at,
    v_next.reading,
    v_next.recorded_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Recompute schedule from completed work (L-07) — component rows only
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
    SELECT
      wo.performed_at_date,
      wo.odometer,
      wo.performed_at_date AS pdate
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

-- ---------------------------------------------------------------------------
-- 6. Due view (L-10, L-11) — per component/position
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW fleet.maintenance_due_v AS
WITH settings AS (
  SELECT
    organization_id,
    due_soon_km,
    due_soon_days
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
SELECT
  organization_id,
  vehicle_id,
  CASE
    WHEN bool_or(due_status = 'overdue') THEN 'overdue'
    WHEN bool_or(due_status = 'odometer_needed') THEN 'odometer_needed'
    WHEN bool_or(due_status = 'due_soon') THEN 'due_soon'
    ELSE 'ok'
  END AS fleet_status
FROM fleet.maintenance_due_v
GROUP BY organization_id, vehicle_id;

-- Service history view (L-06) — completed non-voided lines
CREATE OR REPLACE VIEW fleet.maintenance_service_history_v AS
SELECT
  l.id AS line_id,
  wo.organization_id,
  wo.vehicle_id,
  wo.id AS work_order_id,
  wo.log_number,
  wo.performed_at_date,
  wo.odometer AS performed_at_miles,
  wo.provider,
  wo.currency,
  wo.invoice_url,
  wo.voided_at,
  l.component_id AS category_id,
  l.component_code AS category_code,
  l.component_name AS category_name,
  l.action,
  l.positions,
  l.part_number,
  l.brand,
  l.material,
  l.line_total,
  l.values_json,
  wo.closed_at AS completed_at
FROM public.maintenance_work_order_lines l
JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
WHERE wo.status = 'completed'
  AND wo.voided_at IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Nightly job (L-09)
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

    FOR r IN
      SELECT DISTINCT vehicle_id AS vehicle_id
      FROM public.vehicle_component_schedule
      WHERE organization_id = v_org
    LOOP
      PERFORM fleet.recompute_maintenance_schedule(r.vehicle_id);
    END LOOP;
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

-- pg_cron: 07:00 UTC daily (02:00 Jamaica EST)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'fleet-maintenance-nightly';
    PERFORM cron.schedule(
      'fleet-maintenance-nightly',
      '0 7 * * *',
      $cron$SELECT fleet.run_maintenance_nightly_check(NULL)$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron missing; skipped fleet-maintenance-nightly';
  END IF;
END $$;

-- PostgREST wrappers (public)
CREATE OR REPLACE VIEW public.fleet_vehicle_current_odometer_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.vehicle_current_odometer_v;

CREATE OR REPLACE VIEW public.fleet_maintenance_due_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_due_v;

CREATE OR REPLACE VIEW public.fleet_maintenance_vehicle_status_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_vehicle_status_v;

CREATE OR REPLACE VIEW public.fleet_maintenance_service_history_v WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_service_history_v;

GRANT SELECT ON public.fleet_vehicle_current_odometer_v TO service_role;
GRANT SELECT ON public.fleet_maintenance_due_v TO service_role;
GRANT SELECT ON public.fleet_maintenance_vehicle_status_v TO service_role;
GRANT SELECT ON public.fleet_maintenance_service_history_v TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_maintenance_schedule(p_vehicle_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.recompute_maintenance_schedule(p_vehicle_id); $$;

CREATE OR REPLACE FUNCTION public.run_maintenance_nightly_check(p_organization_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.run_maintenance_nightly_check(p_organization_id); $$;

CREATE OR REPLACE FUNCTION public.next_maintenance_log_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT fleet.next_maintenance_log_number(); $$;

GRANT EXECUTE ON FUNCTION public.recompute_maintenance_schedule(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_maintenance_nightly_check(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_maintenance_log_number() TO service_role;

CREATE OR REPLACE VIEW public.fleet_maintenance_events WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_events;
CREATE OR REPLACE VIEW public.fleet_maintenance_alerts WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_alerts;
CREATE OR REPLACE VIEW public.fleet_maintenance_job_runs WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_job_runs;
CREATE OR REPLACE VIEW public.fleet_maintenance_audit_log WITH (security_invoker = true) AS
  SELECT * FROM fleet.maintenance_audit_log;

GRANT SELECT, INSERT ON public.fleet_maintenance_events TO service_role;
GRANT SELECT, INSERT ON public.fleet_maintenance_alerts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.fleet_maintenance_job_runs TO service_role;
GRANT SELECT, INSERT ON public.fleet_maintenance_audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Immutability (L-14)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_mwo_immutable ON public.maintenance_work_orders;
CREATE TRIGGER trg_mwo_immutable
  BEFORE UPDATE OR DELETE ON public.maintenance_work_orders
  FOR EACH ROW EXECUTE FUNCTION fleet.guard_completed_maintenance_wo();

-- ---------------------------------------------------------------------------
-- 9. Data remediation — duplicate WO (L-04)
-- ---------------------------------------------------------------------------
UPDATE public.maintenance_work_orders
SET status = 'cancelled',
    notes = coalesce(notes, '') || E'\n[duplicate of 9a0e45b7- completed sibling]',
    void_reason = 'duplicate of 9a0e45b7',
    updated_at = now()
WHERE id = 'd3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a'::uuid
  AND status = 'in_progress';

-- ---------------------------------------------------------------------------
-- 10. Integrity monitors (§6) — returns offending rows
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
  );
$$;
