
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'inv_settings', 'inv_category', 'inv_item', 'inv_location', 'inv_bin', 'inv_vendor',
    'inv_reorder_policy', 'inv_scan_device', 'inv_movement', 'inv_ledger', 'inv_chain_check',
    'inv_cost_layer', 'inv_balance', 'inv_reservation', 'inv_receipt', 'inv_purchase_order',
    'inv_purchase_order_line', 'inv_po_cost', 'inv_requisition', 'inv_requisition_line',
    'inv_asset', 'inv_asset_event', 'inv_asset_diagnostic', 'inv_document',
    'kit_template', 'kit_template_version', 'kit_template_line', 'vehicle_kit',
    'inv_kit_compliance_daily', 'inv_count_session', 'inv_count_line', 'inv_alert',
    'inv_approval', 'inv_audit_log', 'inv_driver_report', 'inv_driver_report_update'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE fleet.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON fleet.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON fleet.%I FOR SELECT TO authenticated USING (fleet.can_read_org(organization_id))',
      t || '_select', t
    );
    EXECUTE format('REVOKE ALL ON fleet.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON fleet.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON fleet.%I TO service_role', t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-docs',
  'inventory-docs',
  false,
  20971520,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.org_part_stock') IS NOT NULL
     AND to_regclass('public.org_part_stock_legacy') IS NULL
     AND to_regclass('public.org_part_stock')::regclass::oid IN (
       SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
     ) THEN
    ALTER TABLE public.org_part_stock RENAME TO org_part_stock_legacy;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.org_part_stock
WITH (security_invoker = true)
AS
SELECT
  (
    substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4) || '-' ||
    substr(h, 17, 4) || '-' || substr(h, 21, 12)
  )::uuid AS id,
  s.organization_id,
  s.part_id,
  s.universal_part_id,
  s.qty,
  s.location,
  rp.reorder_point,
  s.updated_at,
  NULL::text AS batch_note,
  s.bin
FROM (
  SELECT
    b.organization_id,
    i.part_master_id AS part_id,
    i.universal_part_id,
    l.code AS location,
    max(b.bin_id::text) AS bin_id_text,
    sum(b.on_hand) AS qty,
    max(b.updated_at) AS updated_at,
    max(bin.code) AS bin
  FROM fleet.inv_balance b
  JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
  JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
  LEFT JOIN fleet.inv_bin bin ON bin.id = b.bin_id
  WHERE i.part_master_id IS NOT NULL OR i.universal_part_id IS NOT NULL
  GROUP BY b.organization_id, i.part_master_id, i.universal_part_id, l.code
) s
LEFT JOIN LATERAL (
  SELECT p.reorder_point
  FROM fleet.inv_reorder_policy p
  JOIN fleet.inv_item ii ON ii.id = p.item_id
  JOIN fleet.inv_location ll ON ll.id = p.location_id
  WHERE p.organization_id = s.organization_id
    AND ii.part_master_id IS NOT DISTINCT FROM s.part_id
    AND ii.universal_part_id IS NOT DISTINCT FROM s.universal_part_id
    AND ll.code = s.location
  LIMIT 1
) rp ON true
CROSS JOIN LATERAL (
  SELECT md5(
    s.organization_id || '|' ||
    COALESCE(s.part_id::text, '') || '|' ||
    COALESCE(s.universal_part_id::text, '') || '|' ||
    COALESCE(s.location, '')
  ) AS h
) d;

COMMENT ON VIEW public.org_part_stock IS
  'Compatibility view over fleet.inv_balance for Find parts / parts_enterprise readers (INV-05).';

REVOKE ALL ON public.org_part_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_part_stock TO service_role;;
