-- Expose rides admin tables via `public` for PostgREST when the `rides` schema
-- is not listed in API settings (hosted default: public, graphql_public, delivery, payments).
-- The rides Edge Function admin routes use these views with schema `public`.

-- Run as view owner (postgres) so service_role can read/write via PostgREST on `public`.
CREATE OR REPLACE VIEW public.rides_fare_rules AS
  SELECT * FROM rides.fare_rules;

CREATE OR REPLACE VIEW public.rides_surge_cells AS
  SELECT * FROM rides.surge_cells;

CREATE OR REPLACE VIEW public.rides_audit_events AS
  SELECT * FROM rides.audit_events;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_fare_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_surge_cells TO service_role;
GRANT SELECT, INSERT ON public.rides_audit_events TO service_role;

-- Refresh PostgREST schema cache (Supabase hosted)
NOTIFY pgrst, 'reload schema';
