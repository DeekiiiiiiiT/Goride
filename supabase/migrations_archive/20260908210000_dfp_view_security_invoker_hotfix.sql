-- N-1 hotfix: restore security_invoker on public→ledger 1:1 wrappers whose
-- latest CREATE OR REPLACE omitted WITH (security_invoker = true).
-- CREATE OR REPLACE without WITH resets reloptions → security-definer / RLS bypass.

CREATE OR REPLACE VIEW public.driver_financial_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_periods;

CREATE OR REPLACE VIEW public.driver_financial_period_lines
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_period_lines;

CREATE OR REPLACE VIEW public.driver_period_revisions
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_period_revisions;

CREATE OR REPLACE VIEW public.driver_operational_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_operational_periods;

CREATE OR REPLACE VIEW public.financial_events
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.financial_events;

CREATE OR REPLACE VIEW public.financial_allocations
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.financial_allocations;

CREATE OR REPLACE VIEW public.financial_outbox
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.financial_outbox;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;
GRANT SELECT ON public.driver_period_revisions TO authenticated, service_role;
GRANT SELECT ON public.driver_operational_periods TO authenticated, service_role;
GRANT SELECT ON public.financial_events TO authenticated, service_role;
GRANT SELECT ON public.financial_allocations TO authenticated, service_role;
GRANT SELECT ON public.financial_outbox TO authenticated, service_role;
