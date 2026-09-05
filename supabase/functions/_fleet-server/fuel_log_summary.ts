/**
 * Server Transaction Logs KPI roll-up.
 * Keep in sync with apps/fleet/src/utils/fuelLogSummaryCore.ts
 */

export type FuelLogSummaryEntry = {
  id?: string;
  date?: string;
  amount?: number | null;
  liters?: number | null;
  odometer?: number | null;
  vehicleId?: string;
  type?: string;
  entryMode?: string;
  paymentSource?: string;
  entrySource?: string;
  metadata?: Record<string, unknown> | null;
  geofenceMetadata?: unknown;
  source?: string;
};

export type FuelLogSummaryTotals = {
  totalFills: number;
  totalSpend: number;
  totalVolume: number;
  totalKm: number;
  sourcePortal: number;
  sourceAdmin: number;
  sourceAnchors: number;
};

const STATEMENT_IMPORT_SOURCES = new Set([
  "jaa_raw",
  "jaa_statement_details",
  "fuel_statement",
]);

const AUTH_SOURCES = new Set([
  "driver-portal",
  "admin-manual",
  "admin-edit",
  "bulk-import",
  "fuel-card",
]);

function metaOf(entry: FuelLogSummaryEntry): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

export function isJaaStatementLedgerRowCore(entry: FuelLogSummaryEntry): boolean {
  const m = metaOf(entry);
  const importSource = String(m.importSource || "");
  if (STATEMENT_IMPORT_SOURCES.has(importSource)) return true;
  const rowKind = m.jaaRowKind;
  const entrySource = entry.entrySource ?? m.entrySource;
  if (rowKind != null && entrySource !== "driver-portal") return true;
  return false;
}

function isGasCardFuelEntryCore(entry: FuelLogSummaryEntry): boolean {
  if (entry.paymentSource === "Gas_Card") return true;
  if (
    entry.paymentSource === "RideShare_Cash" ||
    entry.paymentSource === "Personal" ||
    entry.paymentSource === "Petty_Cash"
  ) {
    return false;
  }
  if (entry.type === "Card_Transaction") return true;
  return false;
}

function countsInGasCardSpendCore(entry: FuelLogSummaryEntry): boolean {
  if (!isGasCardFuelEntryCore(entry)) return false;
  const meta = metaOf(entry);
  if (meta.jaaRowKind === "fee" || meta.jaaRowKind === "declined") return false;
  if (meta.countsInFuelSpend === false) return false;
  if (meta.awaitingCardStatement) return false;
  return (Number(entry.amount) || 0) > 0;
}

export function countsInFuelLogSpendCore(entry: FuelLogSummaryEntry): boolean {
  const meta = metaOf(entry);
  if (meta.jaaRowKind === "fee" || meta.jaaRowKind === "declined") return false;
  if (meta.awaitingCardStatement) return false;
  if (meta.countsInFuelSpend === false) return false;
  if (isGasCardFuelEntryCore(entry)) return countsInGasCardSpendCore(entry);
  return true;
}

function asAuthSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return AUTH_SOURCES.has(value) ? value : null;
}

export function resolveFuelEntrySourceCore(entry: FuelLogSummaryEntry): string {
  const m = metaOf(entry);
  const explicit = asAuthSource(entry.entrySource) || asAuthSource(m.entrySource);
  if (explicit) return explicit;

  const metaSource = m.source;
  if (metaSource === "Bulk Manual" || metaSource === "Bulk Log") return "bulk-import";
  if (metaSource === "Manual") return "admin-manual";

  if (entry.type === "Card_Transaction") return "fuel-card";

  const topSource = entry.source;
  if (
    topSource === "Manual Approval" ||
    metaSource === "Manual Approval" ||
    entry.type === "Reimbursement"
  ) {
    return "driver-portal";
  }

  const isFromPortal =
    topSource === "Driver Portal" ||
    entry.type === "Manual_Entry" ||
    entry.geofenceMetadata != null;

  if (isFromPortal) {
    const wasAdminEdited = m.isEdited === true || m.previousPaymentSource != null;
    return wasAdminEdited ? "admin-edit" : "driver-portal";
  }

  if (
    entry.type === "Fuel_Manual_Entry" &&
    (metaSource === "Fuel Log" || topSource === "Fuel Log")
  ) {
    return "admin-manual";
  }

  return "driver-portal";
}

function isValidOdo(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function sumOdometerDeltasBetweenFillsCore(
  entries: FuelLogSummaryEntry[],
): number {
  const byVehicle = new Map<string, FuelLogSummaryEntry[]>();
  for (const e of entries) {
    if (isJaaStatementLedgerRowCore(e)) continue;
    const key = e.vehicleId || "unknown";
    if (!byVehicle.has(key)) byVehicle.set(key, []);
    byVehicle.get(key)!.push(e);
  }

  let totalKm = 0;
  for (const list of byVehicle.values()) {
    list.sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da !== db) return da.localeCompare(db);
      return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
    });
    let lastOdo: number | null = null;
    for (const e of list) {
      const odo = Number(e.odometer);
      if (!isValidOdo(odo)) {
        lastOdo = null;
        continue;
      }
      if (lastOdo != null && odo >= lastOdo) {
        totalKm += odo - lastOdo;
      }
      lastOdo = odo;
    }
  }
  return Math.round(totalKm * 100) / 100;
}

function looksLikeAnchor(entry: FuelLogSummaryEntry): boolean {
  const mode = String(entry.entryMode || metaOf(entry).entryMode || "");
  return mode === "Anchor" || mode === "Capacity";
}

export function summarizeFuelLogEntries(
  entries: FuelLogSummaryEntry[] | null | undefined,
  opts?: { validAnchorIds?: Set<string> },
): FuelLogSummaryTotals {
  const periodEntries = (entries ?? []).filter((e) => !isJaaStatementLedgerRowCore(e));

  let sourcePortal = 0;
  let sourceAdmin = 0;
  let sourceAnchors = 0;
  for (const e of periodEntries) {
    const src = resolveFuelEntrySourceCore(e);
    if (src === "driver-portal") sourcePortal += 1;
    if (src === "admin-manual" || src === "admin-edit") sourceAdmin += 1;
    if (opts?.validAnchorIds?.has(String(e.id || ""))) sourceAnchors += 1;
    else if (!opts?.validAnchorIds && looksLikeAnchor(e)) sourceAnchors += 1;
  }

  const spendScope = periodEntries.filter(countsInFuelLogSpendCore);
  const totalSpend = spendScope.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalVolume = spendScope.reduce((s, e) => s + (Number(e.liters) || 0), 0);
  const totalKm = sumOdometerDeltasBetweenFillsCore(periodEntries);

  return {
    totalFills: periodEntries.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalKm,
    sourcePortal,
    sourceAdmin,
    sourceAnchors,
  };
}
