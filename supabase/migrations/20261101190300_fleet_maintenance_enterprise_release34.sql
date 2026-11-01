-- Release 3 + 4: DVIR flag, KPIs, audit log, approval threshold, integrity checks

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS do_not_drive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_drive_reason text,
  ADD COLUMN IF NOT EXISTS do_not_drive_set_at timestamptz
ALTER TABLE fleet.organization_settings
  ADD COLUMN IF NOT EXISTS wo_approval_threshold_jmd numeric NOT NULL DEFAULT 50000
ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS updated_by uuid
ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS updated_by uuid
ALTER TABLE public.maintenance_inspection_items
  ADD COLUMN IF NOT EXISTS safety_critical boolean NOT NULL DEFAULT false
CREATE TABLE IF NOT EXISTS fleet.driver_maintenance_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  driver_user_id uuid NOT NULL,
  vehicle_id text,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX IF NOT EXISTS idx_driver_maint_notif_driver_unread
  ON fleet.driver_maintenance_notifications (driver_user_id, created_at DESC)
  WHERE read_at IS NULL
ALTER TABLE fleet.driver_maintenance_notifications ENABLE ROW LEVEL SECURITY
GRANT ALL ON fleet.driver_maintenance_notifications TO service_role
DROP VIEW IF EXISTS fleet.maintenance_kpi_monthly_v
-- cost/km = total WO cost / fleet km (max-min odometer per vehicle per month)
-- pm_on_time_pct = schedule rows due in month completed on/before due date
CREATE OR REPLACE VIEW fleet.maintenance_kpi_monthly_v AS
WITH wo_month AS (
  SELECT
    wo.organization_id,
    date_trunc('month', wo.performed_at_date::timestamp)::date AS month_start,
    count(*) FILTER (WHERE wo.status IN ('completed', 'closed') AND wo.voided_at IS NULL) AS completed_wo_count,
    coalesce(sum(wo.total_cost) FILTER (WHERE wo.status IN ('completed', 'closed') AND wo.voided_at IS NULL), 0) AS total_cost_jmd,
    coalesce(
      avg(
        EXTRACT(epoch FROM (coalesce(wo.back_on_road_at, wo.closed_at) - wo.off_road_at)) / 86400.0
      ) FILTER (WHERE wo.off_road_at IS NOT NULL),
      0
    ) AS avg_days_off_road
  FROM public.maintenance_work_orders wo
  WHERE wo.performed_at_date IS NOT NULL
  GROUP BY 1, 2
),
km_by_vehicle AS (
  SELECT
    r.organization_id,
    date_trunc('month', r.recorded_at)::date AS month_start,
    r.vehicle_id,
    greatest(max(r.reading) - min(r.reading), 0) AS km_driven
  FROM fleet.odometer_readings r
  WHERE r.is_voided IS NOT TRUE
  GROUP BY 1, 2, 3
),
km_month AS (
  SELECT organization_id, month_start, sum(km_driven) AS fleet_km_driven
  FROM km_by_vehicle
  GROUP BY 1, 2
),
pm_month AS (
  SELECT
    vcs.organization_id,
    date_trunc('month', vcs.next_due_date::timestamp)::date AS month_start,
    count(*) FILTER (WHERE vcs.next_due_date IS NOT NULL) AS pm_due_count,
    count(*) FILTER (
      WHERE vcs.next_due_date IS NOT NULL
        AND vcs.last_performed_date IS NOT NULL
        AND vcs.last_performed_date <= vcs.next_due_date
    ) AS pm_on_time_count
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.next_due_date IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  w.organization_id,
  w.month_start,
  w.completed_wo_count,
  w.total_cost_jmd,
  coalesce(
    w.total_cost_jmd / nullif(k.fleet_km_driven, 0),
    0
  ) AS cost_per_km_approx,
  w.avg_days_off_road,
  coalesce(
    100.0 * p.pm_on_time_count / nullif(p.pm_due_count, 0),
    0
  ) AS pm_on_time_pct
FROM wo_month w
LEFT JOIN km_month k
  ON k.organization_id = w.organization_id AND k.month_start = w.month_start
LEFT JOIN pm_month p
  ON p.organization_id = w.organization_id AND p.month_start = w.month_start
GRANT SELECT ON fleet.maintenance_kpi_monthly_v TO service_role
CREATE OR REPLACE FUNCTION fleet.maintenance_audit_log_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_actor uuid;
  v_reason text;
  v_row jsonb;
BEGIN
  v_row := to_jsonb(coalesce(NEW, OLD));
  v_actor := coalesce(
    nullif(v_row ->> 'updated_by', '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  v_reason := coalesce(
    v_row ->> 'cancel_reason',
    v_row ->> 'void_reason',
    TG_ARGV[0]
  );
  INSERT INTO fleet.maintenance_audit_log (
    organization_id,
    entity_type,
    entity_id,
    actor_id,
    reason,
    before_json,
    after_json
  ) VALUES (
    coalesce(NEW.organization_id, OLD.organization_id),
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id)::text,
    v_actor,
    v_reason,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END
  );
  RETURN coalesce(NEW, OLD);
END;
$$
DROP TRIGGER IF EXISTS trg_mwo_audit ON public.maintenance_work_orders
CREATE TRIGGER trg_mwo_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_work_orders
  FOR EACH ROW EXECUTE FUNCTION fleet.maintenance_audit_log_trigger_fn()
DROP TRIGGER IF EXISTS trg_mwo_line_audit ON public.maintenance_work_order_lines
CREATE TRIGGER trg_mwo_line_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_work_order_lines
  FOR EACH ROW EXECUTE FUNCTION fleet.maintenance_audit_log_trigger_fn()
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
    jsonb_build_object('run_id', r.id, 'drift_rows', r.drift_rows, 'started_at', r.started_at)
  FROM fleet.maintenance_job_runs r
  WHERE r.job_name = 'nightly_check'
    AND r.success = true
    AND r.drift_rows > 0
    AND r.started_at > now() - interval '2 days'
    AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  UNION ALL
  SELECT 'event_unprocessed_1h',
    jsonb_build_object('event_id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'vehicle_id', e.vehicle_id)
  FROM fleet.maintenance_events e
  WHERE e.processed_at IS NULL
    AND e.occurred_at < now() - interval '1 hour'
    AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completed_wo_cost_no_finance',
    jsonb_build_object('work_order_id', wo.id, 'total_cost', wo.total_cost, 'vehicle_id', wo.vehicle_id)
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND coalesce(wo.total_cost, 0) > 0
    AND wo.maintenance_record_id IS NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'completion_odo_below_previous',
    jsonb_build_object('work_order_id', wo.id, 'odometer', wo.odometer, 'vehicle_id', wo.vehicle_id)
  FROM public.maintenance_work_orders wo
  JOIN LATERAL (
    SELECT r.reading
    FROM fleet.odometer_readings r
    WHERE r.vehicle_id = wo.vehicle_id
      AND r.organization_id = wo.organization_id
      AND r.is_voided IS NOT TRUE
      AND r.recorded_at < coalesce(wo.closed_at, wo.opened_at)
    ORDER BY r.recorded_at DESC
    LIMIT 1
  ) prev ON true
  WHERE wo.status = 'completed'
    AND wo.odometer IS NOT NULL
    AND wo.odometer < prev.reading
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'no_odometer_7d',
    jsonb_build_object('vehicle_id', v.id, 'license_plate', v.license_plate)
  FROM fleet.vehicles v
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet.odometer_readings r
    WHERE r.vehicle_id = v.id
      AND r.is_voided IS NOT TRUE
      AND r.recorded_at > now() - interval '7 days'
  )
    AND (p_organization_id IS NULL OR v.organization_id = p_organization_id)
  UNION ALL
  SELECT 'wo_open_over_14d',
    jsonb_build_object('work_order_id', wo.id, 'status', wo.status, 'opened_at', wo.opened_at)
  FROM public.maintenance_work_orders wo
  WHERE wo.status IN ('draft', 'open', 'scheduled', 'in_shop', 'awaiting_parts', 'in_progress')
    AND wo.opened_at < now() - interval '14 days'
    AND wo.voided_at IS NULL
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id);
$$
-- Driver notifications for request triage + do-not-drive (G-07)
CREATE OR REPLACE FUNCTION fleet.process_maintenance_events(p_batch_size integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
  v_driver uuid;
  v_title text;
  v_body text;
BEGIN
  FOR v_row IN
    SELECT id, organization_id, vehicle_id, type, payload
    FROM fleet.maintenance_events
    WHERE processed_at IS NULL
    ORDER BY occurred_at ASC
    LIMIT greatest(1, least(p_batch_size, 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_row.type IN ('request.approved', 'request.declined', 'do_not_drive') THEN
      v_driver := nullif(coalesce(v_row.payload->>'driverId', v_row.payload->>'driver_id'), '')::uuid;
      IF v_driver IS NULL AND nullif(v_row.payload->>'workOrderId', '') IS NOT NULL THEN
        SELECT nullif(coalesce(wo.payload_json->>'driverId', wo.payload_json->>'driver_id'), '')::uuid
        INTO v_driver
        FROM public.maintenance_work_orders wo
        WHERE wo.id = (v_row.payload->>'workOrderId')::uuid;
      END IF;

      IF v_driver IS NOT NULL THEN
        IF v_row.type = 'request.approved' THEN
          v_title := 'Service request approved';
          v_body := 'Your maintenance request was approved by the fleet team.';
        ELSIF v_row.type = 'request.declined' THEN
          v_title := 'Service request declined';
          v_body := coalesce(v_row.payload->>'reason', 'Your maintenance request was declined.');
        ELSE
          v_title := 'Do not drive';
          v_body := coalesce(v_row.payload->>'reason', 'This vehicle is not cleared for road use.');
        END IF;

        INSERT INTO fleet.driver_maintenance_notifications (
          organization_id, driver_user_id, vehicle_id, event_type, title, body, payload
        ) VALUES (
          v_row.organization_id,
          v_driver,
          v_row.vehicle_id,
          v_row.type,
          v_title,
          v_body,
          coalesce(v_row.payload, '{}'::jsonb) || jsonb_build_object('sourceEventId', v_row.id)
        );
      END IF;
    END IF;
    UPDATE fleet.maintenance_events SET processed_at = now() WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$
CREATE OR REPLACE FUNCTION public.maintenance_integrity_report(p_organization_id text DEFAULT NULL)
RETURNS TABLE (check_name text, detail jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, public
AS $$ SELECT * FROM fleet.maintenance_integrity_report(p_organization_id); $$
GRANT EXECUTE ON FUNCTION public.maintenance_integrity_report(text) TO service_role
