-- The fleet schema is not exposed to the API, so the edge server reaches fleet.*
-- objects through public.fleet_<name> views (same pattern as public.fleet_vehicles).
-- Release 34 added fleet.maintenance_kpi_monthly_v and
-- fleet.driver_maintenance_notifications without these views, so the
-- maintenance-kpi-monthly and maintenance-driver-notifications routes always failed.
-- Server-only: anon and authenticated get nothing.

CREATE OR REPLACE VIEW public.fleet_maintenance_kpi_monthly_v
WITH (security_invoker = true) AS
SELECT * FROM fleet.maintenance_kpi_monthly_v;

CREATE OR REPLACE VIEW public.fleet_driver_maintenance_notifications
WITH (security_invoker = true) AS
SELECT * FROM fleet.driver_maintenance_notifications;

REVOKE ALL ON public.fleet_maintenance_kpi_monthly_v FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fleet_driver_maintenance_notifications FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.fleet_maintenance_kpi_monthly_v TO service_role;
GRANT SELECT, UPDATE ON public.fleet_driver_maintenance_notifications TO service_role;

NOTIFY pgrst, 'reload schema';
