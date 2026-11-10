-- Log service save fix: the server calls the final "log_service" step after the books have
-- posted, but fleet.log_service only exists in the fleet schema, which the API cannot see.
-- Every Log service save therefore returned 500 even though the service, odometer reading and
-- books entry had saved (due dates were not refreshed and no service.logged event was written).
-- Public doorway for the server only (service_role); anon and signed-in users cannot call it.

CREATE OR REPLACE FUNCTION public.fleet_log_service(payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT fleet.log_service(payload);
$$;

REVOKE ALL ON FUNCTION public.fleet_log_service(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fleet_log_service(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_log_service(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
