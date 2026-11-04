-- E2E / preview org seed for Fleet inventory (Rev 32 Phase 3).
-- Usage (local CI org):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v seed_org=test-org-inv -f e2e/fixtures/inventory-seed.sql
-- Preview: set seed_org to the E2E fleet org id before apply.

INSERT INTO fleet.inv_item (organization_id, sku, name, category, unit, default_cost_jmd, is_serial_tracked)
VALUES
  (:'seed_org', 'SEED-WPR-400', 'SEED Wiper 400mm', 'consumable', 'ea', 1200, false)
ON CONFLICT (organization_id, sku) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO fleet.inv_purchase_order (organization_id, number, status, vendor_name, total_jmd)
VALUES (:'seed_org', 'SEED-PO-1', 'draft', 'SEED Vendor Ltd', 5000)
ON CONFLICT (organization_id, number) DO NOTHING;
