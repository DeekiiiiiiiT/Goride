-- PostgREST does not expose the ledger schema. Cron functions must read/write
-- through public views (same pattern as public.ledger_entries).

CREATE OR REPLACE VIEW public.finance_recon_runs
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.finance_recon_runs;

CREATE OR REPLACE VIEW public.finance_doctor_runs
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.finance_doctor_runs;

GRANT SELECT, INSERT ON public.finance_recon_runs TO service_role;
GRANT SELECT, INSERT ON public.finance_doctor_runs TO service_role;
