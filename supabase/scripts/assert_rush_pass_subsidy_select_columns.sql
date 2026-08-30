-- Finding L schema guard: columns used by loadRushPassSubsidyUsed must exist.
-- Expect zero rows. Any row = broken select list (PostgREST would 400 → fail-open).
--
-- Keep in sync with supabase/functions/_shared/rushPassSubsidyUsed.ts
-- RUSH_PASS_SUBSIDY_ORDER_COLUMNS.

WITH required(col) AS (
  VALUES
    ('platform_delivery_subsidy_jmd'),
    ('pricing_snapshot'),
    ('status')
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
