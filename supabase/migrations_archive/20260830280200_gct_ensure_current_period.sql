-- Optional: ensure open GCT period for current month (idempotent helper for remittance UI)
-- Output/input tax writers also auto-create periods; this seeds the current month for Dominion.

INSERT INTO accounting.gct_periods (period_start, period_end, status)
SELECT
  date_trunc('month', CURRENT_DATE)::date,
  (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
  'open'
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'accounting' AND table_name = 'gct_periods'
)
ON CONFLICT (period_start, period_end) DO NOTHING;
