-- Recreate admin views without security_invoker (fixes permission errors for service_role).
DROP VIEW IF EXISTS public.rides_audit_events;
DROP VIEW IF EXISTS public.rides_surge_cells;
DROP VIEW IF EXISTS public.rides_fare_rules;

CREATE VIEW public.rides_fare_rules AS
  SELECT * FROM rides.fare_rules;

CREATE VIEW public.rides_surge_cells AS
  SELECT * FROM rides.surge_cells;

CREATE VIEW public.rides_audit_events AS
  SELECT * FROM rides.audit_events;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_fare_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_surge_cells TO service_role;
GRANT SELECT, INSERT ON public.rides_audit_events TO service_role;

NOTIFY pgrst, 'reload schema';
