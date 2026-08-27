-- Advisor remediation Phase B2: remaining anon SECURITY DEFINER EXECUTE cleanup
-- - Money/trigger funcs in non-public schemas: service_role only
-- - RLS oracle helpers: revoke anon; keep authenticated

DO $$
DECLARE
  r record;
BEGIN
  -- Service-role / trigger-only
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('ledger', 'post_financial_event'),
      ('ledger', 'reverse_entry'),
      ('ledger', 'mark_reversed_on_reverse'),
      ('public', 'driver_profiles_freeze_dispatch_pilot'),
      ('public', 'driver_profiles_freeze_wallet_flags')
    )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.schema_name, r.func_name, pg_get_function_identity_arguments(r.oid)
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.schema_name, r.func_name, pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;

  -- RLS helpers: authenticated + service_role only
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname, p.proname) IN (
      ('delivery', 'current_user_inventory_company_ids'),
      ('delivery', 'current_user_inventory_merchant_ids'),
      ('delivery', 'current_user_inventory_node_ids'),
      ('freight', 'org_has_active_link'),
      ('freight', 'user_can_see_package'),
      ('freight', 'user_owns_org'),
      ('logistics', 'user_owns_org')
    )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.schema_name, r.func_name, pg_get_function_identity_arguments(r.oid)
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
      r.schema_name, r.func_name, pg_get_function_identity_arguments(r.oid)
    );
  END LOOP;
END $$;
