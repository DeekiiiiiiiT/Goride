/**
 * Single source of truth for Factory Reset KV prefixes.
 * When adding a new data type that uses kv.set(`prefix:…`), add it here.
 */
export const FACTORY_RESET_PREFIXES = [
  'trip:',
  'batch:',
  'driver:',
  'driver_metric:',
  'vehicle:',
  'vehicle_metric:',
  'transaction:',
  'fuel_entry:',
  'fuel_card:',
  'station:',
  'learnt_location:',
  'toll_tag:',
  'toll_plaza:',
  'toll_ledger:',
  'claim:',
  'equipment:',
  'inventory:',
  'maintenance_log:',
  'odometer_reading:',
  'checkin:',
  'organization_metric:',
  'ledger_event:',
  'ledger_event_idem:',
  // Uber payment-line imports
  'payment_ledger_line:',
  'payment_ledger_line-dedup:',
  'driver_period_snapshot:',
  // Dispute refunds
  'dispute-refund:',
  'dispute-refund-dedup:',
  // Expense Hub
  'expense_audit:',
  'fixed_expense:',
  'expense_doc:',
  'expense_payment:',
  'expense_journal:',
  // Org settings
  'organization_settings:',
] as const;

export type FactoryResetPrefix = (typeof FACTORY_RESET_PREFIXES)[number];
