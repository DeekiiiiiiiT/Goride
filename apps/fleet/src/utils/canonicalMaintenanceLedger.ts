/**
 * Pure builder: completed maintenance_records → canonical ledger_event payload.
 * Quotes live in supplier_part_offer and never reach this path.
 */

export type MaintenanceLedgerRecordInput = {
  id?: unknown;
  vehicleId?: unknown;
  vehicle_id?: unknown;
  date?: unknown;
  performed_at_date?: unknown;
  cost?: unknown;
  status?: unknown;
  currency?: unknown;
  service_type?: unknown;
  serviceType?: unknown;
  type?: unknown;
  provider?: unknown;
};

function coerceAmount(amount: unknown): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n : 0;
}

function normalizeYmd(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const date = s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Only completed service logs with positive cost post to the books. */
export function isMaintenanceLedgerEligible(record: MaintenanceLedgerRecordInput): boolean {
  const id = String(record.id ?? "").trim();
  if (!id) return false;
  const vehicleId = String(record.vehicleId ?? record.vehicle_id ?? "").trim();
  if (!vehicleId) return false;
  if (!normalizeYmd(record.performed_at_date ?? record.date)) return false;
  const status = String(record.status ?? "").trim().toLowerCase();
  if (status !== "completed") return false;
  return coerceAmount(record.cost) > 1e-9;
}

/**
 * Build a canonical maintenance outflow event, or null if ineligible.
 * sourceType financial_event — not a KV transaction.
 */
export function buildCanonicalMaintenanceEvent(
  record: MaintenanceLedgerRecordInput,
): Record<string, unknown> | null {
  if (!isMaintenanceLedgerEligible(record)) return null;

  const id = String(record.id ?? "").trim();
  const vehicleId = String(record.vehicleId ?? record.vehicle_id ?? "").trim();
  const date = normalizeYmd(record.performed_at_date ?? record.date)!;
  const amt = Math.abs(coerceAmount(record.cost));
  const currencyRaw = String(record.currency ?? "JMD").trim().toUpperCase();
  const currency = currencyRaw || "JMD";
  const serviceType = String(
    record.service_type ?? record.serviceType ?? record.type ?? "",
  ).trim();
  const provider = String(record.provider ?? "").trim();
  const description =
    serviceType && provider
      ? `${serviceType} — ${provider}`
      : serviceType || provider || "Maintenance";

  return {
    idempotencyKey: `maintenance_record:${id}|maintenance`,
    date,
    driverId: "fleet",
    eventType: "maintenance",
    direction: "outflow",
    netAmount: amt,
    grossAmount: amt,
    currency,
    sourceType: "financial_event",
    sourceId: id,
    vehicleId,
    platform: "Roam",
    description,
    metadata: {
      maintenanceRecordId: id,
      recognitionBasis: "performed_at_date",
      serviceType: serviceType || undefined,
      provider: provider || undefined,
    },
  };
}
