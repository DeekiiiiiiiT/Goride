/**
 * F-03: fuel lines — one per car × kind of driving × locked week, written before the lock (F-05)
 * for weeks charged by fuel engine v3. A driver's fuel charge is the sum of their lines and
 * nothing else: before writing, every driver's lines must equal their statement amount to the
 * cent, or the week does not lock. Weeks charged by v2.2 have no lines (forward only).
 */
import { getServiceClient } from "./service_client.ts";

export const FUEL_V3_ENGINE = "fuel-chain-v3";

export type FuelWeekLineRow = {
  vehicle_id: string;
  driver_id: string;
  purpose: string;
  km: number;
  cost_per_km_minor: number | null;
  driver_pct: number;
  driver_amount_minor: number;
  company_amount_minor: number;
  policy_version_id: string | null;
  engine_version: string;
};

type Snap = Record<string, unknown> & { metadata?: Record<string, unknown> };
type V3Line = {
  vehicleId?: string;
  purpose: string;
  km: number;
  costPerKm: number | null;
  costMinor: number;
  driverPct: number;
  driverMinor: number;
  companyMinor: number;
};

/** The week was charged by v3 (the switch was on when its snapshot was worked out). */
export function snapshotsChargedByV3(snapshots: Snap[]): boolean {
  return snapshots.some((s) => s?.metadata?.chargedBy === FUEL_V3_ENGINE);
}

const cents = (j: unknown) => Math.round((Number(j) || 0) * 100);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** F-11: the rule version that priced this report (a real version window id), else null. */
export function policyVersionIdOf(snap: Snap): string | null {
  const v = (snap?.metadata?.fuelPolicyVersion as { versionId?: unknown } | undefined)?.versionId;
  const id = typeof v === "string" ? v.trim() : "";
  return UUID_RE.test(id) ? id : null;
}

/**
 * Lines for every v3-charged report. Throws FUEL_LINES_MISMATCH (naming the driver) when a
 * driver's lines don't add up to the report's driver share and company share — the amounts the
 * statement and the period are written from.
 */
export function buildFuelWeekLineRows(snapshots: Snap[]): FuelWeekLineRow[] {
  const rows: FuelWeekLineRow[] = [];
  for (const snap of snapshots) {
    if (snap?.metadata?.chargedBy !== FUEL_V3_ENGINE) continue;
    const driverId = String(snap.driverId || "").trim();
    const v3 = snap.metadata?.fuelV3 as { lines?: V3Line[]; engineVersion?: string } | undefined;
    const lines = Array.isArray(v3?.lines) ? v3!.lines : [];
    const policyVersionId = policyVersionIdOf(snap);
    let driverSum = 0;
    let companySum = 0;
    for (const l of lines) {
      if (!(l.costMinor > 0)) continue;
      driverSum += l.driverMinor;
      companySum += l.companyMinor;
      rows.push({
        vehicle_id: String(l.vehicleId || snap.vehicleId || ""),
        driver_id: driverId,
        purpose: l.purpose,
        km: Number(l.km) || 0,
        cost_per_km_minor: l.costPerKm != null && l.km > 0 ? l.costPerKm * 100 : null,
        driver_pct: Math.max(0, Math.min(100, Number(l.driverPct) || 0)),
        driver_amount_minor: l.driverMinor,
        company_amount_minor: l.companyMinor,
        policy_version_id: policyVersionId,
        engine_version: String(v3?.engineVersion || FUEL_V3_ENGINE),
      });
    }
    if (driverSum !== cents(snap.driverShare) || companySum !== cents(snap.companyShare)) {
      const err = new Error(
        `FUEL_LINES_MISMATCH: driver ${driverId} lines ${driverSum}/${companySum} vs shares ${cents(snap.driverShare)}/${cents(snap.companyShare)}`,
      );
      (err as Error & { driverId?: string }).driverId = driverId;
      throw err;
    }
  }
  return rows;
}

export async function writeFuelWeekLines(args: {
  orgId: string;
  periodId: string;
  weekStart: string;
  rows: FuelWeekLineRow[];
}): Promise<number> {
  const { data, error } = await getServiceClient().rpc("fuel_write_week_lines", {
    p_org: args.orgId,
    p_period_id: args.periodId,
    p_week_start: args.weekStart,
    p_lines: args.rows,
  });
  if (error) throw new Error(`fuel lines write failed: ${error.message}`);
  return Number(data) || 0;
}

/** Reopen: the period's current lines are marked reversed (kept, never edited). */
export async function reverseFuelWeekLines(args: {
  orgId: string;
  periodId: string;
  reason: string;
}): Promise<number> {
  const { data, error } = await getServiceClient().rpc("fuel_reverse_week_lines", {
    p_org: args.orgId,
    p_period_id: args.periodId,
    p_reason: args.reason,
  });
  if (error) throw new Error(`fuel lines reverse failed: ${error.message}`);
  return Number(data) || 0;
}
