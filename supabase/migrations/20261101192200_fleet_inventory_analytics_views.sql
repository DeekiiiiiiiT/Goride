-- R6-09: Inventory analytics views + public bridge extensions.

CREATE OR REPLACE VIEW fleet.v_inv_kit_reserve
WITH (security_invoker = true) AS
SELECT
  b.organization_id,
  b.item_id,
  i.name AS item_name,
  b.location_id,
  b.on_hand,
  b.reserved,
  GREATEST(b.on_hand - b.reserved, 0) AS available
FROM fleet.inv_balance b
JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
WHERE b.reserved > 0;

CREATE OR REPLACE VIEW fleet.v_inv_where_used
WITH (security_invoker = true) AS
SELECT
  b.organization_id,
  b.item_id,
  i.name AS item_name,
  l.id AS location_id,
  l.code AS location_code,
  l.name AS location_name,
  l.kind AS location_kind,
  l.vehicle_id,
  sum(b.on_hand) AS on_hand
FROM fleet.inv_balance b
JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
WHERE b.on_hand <> 0
GROUP BY b.organization_id, b.item_id, i.name, l.id, l.code, l.name, l.kind, l.vehicle_id;

CREATE OR REPLACE VIEW fleet.v_inv_reorder_suggestions
WITH (security_invoker = true) AS
SELECT
  rp.organization_id,
  rp.item_id,
  i.name AS item_name,
  rp.location_id,
  l.code AS location_code,
  rp.reorder_point,
  coalesce(sum(b.on_hand), 0) AS on_hand,
  GREATEST(rp.reorder_point - coalesce(sum(b.on_hand), 0), 0) AS suggested_order_qty
FROM fleet.inv_reorder_policy rp
JOIN fleet.inv_item i ON i.id = rp.item_id AND i.organization_id = rp.organization_id
JOIN fleet.inv_location l ON l.id = rp.location_id AND l.organization_id = rp.organization_id
LEFT JOIN fleet.inv_balance b
  ON b.organization_id = rp.organization_id
 AND b.item_id = rp.item_id
 AND b.location_id = rp.location_id
GROUP BY rp.organization_id, rp.item_id, i.name, rp.location_id, l.code, rp.reorder_point
HAVING coalesce(sum(b.on_hand), 0) <= rp.reorder_point;

CREATE OR REPLACE VIEW fleet.v_inv_vendor_stats
WITH (security_invoker = true) AS
SELECT
  v.organization_id,
  v.id AS vendor_id,
  v.name AS vendor_name,
  count(po.id) AS open_po_count
FROM fleet.inv_vendor v
LEFT JOIN fleet.inv_purchase_order po
  ON po.vendor_id = v.id AND po.organization_id = v.organization_id AND po.status NOT IN ('closed', 'cancelled')
GROUP BY v.organization_id, v.id, v.name;

CREATE OR REPLACE VIEW fleet.v_inv_count_accuracy
WITH (security_invoker = true) AS
SELECT
  cs.organization_id,
  cs.id AS count_session_id,
  cs.code AS count_code,
  count(cl.id) FILTER (WHERE cl.line_status = 'exact') AS matched_lines,
  count(cl.id) FILTER (WHERE cl.line_status <> 'exact') AS exception_lines,
  count(cl.id) AS total_lines
FROM fleet.inv_count_session cs
LEFT JOIN fleet.inv_count_line cl ON cl.session_id = cs.id AND cl.organization_id = cs.organization_id
GROUP BY cs.organization_id, cs.id, cs.code;

CREATE OR REPLACE VIEW fleet.v_inv_procurement_mtd
WITH (security_invoker = true) AS
SELECT
  po.organization_id,
  date_trunc('month', po.created_at)::date AS month_start,
  count(*) AS po_count
FROM fleet.inv_purchase_order po
WHERE po.created_at >= date_trunc('month', now())
GROUP BY po.organization_id, date_trunc('month', po.created_at)::date;

CREATE OR REPLACE VIEW fleet.v_inv_report_sla
WITH (security_invoker = true) AS
SELECT
  a.organization_id,
  a.type,
  count(*) FILTER (WHERE a.status = 'open') AS open_count,
  count(*) FILTER (WHERE a.status = 'open' AND a.created_at < now() - interval '48 hours') AS overdue_open
FROM fleet.inv_alert a
GROUP BY a.organization_id, a.type;

CREATE OR REPLACE VIEW fleet.v_inv_asset_kpis
WITH (security_invoker = true) AS
SELECT
  ast.organization_id,
  count(*) AS asset_count,
  count(*) FILTER (WHERE ast.status = 'in_service') AS in_service,
  count(*) FILTER (WHERE ast.status = 'missing') AS missing,
  count(*) FILTER (WHERE ast.status = 'retired') AS retired
FROM fleet.inv_asset ast
GROUP BY ast.organization_id;

GRANT SELECT ON fleet.v_inv_kit_reserve, fleet.v_inv_where_used, fleet.v_inv_reorder_suggestions,
  fleet.v_inv_vendor_stats, fleet.v_inv_count_accuracy, fleet.v_inv_procurement_mtd,
  fleet.v_inv_report_sla, fleet.v_inv_asset_kpis
  TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_v_kit_reserve WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_kit_reserve;
CREATE OR REPLACE VIEW public.fleet_inv_v_where_used WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_where_used;
CREATE OR REPLACE VIEW public.fleet_inv_v_reorder_suggestions WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_reorder_suggestions;
CREATE OR REPLACE VIEW public.fleet_inv_v_vendor_stats WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_vendor_stats;
CREATE OR REPLACE VIEW public.fleet_inv_v_count_accuracy WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_count_accuracy;
CREATE OR REPLACE VIEW public.fleet_inv_v_procurement_mtd WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_procurement_mtd;
CREATE OR REPLACE VIEW public.fleet_inv_v_report_sla WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_report_sla;
CREATE OR REPLACE VIEW public.fleet_inv_v_asset_kpis WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_asset_kpis;

REVOKE ALL ON public.fleet_inv_v_kit_reserve, public.fleet_inv_v_where_used, public.fleet_inv_v_reorder_suggestions,
  public.fleet_inv_v_vendor_stats, public.fleet_inv_v_count_accuracy, public.fleet_inv_v_procurement_mtd,
  public.fleet_inv_v_report_sla, public.fleet_inv_v_asset_kpis
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_kit_reserve, public.fleet_inv_v_where_used, public.fleet_inv_v_reorder_suggestions,
  public.fleet_inv_v_vendor_stats, public.fleet_inv_v_count_accuracy, public.fleet_inv_v_procurement_mtd,
  public.fleet_inv_v_report_sla, public.fleet_inv_v_asset_kpis
  TO service_role;
