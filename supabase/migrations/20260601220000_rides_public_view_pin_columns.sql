-- PostgreSQL views do not pick up new base-table columns automatically.
-- Recreate public ride request view so verification_pin is visible to PostgREST/realtime.

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
