-- Replay order repair. These creates were dated after the migrations that use them.
-- Fresh databases apply the renamed files. Production already has the tables,
-- so this only rewrites the version list and does not create anything again.
--
--   20260805120000 → 20260718163900  toll_settlement_allocations
--   20260801120000 → 20260718164900  enterprise_inventory_foundation
--   20260829120001 → 20260826230000  pricing_hierarchy_layers
--   20260829140001 → 20260826240000  pricing_override_enabled

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260805120000',
  '20260801120000',
  '20260829120001',
  '20260829140001'
);

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT v.version, v.name, ARRAY[]::text[]
FROM (
  VALUES
    ('20260718163900', 'toll_settlement_allocations'),
    ('20260718164900', 'enterprise_inventory_foundation'),
    ('20260826230000', 'pricing_hierarchy_layers'),
    ('20260826240000', 'pricing_override_enabled')
) AS v(version, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM supabase_migrations.schema_migrations sm
  WHERE sm.version = v.version
);
