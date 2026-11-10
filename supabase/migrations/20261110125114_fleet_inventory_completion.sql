-- Fleet Inventory completion audit (docs/fleet-inventory-completion-audit.md)
-- IV-01 fuel card / toll tag lines are really checked
-- IV-02 store needs (low or out against what the cars need)
-- IV-03 single-unit (asset) value
-- IV-04 required flag exposed; optional lines never block
-- IV-06 nightly job writes inv_kit_compliance_daily
-- IV-16 drop unused inv_settings columns

-- ── IV-01 / IV-04: kit compliance ─────────────────────────────────────────
-- New columns are appended after road_clear so CREATE OR REPLACE keeps the old order.
CREATE OR REPLACE VIEW fleet.v_inv_kit_compliance
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    vk.organization_id,
    vk.vehicle_id,
    v.license_plate,
    kt.code AS kit_code,
    ktl.id AS kit_line_id,
    ktl.item_id,
    ktl.qty_required,
    ktl.blocks_road_clearance,
    ktl.line_type,
    CASE
      WHEN ktl.line_type = 'linked_toll_tag' THEN
        CASE WHEN EXISTS (
          SELECT 1 FROM fleet.toll_tags tt
          WHERE tt.organization_id = vk.organization_id
            AND tt.vehicle_id = vk.vehicle_id
        ) THEN 'ok' ELSE 'missing' END
      WHEN ktl.line_type = 'linked_fuel_card' THEN
        CASE WHEN EXISTS (
          SELECT 1 FROM fleet.fuel_cards fc
          WHERE fc.organization_id = vk.organization_id
            AND COALESCE(fc.payload_json->>'status', '') = 'Active'
            AND (
              fc.payload_json->>'assignedVehicleId' = vk.vehicle_id
              OR (
                v.current_driver_id IS NOT NULL
                AND fc.payload_json->>'assignedDriverId' = v.current_driver_id::text
              )
            )
        ) THEN 'ok' ELSE 'missing' END
      WHEN ktl.item_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM fleet.inv_asset a
        JOIN fleet.inv_location vl2
          ON vl2.id = a.location_id AND vl2.organization_id = a.organization_id
        WHERE a.organization_id = vk.organization_id
          AND a.item_id = ktl.item_id
          AND a.status = 'installed'
          AND vl2.vehicle_id = vk.vehicle_id
      ) THEN 'ok'
      WHEN COALESCE(b.on_hand, 0) >= ktl.qty_required THEN 'ok'
      WHEN COALESCE(b.on_hand, 0) > 0 THEN 'short'
      ELSE 'missing'
    END AS line_status,
    ktl.required,
    ktl.sort_order,
    i.name AS item_name,
    COALESCE(
      i.name,
      CASE ktl.line_type
        WHEN 'linked_fuel_card' THEN 'Fuel card'
        WHEN 'linked_toll_tag' THEN 'Toll tag'
      END
    ) AS line_label,
    COALESCE(b.on_hand, 0) AS on_hand_in_car,
    ktv.version AS kit_version,
    CASE WHEN ktl.line_type = 'linked_toll_tag' THEN (
      SELECT tt.tag_number FROM fleet.toll_tags tt
      WHERE tt.organization_id = vk.organization_id AND tt.vehicle_id = vk.vehicle_id
      ORDER BY tt.tag_number LIMIT 1
    ) END AS toll_tag_number,
    vk.last_inspected_at
  FROM fleet.vehicle_kit vk
  JOIN fleet.vehicles v ON v.id = vk.vehicle_id
  JOIN fleet.kit_template kt ON kt.id = vk.template_id
  JOIN fleet.kit_template_version ktv ON ktv.id = vk.version_id
  JOIN fleet.kit_template_line ktl ON ktl.version_id = ktv.id
  LEFT JOIN fleet.inv_item i
    ON i.id = ktl.item_id AND i.organization_id = ktl.organization_id
  LEFT JOIN fleet.inv_location vl
    ON vl.organization_id = vk.organization_id AND vl.vehicle_id = vk.vehicle_id
  LEFT JOIN fleet.inv_balance b
    ON b.organization_id = vk.organization_id
   AND b.item_id = ktl.item_id
   AND b.location_id = vl.id
)
SELECT
  b.organization_id,
  b.vehicle_id,
  b.license_plate,
  b.kit_code,
  b.kit_line_id,
  b.item_id,
  b.qty_required,
  b.blocks_road_clearance,
  b.line_type,
  b.line_status,
  NOT EXISTS (
    SELECT 1
    FROM base b2
    WHERE b2.organization_id = b.organization_id
      AND b2.vehicle_id = b.vehicle_id
      AND b2.required
      AND b2.blocks_road_clearance
      AND b2.line_status IN ('missing', 'short')
  ) AS road_clear,
  b.required,
  b.sort_order,
  b.item_name,
  b.line_label,
  b.on_hand_in_car,
  b.kit_version,
  b.toll_tag_number,
  b.last_inspected_at
