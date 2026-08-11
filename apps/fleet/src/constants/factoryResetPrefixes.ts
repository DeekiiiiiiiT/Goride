/**
 * Single source of truth for Factory Reset KV prefixes.
 * Fleet business domains were retired from KV (2026-08-11) → wipe FACTORY_RESET_FLEET_TABLES.
 * Keep only still-active KV prefixes + strangler backups here.
 */
export const FACTORY_RESET_PREFIXES = [
  // Not migrated into fleet.* (or still ephemeral / alias caches)
  'maintenance_log:',
  'organization_metric:',
  // Money ledger KV leftovers (SSOT is ledger.entries — wipe if any remain)
  'ledger_event:',
  'ledger_event_idem:',
  // Dedup / dispute helpers still on KV by design
  'payment_ledger_line-dedup:',
  'dispute-refund:',
  'dispute-refund-dedup:',
  'expense_audit:',
  // Strangler backups from retire-fleet-kv-prefix
  'fleet_kv_backup:',
] as const;

/** Tables to TRUNCATE when factory-resetting after a domain has retired KV. */
export const FACTORY_RESET_FLEET_TABLES = [
  'drivers',
  'vehicles',
  'driver_metrics',
  'vehicle_metrics',
  'trips',
  'import_batches',
  'import_metadata',
  'import_insights',
  'payment_ledger_lines',
  'driver_period_snapshots',
  'toll_ledger',
  'toll_tags',
  'toll_plazas',
  'fuel_entries',
  'fuel_cards',
  'stations',
  'fuel_adjustments',
  'fuel_disputes',
  'expense_documents',
  'expense_payments',
  'transactions',
  'fixed_expenses',
  'expense_rule_groups',
  'expense_rule_assignments',
  'expense_journal',
  'bank_statements',
  'bank_confirmations',
  'platform_vendors',
  'expense_categories',
  'claims',
  'earnings_policies',
  'equipment',
  'inventory',
  'checkins',
  'odometer_readings',
  'organization_settings',
  'preferences',
  'integrations',
  'ledger_config',
] as const;

export type FactoryResetPrefix = (typeof FACTORY_RESET_PREFIXES)[number];
export type FactoryResetFleetTable = (typeof FACTORY_RESET_FLEET_TABLES)[number];
