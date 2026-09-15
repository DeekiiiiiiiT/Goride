-- N-7: seal failures must not overwrite computed_from_hash; store on period instead.
ALTER TABLE public.fuel_reconciliation_period
  ADD COLUMN IF NOT EXISTS fuel_seal_error text;

COMMENT ON COLUMN public.fuel_reconciliation_period.fuel_seal_error IS
  'Last sealFuelWeek failure message; cleared on successful seal';
