-- Service items ("May need") — Round 0 live data check (READ ONLY).
-- Paste the whole file into the Supabase SQL editor, press Run, and paste the result table back.
-- Nothing here changes data: it is one SELECT.

WITH
crs AS (
  SELECT s.id, btrim(regexp_replace(coalesce(s.supply_name, ''), '\s+', ' ', 'g')) AS tidy_name, c.kind
  FROM public.component_related_supply s
  LEFT JOIN public.maintenance_service_categories c ON c.id = s.component_id
),
led_dupes AS (
  SELECT work_order_line_id, coalesce(position, '') AS pos, count(*) AS n
  FROM public.maintenance_service_ledger
  WHERE work_order_line_id IS NOT NULL AND voided_at IS NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
),
rec_from_wo AS (
  SELECT maintenance_record_id AS record_id, count(*) AS n
  FROM public.maintenance_work_orders
  WHERE maintenance_record_id IS NOT NULL
  GROUP BY 1
  HAVING count(*) > 1
),
rec_payload AS (
  SELECT r.id AS record_id, (r.payload_json ->> 'workOrderId') AS wo_from_payload, wo.id AS wo_from_link
  FROM public.maintenance_records r
  LEFT JOIN public.maintenance_work_orders wo ON wo.maintenance_record_id = r.id
),
payload_wo_dupes AS (
  SELECT wo_from_payload, count(*) AS n
  FROM rec_payload
  WHERE wo_from_payload IS NOT NULL AND wo_from_link IS NULL
  GROUP BY 1
  HAVING count(*) > 1
),
wo_lines AS (
  SELECT wo.id, wo.status, wo.opened_at, count(l.id) AS line_count
  FROM public.maintenance_work_orders wo
  LEFT JOIN public.maintenance_work_order_lines l ON l.work_order_id = wo.id
  GROUP BY wo.id, wo.status, wo.opened_at
),
line_math AS (
  SELECT
    l.id,
    l.line_total,
    CASE WHEN l.declined THEN 0 ELSE round((
      CASE
        WHEN coalesce(l.qty, nullif(l.values_json ->> 'qty', '')::numeric, 0) > 0
         AND coalesce(l.unit_price, nullif(l.values_json ->> 'unit_price', '')::numeric, 0) > 0
          THEN coalesce(l.qty, nullif(l.values_json ->> 'qty', '')::numeric)
             * coalesce(l.unit_price, nullif(l.values_json ->> 'unit_price', '')::numeric)
        ELSE coalesce(l.material, nullif(l.values_json ->> 'material', '')::numeric, 0)
      END
      + CASE
          WHEN l.complimentary THEN 0
          WHEN coalesce(l.labor_hours, 0) > 0 AND coalesce(l.labor_rate, 0) > 0 THEN l.labor_hours * l.labor_rate
          ELSE coalesce(l.labor_amount, nullif(l.values_json ->> 'labor', '')::numeric, 0)
        END
    ), 2) END AS expected_total
  FROM public.maintenance_work_order_lines l
  WHERE l.voided_at IS NULL AND l.line_total IS NOT NULL
)
SELECT '01 old supply rows (component_related_supply)' AS check_name, count(*)::text AS result FROM crs
UNION ALL SELECT '02 old supply: distinct tidy names', count(DISTINCT lower(tidy_name))::text FROM crs WHERE tidy_name <> ''
UNION ALL SELECT '03 old supply: blank names (will be skipped)', count(*)::text FROM crs WHERE tidy_name = ''
UNION ALL SELECT '04 old supply: names over 120 chars (will be skipped)', count(*)::text FROM crs WHERE length(tidy_name) > 120
UNION ALL SELECT '05 old supply: linked to a non-job row (will be skipped)', count(*)::text FROM crs WHERE kind IS DISTINCT FROM 'component'
UNION ALL SELECT '06 old supply: the names', coalesce(string_agg(DISTINCT tidy_name, ' | '), '(none)') FROM crs
UNION ALL SELECT '07 service ledger: duplicate live rows (line + position)', count(*)::text FROM led_dupes
UNION ALL SELECT '08 service ledger: rows with position = empty text', count(*)::text FROM public.maintenance_service_ledger WHERE position = ''
UNION ALL SELECT '09 service records: one record linked from 2+ work orders', count(*)::text FROM rec_from_wo
UNION ALL SELECT '10 service records: 2+ records claiming the same work order by payload', count(*)::text FROM payload_wo_dupes
UNION ALL SELECT '11 service records: total', count(*)::text FROM public.maintenance_records
UNION ALL SELECT '12 service records: no work order found (link or payload)', count(*)::text FROM rec_payload WHERE wo_from_link IS NULL AND wo_from_payload IS NULL
UNION ALL SELECT '13 work orders: completed with no lines', count(*)::text FROM wo_lines WHERE status = 'completed' AND line_count = 0
UNION ALL SELECT '14 work orders: in progress with no lines', count(*)::text FROM wo_lines WHERE status = 'in_progress' AND line_count = 0
UNION ALL SELECT '15 work orders: in progress for over a day', count(*)::text FROM wo_lines WHERE status = 'in_progress' AND opened_at < now() - interval '1 day'
UNION ALL SELECT '16 work orders: by status', coalesce(string_agg(status || ' ' || n, ', ' ORDER BY status), '(none)') FROM (SELECT status, count(*) AS n FROM public.maintenance_work_orders GROUP BY status) s
UNION ALL SELECT '17 catalogue parts with no part type', count(*)::text FROM public.part_master WHERE maintenance_component_id IS NULL
UNION ALL SELECT '18 lines whose saved total differs from the formula', count(*)::text FROM line_math WHERE line_total <> expected_total
UNION ALL SELECT '19 lines checked for 18', count(*)::text FROM line_math
ORDER BY 1;
