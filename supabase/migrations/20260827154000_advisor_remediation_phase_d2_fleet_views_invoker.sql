-- Advisor remediation Phase D2: remaining fleet/ops views → security_invoker + revoke anon SELECT

DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'rides_dispatch_settings',
    'enterprise_rideshare_orgs_audit',
    'fleet_drivers',
    'fleet_vehicles',
    'fleet_driver_metrics',
    'fleet_vehicle_metrics',
    'fleet_trips',
    'fleet_import_batches',
    'fleet_import_metadata',
    'fleet_import_insights',
    'fleet_toll_tags',
    'fleet_toll_plazas',
    'fleet_fuel_cards',
    'fleet_stations',
    'fleet_fuel_adjustments',
    'fleet_fuel_entries',
    'fleet_fuel_disputes',
    'fleet_fixed_expenses',
    'fleet_expense_rule_groups',
    'fleet_expense_rule_assignments',
    'fleet_platform_vendors',
    'fleet_expense_categories',
    'fleet_claims',
    'fleet_earnings_policies',
    'fleet_equipment',
    'fleet_inventory',
    'fleet_odometer_readings',
    'fleet_organization_settings',
    'fleet_checkins',
    'fleet_preferences',
    'fleet_integrations',
    'fleet_ledger_config',
    'fleet_maintenance_logs',
    'fleet_dual_write_metrics'
  ];
BEGIN
  FOREACH v IN ARRAY views
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', v);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', v);
    END IF;
  END LOOP;
END $$;