FROM base b;

CREATE OR REPLACE VIEW public.fleet_inv_v_kit_compliance
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_kit_compliance;

REVOKE ALL ON public.fleet_inv_v_kit_compliance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_kit_compliance TO service_role;

-- ── IV-02: store needs ────────────────────────────────────────────────────
-- One row per kit item. Needed = cars whose required line is missing/short.
-- Store = all active warehouse locations; no balance row counts as 0.
CREATE OR REPLACE VIEW fleet.v_inv_store_needs
WITH (security_invoker = true) AS
WITH kit_items AS (
  SELECT
    kc.organization_id,
    kc.item_id,
    count(DISTINCT kc.vehicle_id) FILTER (
      WHERE kc.required AND kc.line_status IN ('missing', 'short')
    ) AS cars_needing,
    COALESCE(sum(GREATEST(kc.qty_required - kc.on_hand_in_car, 0)) FILTER (
      WHERE kc.required AND kc.line_status IN ('missing', 'short')
    ), 0) AS qty_needed
  FROM fleet.v_inv_kit_compliance kc
  WHERE kc.item_id IS NOT NULL
  GROUP BY kc.organization_id, kc.item_id
),
store AS (
  SELECT b.organization_id, b.item_id, sum(b.on_hand) AS on_hand
  FROM fleet.inv_balance b
  JOIN fleet.inv_location l
    ON l.id = b.location_id AND l.organization_id = b.organization_id
  WHERE l.kind = 'warehouse' AND l.is_active
  GROUP BY b.organization_id, b.item_id
)
SELECT
  k.organization_id,
  k.item_id,
  i.sku,
  i.name,
  COALESCE(s.on_hand, 0) AS store_on_hand,
  k.cars_needing,
  k.qty_needed AS needed,
  CASE
    WHEN k.qty_needed > 0 AND COALESCE(s.on_hand, 0) <= 0 THEN 'out'
    WHEN k.qty_needed > 0 AND COALESCE(s.on_hand, 0) < k.qty_needed THEN 'low'
    ELSE 'ok'
  END AS need_status
FROM kit_items k
JOIN fleet.inv_item i ON i.id = k.item_id AND i.organization_id = k.organization_id
LEFT JOIN store s ON s.organization_id = k.organization_id AND s.item_id = k.item_id
WHERE i.archived_at IS NULL;

CREATE OR REPLACE VIEW public.fleet_inv_v_store_needs
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_store_needs;

REVOKE ALL ON public.fleet_inv_v_store_needs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_store_needs TO service_role;

-- ── IV-03: single-unit value ──────────────────────────────────────────────
-- Units still owned (not lost/retired/disposed). A unit whose item already has
-- quantity at the same location is skipped so it is never counted twice.
CREATE OR REPLACE VIEW fleet.v_inv_asset_value
WITH (security_invoker = true) AS
SELECT
  a.organization_id,
  COALESCE(sum(a.purchase_cost) FILTER (WHERE l.kind = 'vehicle'), 0) AS on_cars_value,
  COALESCE(sum(a.purchase_cost) FILTER (WHERE l.kind IS DISTINCT FROM 'vehicle'), 0) AS in_store_value,
  COALESCE(sum(a.purchase_cost), 0) AS total_value,
  count(*) AS units,
  count(*) FILTER (WHERE NULLIF(btrim(COALESCE(a.serial_number, '')), '') IS NULL) AS units_without_serial,
  min(a.next_inspection_due) AS next_check_due
FROM fleet.inv_asset a
LEFT JOIN fleet.inv_location l
  ON l.id = a.location_id AND l.organization_id = a.organization_id
WHERE a.status IN ('in_store', 'installed', 'in_repair', 'faulty')
  AND NOT EXISTS (
    SELECT 1 FROM fleet.inv_balance b
    WHERE b.organization_id = a.organization_id
      AND b.item_id = a.item_id
      AND b.location_id = a.location_id
      AND b.on_hand > 0
  )
GROUP BY a.organization_id;

CREATE OR REPLACE VIEW public.fleet_inv_v_asset_value
WITH (security_invoker = true) AS
SELECT * FROM fleet.v_inv_asset_value;

REVOKE ALL ON public.fleet_inv_v_asset_value FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_inv_v_asset_value TO service_role;

