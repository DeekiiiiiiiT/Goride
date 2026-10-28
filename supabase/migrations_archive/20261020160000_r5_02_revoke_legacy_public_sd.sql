-- R5-02: Revoke EXECUTE on legacy public SECURITY DEFINER RPCs from anon/authenticated.
-- REVOKE FROM PUBLIC alone leaves Supabase default grants. Also close default privileges
-- so new public functions start without anon/authenticated EXECUTE.

DO $$
DECLARE
  r record;
  names text[] := ARRAY[
    -- Write money state
    'rush_post_journal',
    'rush_transition_money_state',
    'rush_lock_week',
    'rush_lock_lines',
    'rush_week_payable',
    'freeze_settlement_periods_batch',
    'fleet_rebuild_operational_periods',
    -- Change fleet state
    'fleet_assign_toll_tag',
    'fleet_unassign_toll_tag',
    'fleet_retire_toll_tag',
    'fleet_scan_toll_low_balances',
    'delivery_refresh_surge_now',
    -- Read another org's data / live locations
    'fleet_driver_lifetime_totals',
    'fleet_fare_earnings_by_driver',
    'fleet_period_earnings_by_driver',
    'fleet_operational_rollup_by_driver',
    'fleet_trip_status_buckets_by_driver',
    'sum_settlement_queue_totals',
    'delivery_couriers_in_h3_cells',
    'rides_drivers_in_h3_cells'
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

-- New functions created by postgres in public start closed to anon/authenticated.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Live privilege audit for finance-doctor (R5-02).
CREATE OR REPLACE FUNCTION public.finance_doctor_anon_execute_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  names text[] := ARRAY[
    'bulk_insert_toll_ledger',
    'try_claim_week_close',
    'release_week_close_lock',
    'compute_source_coverage',
    'list_week_source_summaries',
    'fleet_compute_vehicle_tag_balance',
    'fleet_toll_tag_balance_rows',
    'rush_post_journal',
    'rush_transition_money_state',
    'rush_lock_week',
    'rush_lock_lines',
    'rush_week_payable',
    'freeze_settlement_periods_batch',
    'fleet_rebuild_operational_periods',
    'fleet_assign_toll_tag',
    'fleet_unassign_toll_tag',
    'fleet_retire_toll_tag',
    'fleet_scan_toll_low_balances',
    'delivery_refresh_surge_now',
    'fleet_driver_lifetime_totals',
    'fleet_fare_earnings_by_driver',
    'fleet_period_earnings_by_driver',
    'fleet_operational_rollup_by_driver',
    'fleet_trip_status_buckets_by_driver',
    'sum_settlement_queue_totals',
    'delivery_couriers_in_h3_cells',
    'rides_drivers_in_h3_cells'
  ];
  leaks jsonb := '[]'::jsonb;
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (names)
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      leaks := leaks || jsonb_build_array(jsonb_build_object(
        'proname', r.proname,
        'args', r.args,
        'anon', has_function_privilege('anon', r.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', r.oid, 'EXECUTE')
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(leaks) = 0,
    'leaks', leaks,
    'checked', names
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_doctor_anon_execute_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_doctor_anon_execute_audit() TO service_role;

NOTIFY pgrst, 'reload schema';
