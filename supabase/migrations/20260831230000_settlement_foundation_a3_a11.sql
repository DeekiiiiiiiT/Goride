-- A-11: Indexed settlement transactions (replaces unbounded transaction: KV scans).
CREATE TABLE IF NOT EXISTS ledger.driver_settlement_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id TEXT NOT NULL REFERENCES fleet.drivers(id) ON DELETE CASCADE,
  period_anchor DATE NOT NULL,
  transaction_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_settlement_tx_driver_period
  ON ledger.driver_settlement_transactions (driver_id, period_anchor);

-- A-3 scaffold: dual-write minor-unit columns (populate in follow-up backfill).
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS settlement_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS payout_net_minor BIGINT,
  ADD COLUMN IF NOT EXISTS cash_still_held_minor BIGINT;

COMMENT ON COLUMN ledger.driver_financial_periods.settlement_amount_minor IS
  'A-3 dual-write: round(settlement_amount * 100). Display still uses NUMERIC until cutover.';

CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
