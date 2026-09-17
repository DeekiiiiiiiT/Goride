-- R-2 / R-1: first-class acknowledgement columns for thin odometer chain
-- and fills-without-odometer (mirror leakage_reviewed_* shape).
ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS odometer_chain_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS odometer_chain_reviewed_by text,
  ADD COLUMN IF NOT EXISTS odometer_chain_review_note text,
  ADD COLUMN IF NOT EXISTS unattributed_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS unattributed_reviewed_by text,
  ADD COLUMN IF NOT EXISTS unattributed_review_note text;

COMMENT ON COLUMN public.fuel_reconciliation_period.odometer_chain_reviewed_at IS
  'R-2: operator acknowledged timing cannot be measured (thin odometer chain).';
COMMENT ON COLUMN public.fuel_reconciliation_period.unattributed_reviewed_at IS
  'R-1: operator accepted fills-without-odometer spend beyond gate.';
