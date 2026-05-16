-- Run this in Supabase Dashboard → SQL Editor if roam-s.co/admin shows
-- "Could not find the table 'public.rides_fare_rules' in the schema cache".
-- Requires rides.fare_rules / rides.surge_cells migrations to already exist.

CREATE OR REPLACE VIEW public.rides_fare_rules
WITH (security_invoker = true)
AS
  SELECT * FROM rides.fare_rules;

CREATE OR REPLACE VIEW public.rides_surge_cells
WITH (security_invoker = true)
AS
  SELECT * FROM rides.surge_cells;

CREATE OR REPLACE VIEW public.rides_audit_events
WITH (security_invoker = true)
AS
  SELECT * FROM rides.audit_events;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_fare_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_surge_cells TO service_role;
GRANT SELECT, INSERT ON public.rides_audit_events TO service_role;

NOTIFY pgrst, 'reload schema';
