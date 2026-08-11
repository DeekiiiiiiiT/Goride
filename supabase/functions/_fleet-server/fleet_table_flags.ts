/**
 * Fleet table strangler flags — permanent cutover to fleet.* tables.
 * KV is no longer the source of truth for mapped domains.
 */
export type FleetDomain =
  | "drivers"
  | "vehicles"
  | "driver_metrics"
  | "vehicle_metrics"
  | "trips"
  | "import_batches"
  | "import_metadata"
  | "import_insights"
  | "payment_ledger_lines"
  | "driver_period_snapshots"
  | "toll_ledger"
  | "toll_tags"
  | "toll_plazas"
  | "fuel_entries"
  | "fuel_cards"
  | "stations"
  | "fuel_adjustments"
  | "fuel_disputes"
  | "expense_documents"
  | "expense_payments"
  | "transactions"
  | "fixed_expenses"
  | "expense_rule_groups"
  | "expense_rule_assignments"
  | "expense_journal"
  | "bank_statements"
  | "bank_confirmations"
  | "platform_vendors"
  | "expense_categories"
  | "claims"
  | "earnings_policies"
  | "equipment"
  | "inventory"
  | "checkins"
  | "odometer_readings"
  | "organization_settings"
  | "preferences"
  | "integrations"
  | "ledger_config";

/** Always write fleet.* tables. */
export function isFleetTableWriteEnabled(_domain: FleetDomain): boolean {
  return true;
}

/** Always read fleet.* tables. */
export function isFleetReadTableEnabled(_domain: FleetDomain): boolean {
  return true;
}

/** Never write mapped domains back to KV. */
export function isLegacyKvWriteEnabled(_domain: FleetDomain): boolean {
  return false;
}
