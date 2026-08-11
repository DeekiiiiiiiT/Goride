/**
 * Fleet table strangler flags.
 * Per-domain:
 * - FLEET_TABLE_WRITE_<DOMAIN>=0 to stop mirroring KV→table
 * - FLEET_READ_TABLE_<DOMAIN>=1 to read from fleet.* tables
 * - LEGACY_KV_WRITE_<DOMAIN>=0 to stop writing the KV prefix
 */
function envTruthy(name: string): boolean {
  const v = Deno.env.get(name);
  return v === "1" || v === "true" || v === "yes";
}

function envFlag(name: string, defaultOn: boolean): boolean {
  const v = Deno.env.get(name);
  if (v === undefined || v === "") return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

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

function domainKey(domain: FleetDomain): string {
  return domain.toUpperCase();
}

/** Mirror KV upserts into fleet.* tables. Default ON. */
export function isFleetTableWriteEnabled(domain: FleetDomain): boolean {
  return envFlag(`FLEET_TABLE_WRITE_${domainKey(domain)}`, true);
}

/** Read from fleet.* instead of KV. Default OFF until soak. */
export function isFleetReadTableEnabled(domain: FleetDomain): boolean {
  return envTruthy(`FLEET_READ_TABLE_${domainKey(domain)}`);
}

/** Write to KV prefix. Default ON until retirement. */
export function isLegacyKvWriteEnabled(domain: FleetDomain): boolean {
  return envFlag(`LEGACY_KV_WRITE_${domainKey(domain)}`, true);
}
