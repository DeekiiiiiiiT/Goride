CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'completed work orders cannot be edited';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed work orders cannot be deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_mwo_immutable ON public.maintenance_work_orders;
CREATE TRIGGER trg_mwo_immutable BEFORE UPDATE OR DELETE ON public.maintenance_work_orders
  FOR EACH ROW EXECUTE FUNCTION fleet.guard_completed_maintenance_wo();
UPDATE public.maintenance_work_orders SET status = 'cancelled',
  notes = coalesce(notes, '') || E'\n[duplicate of 9a0e45b7- completed sibling]',
  void_reason = 'duplicate of 9a0e45b7', updated_at = now()
WHERE id = 'd3aaacdd-99c5-4b3a-8f3b-0b27f2fb6e9a'::uuid AND status = 'in_progress';
CREATE OR REPLACE FUNCTION fleet.maintenance_integrity_report(p_organization_id text DEFAULT NULL)
RETURNS TABLE (check_name text, detail jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = fleet, public AS $$
  SELECT 'orphan_in_progress_log_path'::text,
    jsonb_build_object('work_order_id', wo.id, 'vehicle_id', wo.vehicle_id, 'opened_at', wo.opened_at)
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'in_progress' AND wo.opened_at < now() - interval '1 day'
    AND (p_organization_id IS NULL OR wo.organization_id = p_organization_id)
  UNION ALL
  SELECT 'missing_nightly_run_today', jsonb_build_object('today', current_date)
  WHERE NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_job_runs r WHERE r.success = true AND r.started_at::date = current_date
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  );
$$;;
