-- Phase 0: inventory closed-week hash health on driver_financial_periods.
-- Run in Supabase SQL editor (service role / dashboard). Classifies each closed/frozen week.

WITH frozen AS (
  SELECT
    p.id,
    p.driver_id,
    p.organization_id,
    p.period_anchor,
    p.status,
    p.source_event_hash,
    p.close_hash,
    p.metadata,
    NULLIF(BTRIM(p.close_hash), '') AS close_hash_col,
    NULLIF(BTRIM(p.metadata #>> '{financeCore,closeHash}'), '') AS meta_close_hash,
    NULLIF(BTRIM(p.source_event_hash), '') AS source_hash,
    COALESCE(
      (p.metadata #>> '{financeCore,periodFrozen}')::boolean,
      (p.metadata->>'periodFrozen')::boolean,
      false
    ) AS meta_frozen
  FROM ledger.driver_financial_periods p
  WHERE p.status = 'closed'
     OR COALESCE(
          (p.metadata #>> '{financeCore,periodFrozen}')::boolean,
          (p.metadata->>'periodFrozen')::boolean,
          false
        )
)
SELECT
  period_anchor,
  organization_id,
  driver_id,
  id,
  CASE
    WHEN close_hash_col IS NOT NULL
         AND meta_close_hash IS NOT NULL
         AND close_hash_col = meta_close_hash
         AND (source_hash IS NULL OR source_hash = close_hash_col)
      THEN 'healthy_dedicated'
    WHEN meta_close_hash IS NOT NULL
         AND close_hash_col IS NULL
         AND source_hash IS NOT NULL
         AND source_hash = meta_close_hash
      THEN 'legacy_ok_needs_column_backfill'
    WHEN meta_close_hash IS NOT NULL
         AND source_hash IS NOT NULL
         AND source_hash <> meta_close_hash
      THEN 'bricked_projection_overwrote_column'
    WHEN meta_close_hash IS NOT NULL
         AND close_hash_col IS NOT NULL
         AND close_hash_col <> meta_close_hash
      THEN 'column_meta_mismatch'
    WHEN meta_close_hash IS NULL AND close_hash_col IS NULL AND source_hash IS NULL
      THEN 'legacy_no_hash'
    WHEN meta_close_hash IS NULL AND source_hash IS NOT NULL
      THEN 'hash_only_on_source_column'
    ELSE 'other'
  END AS hash_class,
  left(COALESCE(close_hash_col, ''), 16) AS close_hash_prefix,
  left(COALESCE(meta_close_hash, ''), 16) AS meta_hash_prefix,
  left(COALESCE(source_hash, ''), 16) AS source_hash_prefix,
  (close_hash_col IS DISTINCT FROM meta_close_hash) AS col_vs_meta_differs,
  (source_hash IS DISTINCT FROM meta_close_hash) AS source_vs_meta_differs
FROM frozen
ORDER BY
  CASE
    WHEN meta_close_hash IS NOT NULL
         AND source_hash IS NOT NULL
         AND source_hash <> meta_close_hash THEN 0
    ELSE 1
  END,
  period_anchor DESC,
  driver_id;

-- Summary counts:
-- SELECT hash_class, count(*) FROM (<same CASE query>) t GROUP BY 1 ORDER BY 2 DESC;
