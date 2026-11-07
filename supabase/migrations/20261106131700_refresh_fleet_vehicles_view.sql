-- fleet.vehicles gained columns (e.g. severe_duty); recreate wrapper so PostgREST exposes them.
CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

ALTER VIEW public.fleet_vehicles SET (security_invoker = true);
