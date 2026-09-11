-- Phase 2 backfill: closed weeks with cash_still_held not yet transferred.
-- Review inventory first. Run per-org after Phase 1+2 code is deployed.
-- Does NOT rebuild next weeks — follow with a projection refresh for affected drivers.

-- Preview candidates:
-- SELECT id, driver_id, period_anchor, cash_still_held,
--        metadata->'financeCore'->>'custodyTransferredTo' AS transferred
-- FROM ledger.driver_financial_periods
-- WHERE status = 'closed'
--   AND cash_still_held > 0.5
--   AND COALESCE(metadata->'financeCore'->>'custodyTransferredTo', '') = '';

-- Manual ops: for each candidate, set custodyTransferredTo / Amount on source,
-- add openingCashCustody on next Monday period, then rebuild that open week.
-- Prefer the app close path for new closes; use this only for historical orphans.
