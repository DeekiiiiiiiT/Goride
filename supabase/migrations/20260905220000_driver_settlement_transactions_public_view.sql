-- PostgREST does not expose ledger. Edge functions must write settlement mirrors
-- through a public view (same pattern as driver_financial_periods).

CREATE OR REPLACE VIEW public.driver_settlement_transactions
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_settlement_transactions;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_settlement_transactions TO service_role;

-- Keep period views invoker-safe when recreated elsewhere without the flag.
ALTER VIEW public.driver_financial_periods SET (security_invoker = true);
ALTER VIEW public.driver_financial_period_lines SET (security_invoker = true);
ALTER VIEW public.driver_period_revisions SET (security_invoker = true);
