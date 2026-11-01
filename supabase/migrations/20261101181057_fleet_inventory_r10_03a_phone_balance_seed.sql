INSERT INTO fleet.inv_balance (organization_id, item_id, location_id, bin_id, on_hand, value, updated_at)
SELECT '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823', '5129bef3-8bab-4793-b84d-fa62f9557c5e', 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3', NULL, 1, 0, now()
WHERE NOT EXISTS (
  SELECT 1 FROM fleet.inv_balance b
  WHERE b.organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823'
    AND b.item_id = '5129bef3-8bab-4793-b84d-fa62f9557c5e'
    AND b.location_id = 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3'
);;
