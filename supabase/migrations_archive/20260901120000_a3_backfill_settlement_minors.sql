-- A-3: backfill settlement triple *_minor columns from NUMERIC where NULL.
-- Idempotent — safe to re-run.

UPDATE driver_financial_periods
SET
  settlement_amount_minor = COALESCE(
    settlement_amount_minor,
    ROUND(COALESCE(settlement_amount, 0) * 100)::BIGINT
  ),
  payout_net_minor = COALESCE(
    payout_net_minor,
    ROUND(COALESCE(payout_net, 0) * 100)::BIGINT
  ),
  cash_still_held_minor = COALESCE(
    cash_still_held_minor,
    ROUND(COALESCE(cash_still_held, 0) * 100)::BIGINT
  )
WHERE
  settlement_amount_minor IS NULL
  OR payout_net_minor IS NULL
  OR cash_still_held_minor IS NULL;
