-- Restore service_role-only public wrappers for presence + watermarks (edge PostgREST).
-- C2 still holds: no anon/authenticated grants; security_invoker on.

CREATE OR REPLACE VIEW public.fleet_driver_presence_log AS
  SELECT * FROM fleet.driver_presence_log;
ALTER VIEW public.fleet_driver_presence_log SET (security_invoker = true);
REVOKE ALL ON TABLE public.fleet_driver_presence_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fleet_driver_presence_log TO service_role;

CREATE OR REPLACE VIEW public.fleet_activity_ingest_watermarks AS
  SELECT * FROM fleet.activity_ingest_watermarks;
ALTER VIEW public.fleet_activity_ingest_watermarks SET (security_invoker = true);
REVOKE ALL ON TABLE public.fleet_activity_ingest_watermarks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fleet_activity_ingest_watermarks TO service_role;

NOTIFY pgrst, 'reload schema';
