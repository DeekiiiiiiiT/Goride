-- R4-01: Revoke EXECUTE on public SECURITY DEFINER wrappers from anon/authenticated.
-- REVOKE FROM PUBLIC alone leaves Supabase default grants to anon + authenticated.
-- Schema-internal twins (fleet.* / recon.*) are already locked; these public wrappers were not.

DO $$
DECLARE
  r record;
  names text[] := ARRAY[
    'bulk_insert_toll_ledger',
    'try_claim_week_close',
    'release_week_close_lock',
    'compute_source_coverage',
    'list_week_source_summaries',
    'fleet_compute_vehicle_tag_balance',
    -- Adjacent same-bug sweep (toll tag balance rows)
    'fleet_toll_tag_balance_rows'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY (names)
      AND n.nspname = 'public'
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

NOTIFY pgrst, 'reload schema';
