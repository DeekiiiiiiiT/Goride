-- Inspection findings D1 invariant checks. Every count must be 0.

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_lines l
  WHERE coalesce(l.recommended, false) = true
    AND l.voided_at IS NULL
    AND (
      coalesce(l.line_total, 0) <> 0
      OR EXISTS (
        SELECT 1 FROM public.maintenance_work_order_line_item i
        WHERE i.work_order_line_id = l.id
      )
    );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'found_line_with_cost_or_items: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_lines cl
  JOIN public.maintenance_work_order_lines fl ON fl.id = cl.from_found_line_id
  JOIN public.maintenance_work_orders cwo ON cwo.id = cl.work_order_id
  JOIN public.maintenance_work_orders fwo ON fwo.id = fl.work_order_id
  WHERE cl.voided_at IS NULL
    AND cl.from_found_line_id IS NOT NULL
    AND (
      coalesce(fl.recommended, false) = false
      OR cwo.organization_id IS DISTINCT FROM fwo.organization_id
      OR cwo.vehicle_id IS DISTINCT FROM fwo.vehicle_id
    );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'invalid_from_found_line_target: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT cl.from_found_line_id
    FROM public.maintenance_work_order_lines cl
    JOIN public.maintenance_work_orders cwo ON cwo.id = cl.work_order_id
    WHERE cl.from_found_line_id IS NOT NULL
      AND cl.voided_at IS NULL
      AND cwo.voided_at IS NULL
    GROUP BY cl.from_found_line_id
    HAVING count(*) > 1
  ) dup;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'duplicate_live_closer_for_found_line: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_lines l
  WHERE l.closed_at IS NOT NULL
    AND coalesce(l.recommended, false) = false
    AND l.voided_at IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'closed_non_found_line: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_orders wo
  WHERE wo.voided_at IS NULL
    AND round(coalesce(wo.total_cost, 0), 2) <>
        round(
          coalesce((
            SELECT sum(l.line_total)
            FROM public.maintenance_work_order_lines l
            WHERE l.work_order_id = wo.id
              AND l.voided_at IS NULL
              AND coalesce(l.recommended, false) = false
          ), 0) - coalesce(wo.discount_amount, 0),
          2
        );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'work_order_total_mismatch_excludes_found: % rows', v_cnt;
  END IF;
END $$;
-- IF-16: found ("not done yet") lines never appear in Service history.
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_service_history_v h
  JOIN public.maintenance_work_order_lines l ON l.id = h.line_id
  WHERE l.recommended IS TRUE;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'found_line_in_service_history: % rows', v_cnt;
  END IF;
END $$;
