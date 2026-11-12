-- Service discount on a maintenance visit (Layer 1 — Data).
-- total_cost = round(sum of active line_total − discount_amount, 2).

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0);

COMMENT ON COLUMN public.maintenance_work_orders.discount_amount IS
  'Discount the shop gave on this visit. total_cost = sum of active lines minus this.';

ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_total_cost_nonneg;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_total_cost_nonneg
  CHECK (total_cost IS NULL OR total_cost >= 0);

ALTER TABLE fleet.organization_settings
  ADD COLUMN IF NOT EXISTS maintenance_discount_enabled boolean NOT NULL DEFAULT false;

-- Completed services stay locked, except: void the whole service, or adjust total/discount
-- after a job is voided (net total = sum of active lines − discount; discount may only decrease).
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
    IF (NEW.total_cost IS DISTINCT FROM OLD.total_cost
        OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount)
       AND (to_jsonb(NEW) - ARRAY['total_cost', 'discount_amount', 'updated_at'])
         = (to_jsonb(OLD) - ARRAY['total_cost', 'discount_amount', 'updated_at']) THEN
      SELECT coalesce(sum(l.line_total), 0) INTO v_active_total
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = NEW.id AND l.voided_at IS NULL;
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
         AND NEW.discount_amount > OLD.discount_amount THEN
        RAISE EXCEPTION 'completed work orders cannot be edited';
      END IF;
      IF round(coalesce(NEW.total_cost, 0), 2)
         = round(v_active_total - coalesce(NEW.discount_amount, 0), 2) THEN
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
  v_line_sum numeric;
  v_discount numeric;
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
  INTO v_line_sum, v_remaining
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = v_wo.id AND l.voided_at IS NULL;

  v_discount := least(coalesce(v_wo.discount_amount, 0), v_line_sum);
  v_new_total := round(v_line_sum - v_discount, 2);

  UPDATE public.maintenance_work_orders
  SET discount_amount = v_discount,
      total_cost = v_new_total,
      updated_at = v_now
  WHERE id = v_wo.id;

  IF v_wo.maintenance_record_id IS NOT NULL THEN
    UPDATE public.maintenance_records
    SET cost = v_new_total, updated_at = v_now
    WHERE id = v_wo.maintenance_record_id;
  END IF;

  UPDATE public.maintenance_service_ledger
  SET voided_at = v_now
  WHERE work_order_line_id = p_line_id AND voided_at IS NULL;

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
    'newTotal', v_new_total,
    'remainingJobs', v_remaining,
    'serviceVoided', v_remaining = 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_void_work_order_line(text, uuid, text) TO service_role;

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
    wo.closed_at AS completed_at,
    wo.discount_amount
   FROM public.maintenance_work_order_lines l
     JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE wo.status = 'completed'::text AND wo.voided_at IS NULL AND l.voided_at IS NULL;

CREATE OR REPLACE VIEW public.fleet_maintenance_service_history_v
  WITH (security_invoker = true) AS
 SELECT * FROM fleet.maintenance_service_history_v;

GRANT SELECT ON public.fleet_maintenance_service_history_v TO service_role;

NOTIFY pgrst, 'reload schema';
