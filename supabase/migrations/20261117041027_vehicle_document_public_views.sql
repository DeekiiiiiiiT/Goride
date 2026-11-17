-- Production's API does not expose the `fleet` schema (by design), so fleet-core's
-- `.schema("fleet")` calls for certificate checks failed there: saving a new vehicle
-- stored the car, then threw on the document-check insert (no picture was ever asked for).
-- Same pattern as public.fleet_vehicles: thin public views + a wrapper, server-only.

CREATE OR REPLACE VIEW public.fleet_vehicle_document_check AS
  SELECT * FROM fleet.vehicle_document_check;
ALTER VIEW public.fleet_vehicle_document_check SET (security_invoker = true);
REVOKE ALL ON public.fleet_vehicle_document_check FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON fleet.vehicle_document_check TO service_role;
GRANT SELECT, INSERT ON public.fleet_vehicle_document_check TO service_role;

CREATE OR REPLACE VIEW public.fleet_vehicle_document_read_log AS
  SELECT * FROM fleet.vehicle_document_read_log;
ALTER VIEW public.fleet_vehicle_document_read_log SET (security_invoker = true);
REVOKE ALL ON public.fleet_vehicle_document_read_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON fleet.vehicle_document_read_log TO service_role;
GRANT SELECT, INSERT ON public.fleet_vehicle_document_read_log TO service_role;

CREATE OR REPLACE FUNCTION public.vehicle_document_read_counts(p_user uuid, p_org text)
RETURNS TABLE (user_hour_count int, org_day_count int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT c.user_hour_count, c.org_day_count
  FROM fleet.vehicle_document_read_counts(p_user, p_org) AS c;
$$;
REVOKE ALL ON FUNCTION public.vehicle_document_read_counts(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_document_read_counts(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
