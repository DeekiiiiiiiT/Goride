NDEX IF NOT EXISTS inv_driver_report_client_key_uidx
  ON fleet.inv_driver_report (organization_id, client_key)
  WHERE client_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleet.inv_driver_report_update (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL,
  report_id uuid NOT NULL REFERENCES fleet.inv_driver_report (id) ON DELETE CASCADE,
  by_role text NOT NULL CHECK (by_role IN ('driver', 'fleet')),
  kind text NOT NULL CHECK (kind IN (
    'found_it', 'got_replacement', 'still_missing', 'replacement_en_route',
    'hub_collection_ready', 'urgent_safety_item'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ledger triggers: immutable, hash chain, balance refresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_deny_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'inv_ledger is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_canonical(p_row fleet.inv_ledger)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = fleet, pg_temp
AS $$
  SELECT concat_ws(
    '|',
    p_row.organization_id,
    p_row.movement_id::text,
    p_row.item_id::text,
    p_row.location_id::text,
    COALESCE(p_row.bin_id::text, ''),
    COALESCE(p_row.asset_id::text, ''),
    p_row.qty_delta::text,
    COALESCE(p_row.unit_cost::text, ''),
    p_row.currency,
    p_row.block_no::text
  );
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_hash_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_prev_hash text;
  v_prev_block bigint;
  v_canonical text;
BEGIN
  IF NEW.block_no IS NOT NULL AND NEW.block_no > 0 AND NEW.row_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.row_hash, l.block_no
  INTO v_prev_hash, v_prev_block
  FROM fleet.inv_ledger l
  WHERE l.organization_id = NEW.organization_id
  ORDER BY l.block_no DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    v_prev_hash := repeat('0', 64);
    NEW.block_no := 1;
  ELSE
    NEW.block_no := v_prev_block + 1;
    NEW.prev_hash := v_prev_hash;
  END IF;

  IF NEW.prev_hash IS NULL OR NEW.prev_hash = '' THEN
    NEW.prev_hash := v_prev_hash;
  END IF;

  v_canonical := fleet.inv_ledger_canonical(NEW);
  NEW.row_hash := encode(digest(NEW.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_ledger_refresh_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_line_value numeric(14, 2);
BEGIN
  v_line_value := COALESCE(NEW.unit_cost, 0) * NEW.qty_delta;

  INSERT INTO fleet.inv_balance (
    organization_id, item_id, location_id, bin_id, on_hand, value, updated_at
  )
  VALUES (
    NEW.organization_id, NEW.item_id, NEW.location_id, NEW.bin_id,
    NEW.qty_delta, v_line_value, now()
  )
  ON CONFLICT (organization_id, item_id, location_id, bin_key) DO UPDATE
  SET
    on_hand = fleet.inv_balance.on_hand + EXCLUDED.on_hand,
    value = fleet.inv_balance.value + EXCLUDED.value,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_ledger_immutable ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_immutable
  BEFORE UPDATE OR DELETE ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_deny_ledger_mutation();

DROP TRIGGER IF EXISTS trg_inv_ledger_hash ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_hash
  BEFORE INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_hash_on_insert();

DROP TRIGGER IF EXISTS trg_inv_ledger_balance ON fleet.inv_ledger;
CREATE TRIGGER trg_inv_ledger_balance
  AFTER INSERT ON fleet.inv_ledger
  FOR EACH ROW EXECUTE FUNCTION fleet.inv_ledger_refresh_balance();

-- ---------------------------------------------------------------------------
-- RLS: SELECT via fleet.can_read_org; no authenticated writes
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Storage: inventory-docs (private)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- org_part_stock compatibility (INV-05)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.org_part_stock') IS NOT NULL
     AND to_regclass('public.org_part_stock_legacy') IS NULL THEN
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
GRANT SELECT ON public.org_part_stock TO service_role;
