-- Backfill inventory_ledger from stock_movements (run once before enterprise cutover)
-- Requires bootstrap script to have created item_master rows with legacy_ingredient_id

INSERT INTO delivery.inventory_ledger (
  node_id,
  item_id,
  quantity,
  uom_id,
  quantity_base,
  transaction_type,
  reference_type,
  reference_id,
  idempotency_key,
  created_at
)
SELECT
  n.id AS node_id,
  im.id AS item_id,
  sm.delta AS quantity,
  im.base_uom_id AS uom_id,
  sm.delta AS quantity_base,
  CASE
    WHEN sm.reason = 'order_paid' THEN 'pos_depletion'
    WHEN sm.reason = 'waste' THEN 'waste'
    ELSE 'physical_adjustment'
  END AS transaction_type,
  CASE WHEN sm.order_id IS NOT NULL THEN 'order' ELSE 'stock_movement' END,
  sm.order_id,
  'backfill:sm:' || sm.id::text,
  sm.created_at
FROM delivery.stock_movements sm
JOIN delivery.item_master im ON im.legacy_ingredient_id = sm.ingredient_id
JOIN delivery.inventory_nodes n ON n.merchant_id = sm.merchant_id
WHERE NOT EXISTS (
  SELECT 1 FROM delivery.inventory_ledger il
  WHERE il.idempotency_key = 'backfill:sm:' || sm.id::text
);

-- Reconcile balances from ledger sums where cache drifted
INSERT INTO delivery.inventory_balances (node_id, item_id, quantity_base, updated_at)
SELECT
  il.node_id,
  il.item_id,
  SUM(il.quantity_base),
  now()
FROM delivery.inventory_ledger il
GROUP BY il.node_id, il.item_id
ON CONFLICT (node_id, item_id) DO UPDATE
  SET quantity_base = EXCLUDED.quantity_base,
      updated_at = now();
