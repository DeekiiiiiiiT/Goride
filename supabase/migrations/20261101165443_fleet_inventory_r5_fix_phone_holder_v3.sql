-- Prod sync R6-06: rebalance ledger unit costs for phone holder mount lines.

UPDATE fleet.inv_ledger l
SET unit_cost = 5400,
    value_delta = l.qty_delta * 5400
FROM fleet.inv_item i
WHERE l.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
  AND l.item_id = i.id
  AND i.name ILIKE 'Phone Holder Mount%'
  AND l.unit_cost IS DISTINCT FROM 5400;
