-- Currency on maintenance service logs (ledger is currency-aware; default JMD).
ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'JMD';

COMMENT ON COLUMN public.maintenance_records.currency IS
  'ISO-ish currency code for cost; defaults JMD to match Business Finance ledger.';
