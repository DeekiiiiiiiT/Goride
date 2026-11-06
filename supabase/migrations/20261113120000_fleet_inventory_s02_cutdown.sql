-- Rev 52 S-02: drop purchasing, counts, telematics, approvals, bins; simplify write-off; asset move RPC.

-- ---------------------------------------------------------------------------
-- Views that reference removed objects
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.org_part_stock;
DROP VIEW IF EXISTS public.fleet_inv_v_vendor_stats;
DROP VIEW IF EXISTS fleet.v_inv_vendor_stats;

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'fleet_inv_purchase_order',
    'fleet_inv_purchase_order_line',
    'fleet_inv_po_cost',
    'fleet_inv_vendor',
    'fleet_inv_requisition',
    'fleet_inv_requisition_line',
    'fleet_inv_count_session',
    'fleet_inv_count_line',
    'fleet_inv_approval',
    'fleet_inv_scan_device',
    'fleet_inv_reorder_policy',
    'fleet_inv_bin',
    'fleet_inv_reservation'
  ]
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RPCs: write-off (no approval gate), adjust (no approval gate), transfer ref
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_write_off(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_asset_id uuid,
  p_qty numeric,
  p_reason text,
  p_memo text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_cost numeric;
  v_disp uuid;
  v_leg uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required for write_off';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_disp := fleet._inv_virtual_location_id(p_org_id, 'V-DISPOSED', 'Disposed (virtual)');
  v_ref := fleet._inv_next_ref(p_org_id, 'WOF-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, memo, idempotency_key
  )
  VALUES (p_org_id, v_ref, 'write_off', 'migration', p_reason, p_memo, p_idempotency_key)
  RETURNING id INTO v_movement_id;

  v_leg := fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, p_asset_id, -p_qty, NULL
  );
  SELECT unit_cost INTO v_cost FROM fleet.inv_ledger WHERE id = v_leg;
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, v_disp, NULL, p_asset_id, p_qty, v_cost
  );

  IF p_asset_id IS NOT NULL THEN
    UPDATE fleet.inv_asset
    SET status = 'disposed', updated_at = now()
    WHERE organization_id = p_org_id AND id = p_asset_id;
    INSERT INTO fleet.inv_asset_event (organization_id, asset_id, type, title, body)
    VALUES (
      p_org_id,
      p_asset_id,
      'write_off',
      'Written off',
      COALESCE(p_memo, p_reason)
    );
  END IF;

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_adjust(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_bin_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required for adjust';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'ADJ-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, idempotency_key
  )
  VALUES (p_org_id, v_ref, 'adjust', 'adjust', p_reason, p_idempotency_key)
  RETURNING id INTO v_movement_id;

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, NULL,
    p_qty_delta, p_unit_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_transfer(
  p_org_id text,
  p_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_bin_from uuid,
  p_bin_to uuid,
  p_qty numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_cost numeric;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'TRF-');
  INSERT INTO fleet.inv_movement (organization_id, ref_no, type, reference_type, idempotency_key)
  VALUES (p_org_id, v_ref, 'transfer', 'transfer', p_idempotency_key)
  RETURNING id INTO v_movement_id;

  v_cost := fleet._inv_consume_fifo_layers(p_org_id, p_item_id, p_from_location_id, p_qty);

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_from_location_id, NULL, NULL, -p_qty, v_cost
  );
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_to_location_id, NULL, NULL, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_asset_move_vehicle(
  p_org_id text,
  p_asset_id uuid,
  p_to_vehicle_id text,
  p_from_vehicle_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_driver_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_asset record;
  v_from_loc uuid;
  v_to_loc uuid;
  v_from_plate text;
  v_to_plate text;
  v_on_hand numeric;
  v_xfer jsonb;
  v_title text;
  v_body text;
BEGIN
  SELECT a.* INTO v_asset
  FROM fleet.inv_asset a
  WHERE a.organization_id = p_org_id AND a.id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset not found';
  END IF;

  SELECT l.id, v.license_plate INTO v_from_loc, v_from_plate
  FROM fleet.inv_location l
  LEFT JOIN fleet.vehicles v ON v.id = l.vehicle_id
  WHERE l.organization_id = p_org_id AND l.id = v_asset.location_id;

  IF p_from_vehicle_id IS NOT NULL THEN
    SELECT l.id, v.license_plate INTO v_from_loc, v_from_plate
    FROM fleet.inv_location l
    JOIN fleet.vehicles v ON v.id = l.vehicle_id
    WHERE l.organization_id = p_org_id AND l.vehicle_id = p_from_vehicle_id
    LIMIT 1;
  END IF;

  SELECT l.id, v.license_plate INTO v_to_loc, v_to_plate
  FROM fleet.inv_location l
  JOIN fleet.vehicles v ON v.id = l.vehicle_id
  WHERE l.organization_id = p_org_id AND l.vehicle_id = p_to_vehicle_id
  LIMIT 1;

  IF v_to_loc IS NULL THEN
    RAISE EXCEPTION 'destination vehicle has no inventory location';
  END IF;

  IF v_from_loc IS NOT NULL AND v_from_loc <> v_to_loc THEN
    SELECT COALESCE(sum(b.on_hand), 0) INTO v_on_hand
    FROM fleet.inv_balance b
    WHERE b.organization_id = p_org_id
      AND b.item_id = v_asset.item_id
      AND b.location_id = v_from_loc;

    IF v_on_hand >= 1 THEN
      v_xfer := fleet.inv_transfer(
        p_org_id,
        v_asset.item_id,
        v_from_loc,
        v_to_loc,
        NULL,
        NULL,
        1,
        p_idempotency_key
      );
    END IF;
  END IF;

  UPDATE fleet.inv_asset
  SET location_id = v_to_loc,
      status = 'installed',
      installed_at = COALESCE(installed_at, now()),
      updated_at = now()
  WHERE organization_id = p_org_id AND id = p_asset_id;

  v_title := format(
    'Moved from %s to %s',
    COALESCE(v_from_plate, 'store'),
    COALESCE(v_to_plate, p_to_vehicle_id)
  );
  v_body := trim(both FROM concat_ws(' · ',
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    CASE WHEN p_driver_id IS NOT NULL AND btrim(p_driver_id) <> '' THEN 'Driver ' || p_driver_id ELSE NULL END
  ));

  INSERT INTO fleet.inv_asset_event (
    organization_id, asset_id, vehicle_id, type, title, body
  )
  VALUES (
    p_org_id,
    p_asset_id,
    p_to_vehicle_id,
    'move',
    v_title,
    NULLIF(v_body, '')
  );

  RETURN jsonb_build_object(
    'asset_id', p_asset_id,
    'to_vehicle_id', p_to_vehicle_id,
    'transfer', v_xfer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_inv_asset_move_vehicle(
  p_org_id text,
  p_asset_id uuid,
  p_to_vehicle_id text,
  p_from_vehicle_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_driver_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
  SELECT fleet.inv_asset_move_vehicle(
    p_org_id, p_asset_id, p_to_vehicle_id, p_from_vehicle_id, p_note, p_driver_id, p_idempotency_key
  );
$$;

REVOKE ALL ON FUNCTION fleet.inv_asset_move_vehicle(text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fleet.inv_asset_move_vehicle(text, uuid, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fleet_inv_asset_move_vehicle(text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_inv_asset_move_vehicle(text, uuid, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Column drops (telemetry, insurance, bins on assets)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.fleet_inv_asset CASCADE;
DROP VIEW IF EXISTS public.fleet_inv_asset_event CASCADE;
DROP VIEW IF EXISTS public.fleet_inv_ledger CASCADE;
DROP VIEW IF EXISTS public.fleet_inv_balance CASCADE;
DROP VIEW IF EXISTS public.fleet_inv_movement CASCADE;

ALTER TABLE fleet.inv_asset_event
  DROP COLUMN IF EXISTS gps_lat,
  DROP COLUMN IF EXISTS gps_lng,
  DROP COLUMN IF EXISTS obd_snapshot;

ALTER TABLE fleet.inv_asset
  DROP COLUMN IF EXISTS imei,
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS external_device_id,
  DROP COLUMN IF EXISTS firmware_version,
  DROP COLUMN IF EXISTS last_heartbeat_at,
  DROP COLUMN IF EXISTS device_health,
  DROP COLUMN IF EXISTS insurance_policy_ref,
  DROP COLUMN IF EXISTS insurer_name,
  DROP COLUMN IF EXISTS warranty_ends_on,
  DROP COLUMN IF EXISTS bin_id;

UPDATE fleet.inv_ledger SET bin_id = NULL WHERE bin_id IS NOT NULL;
UPDATE fleet.inv_balance SET bin_id = NULL WHERE bin_id IS NOT NULL;

ALTER TABLE fleet.inv_ledger DROP CONSTRAINT IF EXISTS inv_ledger_bin_id_fkey;

ALTER TABLE fleet.inv_movement DROP COLUMN IF EXISTS approval_id;

CREATE OR REPLACE VIEW public.fleet_inv_asset
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_asset;
REVOKE ALL ON public.fleet_inv_asset FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_asset TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_asset_event
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_asset_event;
REVOKE ALL ON public.fleet_inv_asset_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_asset_event TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_ledger
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_ledger;
REVOKE ALL ON public.fleet_inv_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_ledger TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_balance
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_balance;
REVOKE ALL ON public.fleet_inv_balance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_balance TO service_role;

CREATE OR REPLACE VIEW public.fleet_inv_movement
WITH (security_invoker = true) AS SELECT * FROM fleet.inv_movement;
REVOKE ALL ON public.fleet_inv_movement FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_movement TO service_role;

-- ---------------------------------------------------------------------------
-- Drop removed tables (empty on live)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS fleet.inv_count_line CASCADE;
DROP TABLE IF EXISTS fleet.inv_count_session CASCADE;
DROP TABLE IF EXISTS fleet.inv_po_cost CASCADE;
DROP TABLE IF EXISTS fleet.inv_purchase_order_line CASCADE;
DROP TABLE IF EXISTS fleet.inv_purchase_order CASCADE;
DROP TABLE IF EXISTS fleet.inv_requisition_line CASCADE;
DROP TABLE IF EXISTS fleet.inv_requisition CASCADE;
DROP TABLE IF EXISTS fleet.inv_approval CASCADE;
DROP TABLE IF EXISTS fleet.inv_asset_diagnostic CASCADE;
DROP TABLE IF EXISTS fleet.inv_scan_device CASCADE;
DROP TABLE IF EXISTS fleet.inv_reservation CASCADE;

-- Item-level reorder (replaces inv_reorder_policy for Find parts bridge)
ALTER TABLE fleet.inv_item
  ADD COLUMN IF NOT EXISTS reorder_qty numeric(14, 3) NOT NULL DEFAULT 0;

UPDATE fleet.inv_item i
SET reorder_qty = COALESCE(sub.max_rp, 0),
    updated_at = now()
FROM (
  SELECT organization_id, item_id, max(reorder_point) AS max_rp
  FROM fleet.inv_reorder_policy
  GROUP BY organization_id, item_id
) sub
WHERE i.organization_id = sub.organization_id AND i.id = sub.item_id;

DROP VIEW IF EXISTS public.fleet_inv_v_stock_kpis CASCADE;
DROP VIEW IF EXISTS public.fleet_inv_v_stock CASCADE;
DROP VIEW IF EXISTS fleet.v_inv_stock_kpis CASCADE;
DROP VIEW IF EXISTS fleet.v_inv_stock CASCADE;

CREATE OR REPLACE VIEW fleet.v_inv_stock WITH (security_invoker = true) AS
SELECT b.organization_id, i.id AS item_id, i.sku, i.short_code, i.name, i.tracking,
  l.id AS location_id, l.code AS location_code, l.name AS location_name,
  sum(b.on_hand) AS on_hand, sum(b.reserved) AS reserved, sum(b.value) AS stock_value,
  CASE WHEN sum(b.on_hand) <= 0 THEN 'out'
       WHEN sum(b.on_hand) <= COALESCE(max(i.reorder_qty), 0) THEN 'low'
       ELSE 'ok' END AS stock_status
FROM fleet.inv_balance b
JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
WHERE i.archived_at IS NULL
GROUP BY b.organization_id, i.id, i.sku, i.short_code, i.name, i.tracking, l.id, l.code, l.name;

CREATE OR REPLACE VIEW fleet.v_inv_stock_kpis WITH (security_invoker = true) AS
SELECT s.organization_id,
  count(DISTINCT s.location_id) FILTER (WHERE s.on_hand > 0) AS active_depots,
  count(*) FILTER (WHERE s.stock_status IN ('low', 'out')) AS replenishment_triggers,
  (SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE NOT c.ok) / NULLIF(count(*), 0), 2), 0)
   FROM fleet.inv_chain_check c WHERE c.organization_id = s.organization_id AND c.checked_at >= now() - interval '7 days') AS ledger_drift_pct,
  (SELECT jsonb_build_object('checked_at', c.checked_at, 'ok', c.ok, 'entries', c.entries)
   FROM fleet.inv_chain_check c WHERE c.organization_id = s.organization_id ORDER BY c.checked_at DESC LIMIT 1) AS last_chain_check
FROM fleet.v_inv_stock s GROUP BY s.organization_id;

CREATE OR REPLACE VIEW public.fleet_inv_v_stock
WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_stock;
CREATE OR REPLACE VIEW public.fleet_inv_v_stock_kpis
WITH (security_invoker = true) AS SELECT * FROM fleet.v_inv_stock_kpis;
REVOKE ALL ON public.fleet_inv_v_stock, public.fleet_inv_v_stock_kpis FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_stock, public.fleet_inv_v_stock_kpis TO service_role;

DROP TABLE IF EXISTS fleet.inv_reorder_policy CASCADE;
DROP TABLE IF EXISTS fleet.inv_vendor CASCADE;
DROP TABLE IF EXISTS fleet.inv_bin CASCADE;

DROP FUNCTION IF EXISTS fleet.inv_recompute_reorder(text);
DROP FUNCTION IF EXISTS public.fleet_inv_recompute_reorder(text);
DROP FUNCTION IF EXISTS fleet.inv_pair_scanner(text, text, text);
DROP FUNCTION IF EXISTS public.fleet_inv_pair_scanner(text, text, text);
DROP FUNCTION IF EXISTS fleet.inv_reserve(text, uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS fleet.inv_release(text, uuid, text);

-- ---------------------------------------------------------------------------
-- Slim org_part_stock (Find parts bridge)
-- ---------------------------------------------------------------------------
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
  s.reorder_point,
  s.updated_at,
  NULL::text AS batch_note,
  NULL::text AS bin
FROM (
  SELECT
    b.organization_id,
    i.part_master_id AS part_id,
    i.universal_part_id,
    l.code AS location,
    sum(b.on_hand) AS qty,
    max(b.updated_at) AS updated_at,
    max(i.reorder_qty) AS reorder_point
  FROM fleet.inv_balance b
  JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
  JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
  WHERE i.part_master_id IS NOT NULL OR i.universal_part_id IS NOT NULL
  GROUP BY b.organization_id, i.part_master_id, i.universal_part_id, l.code
) s
CROSS JOIN LATERAL (
  SELECT md5(
    s.organization_id || '|' ||
    COALESCE(s.part_id::text, '') || '|' ||
    COALESCE(s.universal_part_id::text, '') || '|' ||
    COALESCE(s.location, '')
  ) AS h
) d;

COMMENT ON VIEW public.org_part_stock IS
  'Compatibility view over fleet.inv_balance for Find parts (Rev 52 — no bins/reorder policy table).';

REVOKE ALL ON public.org_part_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.org_part_stock TO service_role;

-- ---------------------------------------------------------------------------
-- Phase 4–8 feature flags removed (everything that stays is on)
-- ---------------------------------------------------------------------------
DELETE FROM public.platform_feature_flags
WHERE name IN (
  'fleet_inventory_phase4_assets',
  'fleet_inventory_phase5_maintenance',
  'fleet_inventory_phase6_purchasing',
  'fleet_inventory_phase7_counts',
  'fleet_inventory_phase8_telematics'
);
