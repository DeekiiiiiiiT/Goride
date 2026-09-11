-- Phase 1G: repair close_hash column from metadata.financeCore.closeHash
-- when frozen and metadata seal differs from (or is clearer than) source_event_hash.
-- Safe to re-run. Does not rewrite source_event_hash (legacy dual-write may still diverge).

UPDATE ledger.driver_financial_periods p
SET
  close_hash = NULLIF(BTRIM(p.metadata #>> '{financeCore,closeHash}'), ''),
  updated_at = now()
WHERE
  COALESCE(
    (p.metadata #>> '{financeCore,periodFrozen}')::boolean,
    (p.metadata->>'periodFrozen')::boolean,
    false
  )
  AND NULLIF(BTRIM(p.metadata #>> '{financeCore,closeHash}'), '') IS NOT NULL
  AND (
    p.close_hash IS DISTINCT FROM NULLIF(BTRIM(p.metadata #>> '{financeCore,closeHash}'), '')
    OR (
      NULLIF(BTRIM(p.source_event_hash), '') IS NOT NULL
      AND NULLIF(BTRIM(p.source_event_hash), '')
            IS DISTINCT FROM NULLIF(BTRIM(p.metadata #>> '{financeCore,closeHash}'), '')
    )
  );

-- Preview first (optional):
-- SELECT id, driver_id, period_anchor,
--   left(source_event_hash, 16) AS src,
--   left(close_hash, 16) AS col,
--   left(metadata #>> '{financeCore,closeHash}', 16) AS meta
-- FROM ledger.driver_financial_periods
-- WHERE COALESCE((metadata #>> '{financeCore,periodFrozen}')::boolean, false)
--   AND NULLIF(BTRIM(metadata #>> '{financeCore,closeHash}'), '') IS NOT NULL
--   AND (
--     close_hash IS DISTINCT FROM NULLIF(BTRIM(metadata #>> '{financeCore,closeHash}'), '')
--     OR source_event_hash IS DISTINCT FROM NULLIF(BTRIM(metadata #>> '{financeCore,closeHash}'), '')
--   );
