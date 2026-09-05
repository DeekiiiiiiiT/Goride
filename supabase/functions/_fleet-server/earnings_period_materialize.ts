/**
 * Earnings period materialization (Phase 3).
 * Incremental path for weekly rollups. Call from ledger write or nightly jobs.
 * History API already prefers mode=periods for weekly grain.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export type EarningsPeriodMaterializeRow = {
  driverId: string;
  periodAnchor: string;
  periodEnd?: string;
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  tripCount: number;
  tierId?: string | null;
  tierName?: string | null;
  fuelDeduction: number;
  payoutNet: number;
  metadata?: Record<string, unknown>;
};

/**
 * Upsert a single period rollup for a driver.
 * Safe for concurrent write path; uses period_anchor as unique key.
 */
export async function upsertEarningsPeriodMaterialize(
  row: EarningsPeriodMaterializeRow,
): Promise<void> {
  const periodAnchor = String(row.periodAnchor || "").slice(0, 10);
  if (!row.driverId || !periodAnchor) return;

  const payload = {
    driver_id: row.driverId,
    period_anchor: periodAnchor,
    period_end: row.periodEnd || periodAnchor,
    earnings_gross: Math.round((row.earningsGross || 0) * 100),
    driver_share: Math.round((row.driverShare || 0) * 100),
    fleet_share: Math.round((row.fleetShare || 0) * 100),
    driver_share_percent: row.driverSharePercent || 0,
    trip_count: Math.max(0, Math.floor(row.tripCount || 0)),
    tier_id: row.tierId || null,
    tier_name: row.tierName || null,
    fuel_deduction: Math.round((row.fuelDeduction || 0) * 100),
    payout_net: Math.round((row.payoutNet || 0) * 100),
    metadata: row.metadata || {},
  };

  try {
    const { error } = await sb()
      .from("driver_financial_periods")
      .upsert(payload, { onConflict: "driver_id,period_anchor" });
    if (error) {
      console.warn("[earnings_period_materialize] upsert failed:", error.message);
    }
  } catch (e: any) {
    console.warn("[earnings_period_materialize] upsert error:", e?.message || e);
  }
}

/**
 * Daily-to-weekly rollup helper: sum daily earnings into weekly buckets.
 * Use when rebuilding sparse daily history without the full ledger scan.
 */
export function rollupDailyEarningsToWeekly(
  dailyRows: Array<{ periodStart: string; earningsGross: number; tripCount: number; driverShare: number }>,
): EarningsPeriodMaterializeRow[] {
  const weeks = new Map<string, EarningsPeriodMaterializeRow>();
  for (const d of dailyRows) {
    const dDate = new Date(d.periodStart + "T12:00:00");
    const day = dDate.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(dDate);
    monday.setUTCDate(monday.getUTCDate() + diff);
    const weekStart = monday.toISOString().slice(0, 10);
    const existing = weeks.get(weekStart) || {
      driverId: "",
      periodAnchor: weekStart,
      earningsGross: 0,
      driverShare: 0,
      fleetShare: 0,
      driverSharePercent: 0,
      tripCount: 0,
      fuelDeduction: 0,
      payoutNet: 0,
    };
    existing.earningsGross += d.earningsGross || 0;
    existing.driverShare += d.driverShare || 0;
    existing.tripCount += d.tripCount || 0;
    weeks.set(weekStart, existing);
  }
  return Array.from(weeks.values());
}
