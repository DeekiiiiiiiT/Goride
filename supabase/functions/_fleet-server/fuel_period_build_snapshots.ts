/**
 * Server-side FinalizedFuelReport snapshot builder for auto-close.
 * Emergency / entries-mode path: shared fuel-core assembler with explicit 50% default rule
 * (stamped entry ratios still win via resolveEntryDriverRatio).
 */
import { assembleWeekSnapshotsFromRawEntries } from "../_shared/fuelCore.ts";
import { isJaaStatementLedgerRow } from "./fuel_jaa_ledger.ts";

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

function inWeek(dateYmd: string, weekStart: string, weekEnd: string): boolean {
  return Boolean(dateYmd) && dateYmd >= weekStart && dateYmd <= weekEnd;
}

export type BuiltSnapshot = Record<string, unknown>;

export type BuildSnapshotsResult = {
  ok: boolean;
  snapshots: BuiltSnapshot[];
  totalSpend: number;
  error?: string;
};

function entryAmount(e: Record<string, unknown>): number {
  return Number(e.amount) || Number(e.cost) || 0;
}

function resolveDriverId(e: Record<string, unknown>): string {
  return String(e.driverId || e.driver_id || e.currentDriverId || "").trim();
}

function entryDriverShareRatio(e: Record<string, unknown>): number | null {
  const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<
    string,
    unknown
  >;
  const stamped = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
  if (Number.isFinite(stamped) && stamped >= 0 && stamped <= 1) return stamped;
  return null;
}

/** Org-scoped week entries eligible for settlement. A failed read throws — never an empty week. */
export async function loadWeekFuelEntries(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<Record<string, unknown>[]> {
  const { queryFleet } = await import("./repos/baseRepo.ts");
  const page = 1000;
  const raw: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const res = await queryFleet("fuel_entries", {
      org: orgId,
      dateFrom: weekStart,
      dateTo: weekEnd,
      limit: page,
      offset,
    });
    if (res.error) throw res.error;
    const rows = (res.data || []) as Record<string, unknown>[];
    raw.push(...rows);
    if (rows.length < page) break;
    offset += rows.length;
    if (offset > 50000) break;
  }
  return raw.filter((e) => {
    // F2: statement ledger rows stay on Card Inventory — money lives on the ops row after match.
    if (isJaaStatementLedgerRow(e as { entrySource?: string; metadata?: Record<string, unknown> })) {
      return false;
    }
    const d = ymd(e.date);
    if (!inWeek(d, weekStart, weekEnd)) return false;
    const status = String(e.reconciliationStatus || e.reconciliation_status || "Pending");
    return status === "Pending" || status === "Verified" || Boolean((e.metadata as any)?.finalizedByReport);
  });
}

/**
 * Build one FinalizedFuelReport-shaped snapshot per driver with pending fills.
 * Money math via @roam/fuel-core (50% company default when no stamped ratio / rule).
 */
export function assembleSnapshotsFromEntries(
  entries: Record<string, unknown>[],
  weekStart: string,
  weekEnd: string,
  orgId: string,
): BuiltSnapshot[] {
  const snaps = assembleWeekSnapshotsFromRawEntries({
    weekStart,
    weekEnd,
    orgId,
    entries: entries.map((e) => ({
      id: String(e.id),
      amount: entryAmount(e),
      date: ymd(e.date),
      driverId: resolveDriverId(e),
      vehicleId: String(e.vehicleId || e.vehicle_id || ""),
      reconciliationStatus: String(e.reconciliationStatus || e.reconciliation_status || "Pending"),
      driverShareRatio: entryDriverShareRatio(e),
      paymentSource: (e.paymentSource || e.payment_source || null) as string | null,
      type: String(e.type || ""),
      entrySource: String(e.entrySource || e.entry_source || ""),
      metadata: e.metadata,
    })),
    builtBy: "fuel_period_build_snapshots",
  });
  return snaps as BuiltSnapshot[];
}

/** Full build for a period week — used by route + auto-close. Same engine as /compute. */
export async function buildFuelPeriodSnapshots(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
}): Promise<BuildSnapshotsResult> {
  const { prepareFuelWeekReports } = await import("./fuel_week_prepare.ts");
  const prepared = await prepareFuelWeekReports(input);
  if (!prepared.ok) {
    return { ok: false, snapshots: [], totalSpend: 0, error: prepared.error };
  }
  return {
    ok: true,
    snapshots: prepared.reports as BuildSnapshotsResult["snapshots"],
    totalSpend: prepared.totalSpend,
  };
}
