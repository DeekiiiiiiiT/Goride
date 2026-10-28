-- PostgREST does not expose `accounting` until it is added to API Exposed schemas.
-- Mirror GCT engine tables into `public` so edge functions and Dominion work immediately.
-- Source of truth remains accounting.*; these views are the API surface.

CREATE OR REPLACE VIEW public.gct_supply_classes AS
  SELECT * FROM accounting.gct_supply_classes;

CREATE OR REPLACE VIEW public.gct_rates AS
  SELECT * FROM accounting.gct_rates;

CREATE OR REPLACE VIEW public.gct_entities AS
  SELECT * FROM accounting.gct_entities;

CREATE OR REPLACE VIEW public.gct_periods AS
  SELECT * FROM accounting.gct_periods;

CREATE OR REPLACE VIEW public.gct_output_tax AS
  SELECT * FROM accounting.gct_output_tax;

CREATE OR REPLACE VIEW public.gct_input_tax AS
  SELECT * FROM accounting.gct_input_tax;

CREATE OR REPLACE VIEW public.gct_engine_flags AS
  SELECT * FROM accounting.gct_engine_flags;

GRANT SELECT ON public.gct_supply_classes TO authenticated, service_role;
GRANT SELECT ON public.gct_rates TO authenticated, service_role;
GRANT SELECT ON public.gct_entities TO authenticated, service_role;
GRANT SELECT ON public.gct_periods TO authenticated, service_role;
GRANT SELECT ON public.gct_output_tax TO authenticated, service_role;
GRANT SELECT ON public.gct_input_tax TO authenticated, service_role;
GRANT SELECT ON public.gct_engine_flags TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.gct_rates TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_entities TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_periods TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_output_tax TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_input_tax TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_engine_flags TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.gct_supply_classes TO service_role;

COMMENT ON VIEW public.gct_rates IS 'API mirror of accounting.gct_rates — add accounting to Exposed schemas when ready';

NOTIFY pgrst, 'reload schema';
