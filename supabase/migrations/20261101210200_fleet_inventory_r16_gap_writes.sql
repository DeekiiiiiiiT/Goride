-- R16-03: gap screen write paths (audit Rev 16)

ALTER TABLE fleet.inv_category
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE fleet.inv_bin
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE fleet.inv_vendor
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE fleet.inv_requisition
  ADD COLUMN IF NOT EXISTS needed_by date,
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE fleet.inv_count_session
  ADD COLUMN IF NOT EXISTS assignee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE fleet.inv_scan_device
  ADD COLUMN IF NOT EXISTS pairing_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS fleet.inv_alert_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  alert_type text NOT NULL,
  default_snooze_days integer NOT NULL DEFAULT 7 CHECK (default_snooze_days >= 0),
  notify_roles text[] NOT NULL DEFAULT '{}'::text[],
  can_snooze boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, alert_type)
);

INSERT INTO fleet.inv_alert_rule (organization_id, alert_type, default_snooze_days, notify_roles, can_snooze)
SELECT s.organization_id, t.alert_type, t.default_snooze_days, ARRAY['inventory.approve']::text[], t.can_snooze
FROM fleet.inv_settings s
CROSS JOIN (
  VALUES
    ('ledger_variance', 0, false),
    ('kit_gap', 7, false),
    ('safety_kit', 0, false),
    ('urgent_safety', 0, false),
    ('driver_report', 3, true),
    ('low_stock', 7, true),
    ('reorder', 7, true)
) AS t(alert_type, default_snooze_days, can_snooze)
ON CONFLICT (organization_id, alert_type) DO NOTHING;

DROP VIEW IF EXISTS public.fleet_inv_v_vendor_stats CASCADE;
DROP VIEW IF EXISTS fleet.v_inv_vendor_stats CASCADE;

CREATE VIEW fleet.v_inv_vendor_stats WITH (security_invoker = true) AS
SELECT
  v.organization_id,
  v.id AS vendor_id,
  v.name AS vendor_name,
  count(po.id) FILTER (
    WHERE po.status IS DISTINCT FROM 'closed' AND po.status IS DISTINCT FROM 'cancelled'
  ) AS open_po_count,
  NULL::numeric(4, 2) AS rating_avg,
  NULL::integer AS rating_count,
  COALESCE(po_stats.dispatch_count, 0)::bigint AS dispatch_count,
  COALESCE(po_stats.catalog_sku_count, 0)::bigint AS catalog_sku_count,
  COALESCE(NULLIF(v.tags[1], ''), 'Standard') AS tier_label
FROM fleet.inv_vendor v
LEFT JOIN fleet.inv_purchase_order po
  ON po.vendor_id = v.id AND po.organization_id = v.organization_id
LEFT JOIN (
  SELECT
    po2.organization_id,
    po2.vendor_id,
    count(*) FILTER (
      WHERE po2.status IN ('awaiting_approval', 'ordered', 'part_received', 'received', 'staged')
    ) AS dispatch_count,
    count(DISTINCT pol.item_id) AS catalog_sku_count
  FROM fleet.inv_purchase_order po2
  LEFT JOIN fleet.inv_purchase_order_line pol
    ON pol.po_id = po2.id AND pol.organization_id = po2.organization_id
  GROUP BY po2.organization_id, po2.vendor_id
) po_stats ON po_stats.vendor_id = v.id AND po_stats.organization_id = v.organization_id
GROUP BY v.organization_id, v.id, v.name, v.tags, po_stats.dispatch_count, po_stats.catalog_sku_count;

CREATE OR REPLACE VIEW public.fleet_inv_v_vendor_stats WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_vendor_stats;

REVOKE ALL ON public.fleet_inv_v_vendor_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_vendor_stats TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_settings WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_settings;

CREATE OR REPLACE VIEW public.fleet_inv_category WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_category;

CREATE OR REPLACE VIEW public.fleet_inv_alert_rule WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_alert_rule;

REVOKE ALL ON public.fleet_inv_settings, public.fleet_inv_category, public.fleet_inv_alert_rule
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_category TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_alert_rule TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_bin WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_bin;

CREATE OR REPLACE VIEW public.fleet_inv_purchase_order_line WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_purchase_order_line;

CREATE OR REPLACE VIEW public.fleet_inv_po_cost WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_po_cost;

CREATE OR REPLACE VIEW public.fleet_inv_count_line WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_count_line;

REVOKE ALL ON public.fleet_inv_bin, public.fleet_inv_purchase_order_line, public.fleet_inv_po_cost,
  public.fleet_inv_count_line FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_bin,
  public.fleet_inv_purchase_order_line, public.fleet_inv_po_cost, public.fleet_inv_count_line TO service_role;
