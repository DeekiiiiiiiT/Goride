-- Prod-applied: fleet_maintenance_logging_audit_closure (audit O-01)

CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

ALTER VIEW public.fleet_vehicles SET (security_invoker = true);

GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
