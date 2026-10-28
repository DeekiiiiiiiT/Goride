-- Ledger Phase 3 (ADR 0001 A1): schema_migrations bookkeeping after cash-settlement file resequence.
-- No DDL — objects already exist on production; fresh replays apply DDL via renamed files above.
--
-- Renamed (old → new version):
--   20260615232859 → 20260618120001  switch_to_card_settlement
--   20260615233500 → 20260618120002  cash_settlement_disputes
--   20260615234000 → 20260618120003  admin_settlement_overrides
--   20260616121500 → 20260618120004  cash_settlement_admin_grants

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260615232859',
  '20260615233500',
  '20260615234000',
  '20260616121500'
);

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT v.version, v.name, ARRAY[]::text[]
FROM (
  VALUES
    ('20260618120001', 'switch_to_card_settlement'),
    ('20260618120002', 'cash_settlement_disputes'),
    ('20260618120003', 'admin_settlement_overrides'),
    ('20260618120004', 'cash_settlement_admin_grants')
) AS v(version, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM supabase_migrations.schema_migrations sm
  WHERE sm.version = v.version
);
