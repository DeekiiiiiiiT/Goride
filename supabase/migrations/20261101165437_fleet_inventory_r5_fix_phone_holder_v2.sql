-- Prod sync R6-06: Phone Holder Mount landed cost J$5,400 (audit R5).

UPDATE fleet.inv_item
SET default_unit_cost = 5400,
    name = 'Phone Holder Mount',
    updated_at = now()
WHERE organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
  AND (
    sku = 'LEG-86736967-a32'
    OR name ILIKE 'Phone Holder Mount%'
  );