-- ── IV-06: nightly job also writes the daily kit snapshot ─────────────────
CREATE OR REPLACE FUNCTION fleet.inv_nightly_integrity(p_org_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'fleet', 'public'
AS $function$
DECLARE
  v_org text;
  v_check jsonb;
  v_bad bigint;
  v_layer_bad bigint;
  v_day date := (now() AT TIME ZONE 'America/Jamaica')::date;
BEGIN
  FOR v_org IN
    SELECT DISTINCT b.organization_id
    FROM fleet.inv_balance b
    WHERE p_org_id IS NULL OR b.organization_id = p_org_id
  LOOP
    v_check := fleet.inv_verify_chain(v_org);
    SELECT count(*) INTO v_bad
    FROM (
      SELECT b.organization_id, b.item_id, b.location_id, b.bin_key, b.on_hand AS bal_on_hand,
        COALESCE((
          SELECT sum(l.qty_delta)
          FROM fleet.inv_ledger l
          WHERE l.organization_id = b.organization_id
            AND l.item_id = b.item_id
            AND l.location_id = b.location_id
            AND COALESCE(l.bin_id, '00000000-0000-0000-0000-000000000000'::uuid) = b.bin_key
        ), 0) AS ledger_sum
      FROM fleet.inv_balance b
      WHERE b.organization_id = v_org
    ) x
    WHERE x.bal_on_hand IS DISTINCT FROM x.ledger_sum;

    SELECT count(*) INTO v_layer_bad
    FROM (
      SELECT b.organization_id, b.item_id, b.location_id,
        b.on_hand,
        COALESCE((
          SELECT sum(cl.qty_remaining)
          FROM fleet.inv_cost_layer cl
          WHERE cl.organization_id = b.organization_id
            AND cl.item_id = b.item_id
            AND cl.location_id = b.location_id
        ), 0) AS layer_qty
      FROM fleet.inv_balance b
      WHERE b.organization_id = v_org
    ) y
    WHERE y.on_hand IS DISTINCT FROM y.layer_qty;

    IF v_bad > 0 OR v_layer_bad > 0 OR NOT COALESCE((v_check->>'ok')::boolean, false) THEN
      INSERT INTO fleet.inv_alert (
        organization_id, type, chip_label, severity, title, body, status
      )
      VALUES (
        v_org, 'ledger_variance', 'LEDGER VARIANCE', 'critical',
        'Inventory integrity check failed',
        format(
          'balance_drift_rows=%s layer_drift_rows=%s chain_ok=%s',
          v_bad, v_layer_bad, v_check->>'ok'
        ),
        'open'
      );
    END IF;
  END LOOP;

  -- Daily kit snapshot: one row per org that has cars on a kit (required lines only).
  INSERT INTO fleet.inv_kit_compliance_daily (
    organization_id, snapshot_date, vehicles, vehicles_complete, lines_required, lines_present
  )
  SELECT
    c.organization_id,
    v_day,
    count(DISTINCT c.vehicle_id)::int,
    (count(DISTINCT c.vehicle_id) - count(DISTINCT c.vehicle_id) FILTER (WHERE c.line_status <> 'ok'))::int,
    count(*)::int,
    count(*) FILTER (WHERE c.line_status = 'ok')::int
  FROM fleet.v_inv_kit_compliance c
  WHERE c.required
    AND (p_org_id IS NULL OR c.organization_id = p_org_id)
  GROUP BY c.organization_id
  ON CONFLICT (organization_id, snapshot_date) DO UPDATE
    SET vehicles = EXCLUDED.vehicles,
        vehicles_complete = EXCLUDED.vehicles_complete,
        lines_required = EXCLUDED.lines_required,
        lines_present = EXCLUDED.lines_present;

  RETURN gen_random_uuid();
END;
$function$;

REVOKE ALL ON FUNCTION fleet.inv_nightly_integrity(text) FROM PUBLIC, anon, authenticated;

-- ── IV-16: drop unused settings columns ───────────────────────────────────
DROP VIEW IF EXISTS public.fleet_inv_settings;

ALTER TABLE fleet.inv_settings
  DROP COLUMN IF EXISTS fiscal_year_start_month,
  DROP COLUMN IF EXISTS scrap_note,
  DROP COLUMN IF EXISTS write_off_rule_code,
  DROP COLUMN IF EXISTS monthly_procurement_cap_jmd,
  DROP COLUMN IF EXISTS approval_threshold_jmd,
  DROP COLUMN IF EXISTS approval_rule_code,
  DROP COLUMN IF EXISTS approval_rule_name;

CREATE OR REPLACE VIEW public.fleet_inv_settings
WITH (security_invoker = true) AS
SELECT * FROM fleet.inv_settings;

REVOKE ALL ON public.fleet_inv_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_settings TO service_role;

-- Logbook line (hand-run SQL never updates schema_migrations).
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110125114', 'fleet_inventory_completion')
ON CONFLICT (version) DO NOTHING;
