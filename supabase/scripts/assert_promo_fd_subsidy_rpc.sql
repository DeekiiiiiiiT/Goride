-- Finding R companion: promo FD spend must be a single-row Postgres aggregate.
-- Expect zero rows.

SELECT 'sum_promo_fd_subsidy_used' AS missing_rpc
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'delivery'
    AND p.proname = 'sum_promo_fd_subsidy_used'
);

SELECT 'free_delivery_applied' AS missing_column
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.columns c
  WHERE c.table_schema = 'delivery'
    AND c.table_name = 'orders'
    AND c.column_name = 'free_delivery_applied'
);
