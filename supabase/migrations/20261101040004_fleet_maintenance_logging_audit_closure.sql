-- Fleet maintenance logging audit closure (O-01, O-02, O-03, O-04, O-09)

CREATE OR REPLACE VIEW public.fleet_vehicles AS
  SELECT * FROM fleet.vehicles;

ALTER VIEW public.fleet_vehicles SET (security_invoker = true);

GRANT SELECT ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;;
