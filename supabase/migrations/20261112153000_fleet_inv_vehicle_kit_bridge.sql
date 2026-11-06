-- PostgREST bridge for fleet.vehicle_kit (kit template vehicle_count, driver portal).

CREATE OR REPLACE VIEW public.fleet_inv_vehicle_kit
WITH (security_invoker = true) AS
SELECT * FROM fleet.vehicle_kit;

REVOKE ALL ON public.fleet_inv_vehicle_kit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inv_vehicle_kit TO service_role;
