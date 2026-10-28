-- Advisor remediation Phase B: revoke client EXECUTE on money/ops SECURITY DEFINER RPCs.
-- Edge uses service_role only. Keep authenticated EXECUTE on RLS-used RBAC helpers.

-- ---------------------------------------------------------------------------
-- 1. Revoke PUBLIC/anon/authenticated; grant service_role on audited ops RPCs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  names text[] := ARRAY[
    'ledger_post_entry',
    'ledger_delete_entries',
    'ledger_post_financial_event',
    'ledger_delete_source_receipts',
    'ledger_reverse_entry',
    'ledger_backfill_kv_ledger_event_batch',
    'ledger_reconcile_amounts',
    'ledger_backfill_rides_payment_journal_batch',
    'ledger_reconcile_islands',
    'ledger_count_entries_by_batch',
    'ledger_soak_status',
    'rides_post_payment_journal_line',
    'toll_settlement_apply',
    'toll_settlement_reverse',
    'rides_apply_pending_driver_debt',
    'rides_create_ride_request',
    'rides_patch_ride_request',
    'rides_cancel_ride_request',
    'rides_insert_driver_offer',
    'rides_insert_location_update',
    'rides_patch_driver_offer',
    'rides_upsert_driver_presence',
    'rides_supersede_pending_offers',
    'rides_upsert_surge_cell',
    'rides_expire_pending_offers',
    'rides_read_surge_multiplier',
    'rides_expire_all_pending_offers',
    'rides_rider_has_active_ride',
    'rides_expire_driver_pending_offers',
    'rides_dispatch_due_scheduled_rides',
    'rides_cancel_stale_matching_rides',
    'rides_run_cash_settlement_timeout',
    'rides_run_matching_hygiene',
    'rides_fare_rules_instead_delete',
    'rides_vehicle_types_instead_delete',
    'matching_accept_driver_offer',
    'logistics_accept_job_offer',
    'edge_insert_vehicle_catalog_row',
    'auto_create_organization_for_fleet_owner',
    'accrue_storage_days',
    'purge_order_messages_retention',
    'upsert_identity_for_user',
    'reconcile_identities'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY (names)
      AND n.nspname IN ('public', 'platform', 'freight', 'delivery', 'rides', 'ledger', 'matching', 'logistics', 'toll', 'fleet')
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

-- ---------------------------------------------------------------------------
-- 2. RBAC helpers: revoke anon only; keep authenticated for RLS policy evaluation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  names text[] := ARRAY[
    'rbac_user_has_product_access',
    'rbac_user_max_role_level',
    'rbac_user_permission_keys',
    'rbac_user_has_permission',
    'rbac_is_platform_user',
    'user_has_permission',
    'user_max_role_level',
    'user_permission_keys',
    'is_platform_user',
    'user_has_product_access',
    'current_user_is_platform_staff',
    'current_user_is_platform_owner'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY (names)
      AND n.nspname IN ('public', 'platform')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.schema_name,
      r.func_name,
      pg_get_function_identity_arguments(r.oid)
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      r.schema_name,
      r.func_name,
      pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;
