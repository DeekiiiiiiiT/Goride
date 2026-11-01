-- from .tmp_rpc_3.sql
CREATE OR REPLACE FUNCTION fleet.inv_nightly_integrity(p_org_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_org text;
  v_check jsonb;
  v_bad bigint;
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
    IF v_bad > 0 OR NOT COALESCE((v_check->>'ok')::boolean, false) THEN
      INSERT INTO fleet.inv_alert (
        organization_id, type, chip_label, severity, title, body, status
      )
      VALUES (
        v_org, 'ledger_variance', 'LEDGER VARIANCE', 'critical',
        'Inventory integrity check failed',
        format('balance_drift_rows=%s chain_ok=%s', v_bad, v_check->>'ok'),
        'open'
      );
    END IF;
  END LOOP;
  RETURN gen_random_uuid();
END;
$$;

CREATE OR REPLACE VIEW fleet.v_inv_stock WITH (security_invoker = true) AS
SELECT b.organization_id, i.id AS item_id, i.sku, i.short_code, i.name, i.tracking,
  l.id AS location_id, l.code AS location_code, l.name AS location_name,
  sum(b.on_hand) AS on_hand, sum(b.reserved) AS reserved, sum(b.value) AS stock_value,
  CASE WHEN sum(b.on_hand) <= 0 THEN 'out'
       WHEN sum(b.on_hand) <= COALESCE(max(rp.reorder_point), 0) THEN 'low'
       ELSE 'ok' END AS stock_status
FROM fleet.inv_balance b
JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
LEFT JOIN fleet.inv_reorder_policy rp ON rp.organization_id = b.organization_id AND rp.item_id = b.item_id AND rp.location_id = b.location_id
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

CREATE OR REPLACE VIEW fleet.v_inv_kit_compliance WITH (security_invoker = true) AS
WITH base AS (
  SELECT vk.organization_id, vk.vehicle_id, v.license_plate, kt.code AS kit_code, ktl.id AS kit_line_id,
    ktl.item_id, ktl.qty_required, ktl.blocks_road_clearance, ktl.line_type,
    CASE WHEN ktl.line_type <> 'item' THEN 'linked'
         WHEN COALESCE(b.on_hand, 0) >= ktl.qty_required THEN 'ok'
         WHEN COALESCE(b.on_hand, 0) > 0 THEN 'short' ELSE 'missing' END AS line_status
  FROM fleet.vehicle_kit vk
  JOIN fleet.vehicles v ON v.id = vk.vehicle_id
  JOIN fleet.kit_template kt ON kt.id = vk.template_id
  JOIN fleet.kit_template_version ktv ON ktv.id = vk.version_id
  JOIN fleet.kit_template_line ktl ON ktl.version_id = ktv.id
  LEFT JOIN fleet.inv_location vl ON vl.organization_id = vk.organization_id AND vl.vehicle_id = vk.vehicle_id
  LEFT JOIN fleet.inv_balance b ON b.organization_id = vk.organization_id AND b.item_id = ktl.item_id AND b.location_id = vl.id
)
SELECT b.*, NOT EXISTS (
  SELECT 1 FROM base b2 WHERE b2.organization_id = b.organization_id AND b2.vehicle_id = b.vehicle_id
    AND b2.blocks_road_clearance AND b2.line_status IN ('missing', 'short')
) AS road_clear FROM base b;

CREATE OR REPLACE VIEW fleet.v_inv_alerts_tiles WITH (security_invoker = true) AS
SELECT a.organization_id,
  count(*) FILTER (WHERE a.status = 'open') AS open_alerts,
  count(*) FILTER (WHERE a.chip_label = 'ROAD CLEARANCE BLOCKED') AS road_clearance_blocked,
  count(*) FILTER (WHERE a.type = 'reorder') AS reorder_alerts,
  count(*) FILTER (WHERE a.type = 'ledger_variance') AS ledger_variance_alerts
FROM fleet.inv_alert a GROUP BY a.organization_id;

GRANT SELECT ON fleet.v_inv_stock, fleet.v_inv_stock_kpis, fleet.v_inv_kit_compliance, fleet.v_inv_alerts_tiles TO authenticated, service_role;

REVOKE ALL ON FUNCTION fleet._inv_next_ref(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet._inv_movement_by_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet._inv_append_ledger_leg(text, uuid, uuid, uuid, uuid, uuid, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet._inv_consume_fifo_layers(text, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet.inv_verify_chain(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_opening_balance(text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_receive(text, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_issue_to_vehicles(text, uuid, jsonb, text[], boolean, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_adjust(text, uuid, uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_reverse(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_write_off(text, uuid, uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_import_items(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_nightly_integrity(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION fleet.inv_verify_chain(text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_opening_balance(text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_receive(text, jsonb, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_issue_to_vehicles(text, uuid, jsonb, text[], boolean, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_transfer(text, uuid, uuid, uuid, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_adjust(text, uuid, uuid, uuid, numeric, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_reverse(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_write_off(text, uuid, uuid, uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_import_items(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_nightly_integrity(text) TO service_role;
;
