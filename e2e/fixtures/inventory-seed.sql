-- E2E / preview org seed for Fleet inventory (post cut-down schema).
-- Usage (local CI org):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v seed_org=test-org-inv -f e2e/fixtures/inventory-seed.sql
-- Preview: set seed_org to the E2E fleet org id before apply.

INSERT INTO fleet.inv_item (organization_id, sku, name, uom, default_unit_cost, tracking)
VALUES
  (:'seed_org', 'SEED-WPR-400', 'SEED Wiper 400mm', 'ea', 1200, 'quantity')
ON CONFLICT (organization_id, lower(sku)) DO UPDATE SET name = EXCLUDED.name;
