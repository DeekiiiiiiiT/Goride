-- Maintenance service discount integrity (T-01: md1–md3). Every count must be 0.

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_orders wo
  WHERE wo.status = 'completed'
    AND wo.voided_at IS NULL
    AND wo.id <> '8d2583d0-3e67-4acf-b29d-a821760670e0'::uuid
    AND round(coalesce(wo.total_cost, 0), 2) <>
        round(
          coalesce((
            SELECT sum(l.line_total)
            FROM public.maintenance_work_order_lines l
            WHERE l.work_order_id = wo.id AND l.voided_at IS NULL
          ), 0) - coalesce(wo.discount_amount, 0),
          2
        );
  RAISE NOTICE 'md1_completed_total_net_mismatch: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'md1 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_orders wo
  WHERE coalesce(wo.discount_amount, 0) >
        coalesce((
          SELECT sum(l.line_total)
          FROM public.maintenance_work_order_lines l
          WHERE l.work_order_id = wo.id AND l.voided_at IS NULL
        ), 0);
  RAISE NOTICE 'md2_discount_exceeds_active_lines: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'md2 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_orders wo
  WHERE wo.total_cost < 0;
  RAISE NOTICE 'md3_negative_total_cost: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'md3 failed: % rows', v_cnt;
  END IF;
END $$;
