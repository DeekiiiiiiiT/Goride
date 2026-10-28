-- F-5: persist client degraded money-input signal for server auto-close gate.
ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS degraded_inputs boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fuel_reconciliation_period.degraded_inputs IS
  'True when wizard money-bearing inputs timed out or were missing (trips/deadhead/PA/brain/cards).';
