-- Finding L + R schema guard.
-- Expect zero rows from each query. Any row = broken subsidy path.

-- 1) Column required for RPC filters / money sum
WITH required(col) AS (
  VALUES
    ('platform_delivery_subsidy_jmd'),
    ('pricing_snapshot'),
    ('status'),
    ('free_delivery_applied'),
    ('rush_pass_membership_id'),
    ('placed_at')
)
SELECT r.col AS missing_column
FROM required r
WHERE NOT EXISTS (
  SELECT 1
  FROM information_schema.columns c
  WHERE c.table_schema = 'delivery'
    AND c.table_name = 'orders'
    AND c.column_name = r.col
);

-- 2) RPCs must exist (Finding R — no row-transport accumulators)
SELECT missing_rpc
FROM (
  VALUES
    ('sum_promo_fd_subsidy_used'),
    ('sum_rush_pass_subsidy_used')
) AS t(missing_rpc)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'delivery'
    AND p.proname = t.missing_rpc
);
