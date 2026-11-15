-- Service items D1 invariant checks. Every count must be 0.

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_item i
  JOIN public.maintenance_service_categories c ON c.id = i.job_id
  WHERE i.removed_at IS NULL AND c.kind <> 'component';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'links_on_non_component_job: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_item i
  JOIN public.maintenance_service_categories c ON c.id = i.part_type_id
  WHERE i.removed_at IS NULL
    AND i.part_type_id IS NOT NULL
    AND (c.kind <> 'component' OR c.is_part IS NOT true);
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'links_on_non_part_type: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_item i
  WHERE i.removed_at IS NULL
    AND (
      (i.part_type_id IS NULL AND i.supply_id IS NULL)
      OR (i.part_type_id IS NOT NULL AND i.supply_id IS NOT NULL)
    );
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'links_with_both_or_neither_item: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT i.job_id, i.part_type_id, count(*) AS n
    FROM public.maintenance_job_item i
    WHERE i.removed_at IS NULL AND i.part_type_id IS NOT NULL
    GROUP BY i.job_id, i.part_type_id
    HAVING count(*) > 1
    UNION ALL
    SELECT i.job_id, i.supply_id, count(*) AS n
    FROM public.maintenance_job_item i
    WHERE i.removed_at IS NULL AND i.supply_id IS NOT NULL
    GROUP BY i.job_id, i.supply_id
    HAVING count(*) > 1
  ) dup;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'duplicate_active_item_on_job: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT lower(name) AS n, count(*) AS c
    FROM public.maintenance_supply
    WHERE status = 'active'
    GROUP BY lower(name)
    HAVING count(*) > 1
  ) dup;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'duplicate_active_supply_names: % groups', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_supply s
  WHERE s.name <> btrim(regexp_replace(s.name, '\s+', ' ', 'g'))
     OR char_length(s.name) < 1
     OR char_length(s.name) > 120;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'untidy_supply_names: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_item i
  JOIN public.maintenance_job_relations r
    ON r.from_category_id = i.job_id AND r.to_category_id = i.part_type_id
  WHERE i.removed_at IS NULL AND i.part_type_id IS NOT NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'may_need_and_also_do_clash: % rows', v_cnt;
  END IF;
END $$;

-- D2: item work_order_id must match parent line
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_line_item i
  JOIN public.maintenance_work_order_lines l ON l.id = i.work_order_line_id
  WHERE i.work_order_id IS DISTINCT FROM l.work_order_id;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'line_item_work_order_mismatch: % rows', v_cnt;
  END IF;
END $$;

-- D2: line items_amount vs sum(item.amount)
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_lines l
  JOIN LATERAL (
    SELECT coalesce(sum(i.amount), 0) AS s
    FROM public.maintenance_work_order_line_item i
    WHERE i.work_order_line_id = l.id
  ) x ON true
  WHERE round(coalesce(l.items_amount, 0), 2) IS DISTINCT FROM round(x.s, 2);
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'line_items_amount_drift: % rows', v_cnt;
  END IF;
END $$;

-- D2: no items on declined lines
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_line_item i
  JOIN public.maintenance_work_order_lines l ON l.id = i.work_order_line_id
  WHERE coalesce(l.declined, false) = true;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'items_on_declined_lines: % rows', v_cnt;
  END IF;
END $$;

-- D2: part_id must match part_type via part_master
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_order_line_item i
  JOIN public.part_master pm ON pm.id = i.part_id
  WHERE i.part_id IS NOT NULL
    AND pm.maintenance_component_id IS DISTINCT FROM i.part_type_id;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'line_item_part_type_mismatch: % rows', v_cnt;
  END IF;
END $$;

-- D2: live ledger duplicates per line + position
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT work_order_line_id, coalesce(position, ''), count(*) AS n
    FROM public.maintenance_service_ledger
    WHERE work_order_line_id IS NOT NULL AND voided_at IS NULL
    GROUP BY work_order_line_id, coalesce(position, '')
    HAVING count(*) > 1
  ) d;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'ledger_live_duplicates: % groups', v_cnt;
  END IF;
END $$;

-- D2: ledger blank position
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_ledger
  WHERE position = '';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'ledger_blank_position: % rows', v_cnt;
  END IF;
END $$;

-- D2: at most one record per work_order_id
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT work_order_id, count(*) AS n
    FROM public.maintenance_records
    WHERE work_order_id IS NOT NULL
    GROUP BY work_order_id
    HAVING count(*) > 1
  ) d;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'duplicate_record_per_work_order: % groups', v_cnt;
  END IF;
END $$;

-- S2: completed work orders missing maintenance_record_id while record links work_order_id
DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_work_orders wo
  JOIN public.maintenance_records r ON r.work_order_id = wo.id
  WHERE wo.status = 'completed'
    AND wo.maintenance_record_id IS NULL;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'completed_wo_missing_record_link: % rows', v_cnt;
  END IF;
END $$;
