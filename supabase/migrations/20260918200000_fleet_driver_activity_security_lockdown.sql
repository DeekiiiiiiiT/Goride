-- Driver Activity audit R1 (C1/C2): lock SECURITY DEFINER RPCs + harden/drop public views.
-- Postgres grants EXECUTE to PUBLIC on new functions; Wave 0/1 missed REVOKEs.

-- ── C1: Revoke client EXECUTE on activity SECURITY DEFINER RPCs ──────────────
DO $$
DECLARE
  r record;
  names text[] := ARRAY[
    'append_presence_transition',
    'rides_upsert_driver_presence',
    'delivery_courier_upsert_presence',
    'sweep_stale_presence',
    'purge_old_activity_data'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY (names)
      AND n.nspname IN ('public', 'delivery', 'fleet', 'rides')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.schema_name,
      r.func_name,
      pg_get_function_identity_arguments(r.oid)
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.schema_name,
      r.func_name,
      pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;

-- ── C2: Views — security_invoker + revoke anon; drop service-only wrappers ──
ALTER VIEW public.fleet_driver_activity_events SET (security_invoker = true);
ALTER VIEW public.fleet_activity_source_coverage SET (security_invoker = true);

REVOKE ALL ON TABLE public.fleet_driver_activity_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fleet_activity_source_coverage FROM PUBLIC, anon;

-- Reads go through edge + drivers.view — no direct authenticated table SELECT
REVOKE SELECT ON TABLE fleet.driver_activity_events FROM authenticated;
REVOKE SELECT ON TABLE public.fleet_driver_activity_events FROM authenticated;

-- Presence log + watermarks: edge uses service_role on fleet.* — drop public wrappers
DROP VIEW IF EXISTS public.fleet_driver_presence_log;
DROP VIEW IF EXISTS public.fleet_activity_ingest_watermarks;

-- Keep coverage + events views for PostgREST service_role / diagnostics only
GRANT SELECT ON public.fleet_driver_activity_events TO service_role;
GRANT ALL ON public.fleet_driver_activity_events TO service_role;
GRANT ALL ON public.fleet_activity_source_coverage TO service_role;

NOTIFY pgrst, 'reload schema';
