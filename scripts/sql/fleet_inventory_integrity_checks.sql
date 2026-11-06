-- Fleet inventory post-apply checks (audit §3). Each SELECT must return 0 rows when healthy.
-- Runner: scripts/run-fleet-inventory-data-checks.mjs (psql -tA); any output line fails CI/local gate.

-- Balances ≠ sum(ledger)
SELECT 'balance_ledger_drift' AS check_id, x.*
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
) x
WHERE x.bal_on_hand IS DISTINCT FROM x.ledger_sum;

-- Movement legs not summing to zero (all movement types including opening/receive/adjust/write-off)
SELECT 'movement_legs_nonzero' AS check_id, m.organization_id, m.id AS movement_id, sum(l.qty_delta) AS leg_sum
FROM fleet.inv_movement m
JOIN fleet.inv_ledger l ON l.movement_id = m.id AND l.organization_id = m.organization_id
GROUP BY m.organization_id, m.id
HAVING sum(l.qty_delta) IS DISTINCT FROM 0;

-- Negative physical stock
SELECT 'negative_on_hand' AS check_id, organization_id, item_id, location_id, on_hand
FROM fleet.inv_balance
WHERE on_hand < 0;

-- Reserved > on-hand
SELECT 'reserved_exceeds_on_hand' AS check_id, organization_id, item_id, location_id, on_hand, reserved
FROM fleet.inv_balance
WHERE reserved > on_hand;

-- NULL organization_id on core tables
SELECT 'null_org_inv_item' AS check_id, id::text AS row_id FROM fleet.inv_item WHERE organization_id IS NULL
UNION ALL
SELECT 'null_org_inv_ledger', id::text FROM fleet.inv_ledger WHERE organization_id IS NULL;

-- Broken hash chain (latest nightly check per org)
SELECT 'broken_chain' AS check_id, c.organization_id
FROM fleet.inv_chain_check c
WHERE NOT c.ok
  AND c.checked_at = (
    SELECT max(c2.checked_at)
    FROM fleet.inv_chain_check c2
    WHERE c2.organization_id = c.organization_id
  );

-- Layer qty ≠ on-hand (real locations; bins aggregated at location)
SELECT 'layer_qty_vs_on_hand' AS check_id, x.*
FROM (
  SELECT
    b.organization_id,
    b.item_id,
    b.location_id,
    b.on_hand,
    COALESCE((
      SELECT sum(cl.qty_remaining)
      FROM fleet.inv_cost_layer cl
      WHERE cl.organization_id = b.organization_id
        AND cl.item_id = b.item_id
        AND cl.location_id = b.location_id
    ), 0) AS layer_qty
  FROM fleet.inv_balance b
  JOIN fleet.inv_location loc
    ON loc.id = b.location_id AND loc.organization_id = b.organization_id
  WHERE loc.kind <> 'virtual'
) x
WHERE x.on_hand IS DISTINCT FROM x.layer_qty;

-- Layer extended cost ≠ balance value
SELECT 'layer_value_vs_balance' AS check_id, x.*
FROM (
  SELECT
    b.organization_id,
    b.item_id,
    b.location_id,
    b.value AS balance_value,
    COALESCE((
      SELECT sum(cl.qty_remaining * cl.unit_cost)
      FROM fleet.inv_cost_layer cl
      WHERE cl.organization_id = b.organization_id
        AND cl.item_id = b.item_id
        AND cl.location_id = b.location_id
    ), 0) AS layer_value
  FROM fleet.inv_balance b
  JOIN fleet.inv_location loc
    ON loc.id = b.location_id AND loc.organization_id = b.organization_id
  WHERE loc.kind <> 'virtual'
) x
WHERE x.balance_value IS DISTINCT FROM x.layer_value;

-- Cost layers at virtual locations
SELECT 'layers_at_virtual_location' AS check_id,
  cl.organization_id,
  cl.id AS layer_id,
  cl.item_id,
  cl.location_id,
  cl.qty_remaining
FROM fleet.inv_cost_layer cl
JOIN fleet.inv_location loc
  ON loc.id = cl.location_id AND loc.organization_id = cl.organization_id
WHERE loc.kind = 'virtual'
  AND cl.qty_remaining > 0;

-- Layers remain when on-hand is zero
SELECT 'orphan_layers_zero_on_hand' AS check_id, x.*
FROM (
  SELECT
    cl.organization_id,
    cl.item_id,
    cl.location_id,
    b.on_hand,
    sum(cl.qty_remaining) AS layer_qty
  FROM fleet.inv_cost_layer cl
  LEFT JOIN fleet.inv_balance b
    ON b.organization_id = cl.organization_id
   AND b.item_id = cl.item_id
   AND b.location_id = cl.location_id
  WHERE cl.qty_remaining > 0
  GROUP BY cl.organization_id, cl.item_id, cl.location_id, b.on_hand
) x
  WHERE COALESCE(x.on_hand, 0) = 0;

-- Kit lines in one version share a sort position (D10)
SELECT 'kit_line_sort_dup' AS check_id, version_id, sort_order, count(*) AS line_count
FROM fleet.kit_template_line
GROUP BY version_id, sort_order
HAVING count(*) > 1;

-- Duplicate serial numbers within a fleet (P10 / D-2)
SELECT 'duplicate_serial' AS check_id, organization_id, serial_number, count(*) AS asset_count
FROM fleet.inv_asset
WHERE serial_number IS NOT NULL
GROUP BY organization_id, serial_number
HAVING count(*) > 1;

-- More than one draft or production kit version per template (P10 / D-2)
SELECT 'kit_version_state' AS check_id, template_id, status, count(*) AS version_count
FROM fleet.kit_template_version
WHERE status IN ('draft', 'production')
GROUP BY template_id, status
HAVING count(*) > 1;

-- Vehicles missing kit assignment or vehicle stock location (P10 / D-2)
SELECT 'vehicle_without_kit' AS check_id, v.organization_id, v.id AS vehicle_id
FROM fleet.vehicles v
LEFT JOIN fleet.vehicle_kit vk
  ON vk.organization_id = v.organization_id AND vk.vehicle_id = v.id
LEFT JOIN fleet.inv_location loc
  ON loc.organization_id = v.organization_id
 AND loc.vehicle_id = v.id
 AND loc.kind = 'vehicle'
WHERE v.organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM fleet.inv_settings s
    WHERE s.organization_id = v.organization_id
  )
  AND (vk.id IS NULL OR loc.id IS NULL);
