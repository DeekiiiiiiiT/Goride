-- Service history delete = only the row the user clicked.
-- A saved service can hold several jobs (e.g. Wheel Alignment + Wheel Balancing). The history
-- screen shows one row per job, but the only delete was "void the whole service", so deleting
-- one row removed every job in that service. This adds a per-job void:
--   * the job is marked voided (kept for audit, hidden from history),
--   * the service total + maintenance record cost drop to the jobs that remain,
--   * the job stops counting toward due dates (service ledger row voided),
--   * if no jobs remain, the service itself is voided.
-- The books entry is re-posted at the new total by the server (same delete + re-append the
-- edit-record route already uses).

-- 1. Per-job void mark
ALTER TABLE public.maintenance_work_order_lines
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.maintenance_work_order_lines.voided_at IS
  'Set when the user deletes this one job from a completed service. Hidden from history; kept for audit.';

-- 2. Completed jobs stay locked, except the one change "mark this job voided".
CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo_line()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
      -- Allowed: void this one job, nothing else changes.
      IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
         AND (to_jsonb(NEW) - ARRAY['voided_at', 'void_reason', 'updated_at', 'updated_by'])
           = (to_jsonb(OLD) - ARRAY['voided_at', 'void_reason', 'updated_at', 'updated_by']) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'completed work order lines cannot be edited';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'completed work order lines cannot be deleted';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Completed services stay locked, except: void the whole service (as before), or lower the
--    total to exactly the sum of its remaining (non-voided) jobs after a job is voided.
CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_active_total numeric;
BEGIN
  IF current_setting('fleet.legacy_repair', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.total_cost IS DISTINCT FROM OLD.total_cost
       AND (to_jsonb(NEW) - ARRAY['total_cost', 'updated_at'])
         = (to_jsonb(OLD) - ARRAY['total_cost', 'updated_at']) THEN
      SELECT coalesce(sum(l.line_total), 0) INTO v_active_total
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = NEW.id AND l.voided_at IS NULL;
      IF round(coalesce(NEW.total_cost, 0), 2) = round(v_active_total, 2) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'completed work orders cannot be edited';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed work orders cannot be deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4. Void one job (server only).
CREATE OR REPLACE FUNCTION public.fleet_void_work_order_line(
  p_organization_id text,
  p_line_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_line public.maintenance_work_order_lines%ROWTYPE;
  v_wo public.maintenance_work_orders%ROWTYPE;
  v_now timestamptz := now();
  v_new_total numeric;
  v_remaining integer;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_line FROM public.maintenance_work_order_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;

  SELECT * INTO v_wo FROM public.maintenance_work_orders
  WHERE id = v_line.work_order_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_wo.status <> 'completed' THEN RAISE EXCEPTION 'Only saved services can be deleted'; END IF;
  IF v_wo.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This service is already deleted'; END IF;
  IF v_line.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This job is already deleted'; END IF;

  UPDATE public.maintenance_work_order_lines
  SET voided_at = v_now, void_reason = btrim(p_reason), updated_at = v_now
  WHERE id = p_line_id;

  SELECT coalesce(sum(l.line_total), 0),
         count(*) FILTER (WHERE coalesce(l.recommended, false) = false)
  INTO v_new_total, v_remaining
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo.id AND l.voided_at IS NULL;

  UPDATE public.maintenance_work_orders
  SET total_cost = round(v_new_total, 2), updated_at = v_now
  WHERE id = v_wo.id;

  IF v_wo.maintenance_record_id IS NOT NULL THEN
    UPDATE public.maintenance_records
    SET cost = round(v_new_total, 2), updated_at = v_now
    WHERE id = v_wo.maintenance_record_id;
  END IF;

  -- The job no longer counts toward due dates.
  UPDATE public.maintenance_service_ledger
  SET voided_at = v_now
  WHERE work_order_line_id = p_line_id AND voided_at IS NULL;

  -- Last job gone: the service itself is deleted.
  IF v_remaining = 0 THEN
    UPDATE public.maintenance_work_orders
    SET voided_at = v_now, void_reason = btrim(p_reason), updated_at = v_now
    WHERE id = v_wo.id;
  END IF;

  RETURN jsonb_build_object(
    'workOrderId', v_wo.id,
    'vehicleId', v_wo.vehicle_id,
    'recordId', v_wo.maintenance_record_id,
    'lineId', p_line_id,
    'jobName', v_line.component_name,
    'lineTotal', v_line.line_total,
    'newTotal', round(v_new_total, 2),
    'remainingJobs', v_remaining,
    'serviceVoided', v_remaining = 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) TO service_role;

-- 5. History hides deleted jobs.
CREATE OR REPLACE VIEW fleet.maintenance_service_history_v AS
 SELECT l.id AS line_id,
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
  WHERE wo.status = 'completed'::text AND wo.voided_at IS NULL AND l.voided_at IS NULL;

NOTIFY pgrst, 'reload schema';
