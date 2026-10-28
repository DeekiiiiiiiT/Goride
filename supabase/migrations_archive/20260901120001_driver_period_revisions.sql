-- A-7: append-only payout / settlement revision history.
CREATE TABLE IF NOT EXISTS ledger.driver_period_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id TEXT NOT NULL REFERENCES fleet.drivers(id) ON DELETE CASCADE,
  period_anchor DATE NOT NULL,
  projection_version INTEGER NOT NULL,
  settlement_paid NUMERIC(14,2),
  settlement_amount NUMERIC(14,2),
  payout_net NUMERIC(14,2),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_event_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_period_revisions_driver_week
  ON ledger.driver_period_revisions (driver_id, period_anchor, created_at DESC);

CREATE OR REPLACE VIEW public.driver_period_revisions AS
  SELECT * FROM ledger.driver_period_revisions;
