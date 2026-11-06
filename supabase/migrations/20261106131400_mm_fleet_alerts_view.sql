-- M-13 added lifecycle columns on fleet.maintenance_alerts; refresh the public wrapper view.
CREATE OR REPLACE VIEW public.fleet_maintenance_alerts
WITH (security_invoker = true) AS
SELECT * FROM fleet.maintenance_alerts;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance_alerts TO service_role;
