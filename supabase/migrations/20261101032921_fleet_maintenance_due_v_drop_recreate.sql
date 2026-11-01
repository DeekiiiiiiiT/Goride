-- Prod-applied: fleet_maintenance_due_v_drop_recreate + line immutability (audit O-07 sync)

CREATE OR REPLACE FUNCTION fleet.guard_completed_maintenance_wo_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_voided timestamptz;
BEGIN
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

DROP TRIGGER IF EXISTS trg_mwo_line_immutable ON public.maintenance_work_order_lines;
CREATE TRIGGER trg_mwo_line_immutable
  BEFORE UPDATE OR DELETE ON public.maintenance_work_order_lines
  FOR EACH ROW EXECUTE FUNCTION fleet.guard_completed_maintenance_wo_line();
