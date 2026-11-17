/**
 * WRA-71: per-day InDrive trips logged in fleet (Step 1 card lines).
 */
import { getServiceClient } from "./service_client.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";

export type IndriveLoggedDay = {
  day: string;
  tripCount: number;
  amountMajor: number;
};

/** Group hand-logged / live InDrive trips by calendar day for one week. */
export async function loadIndriveLoggedDaysForWeek(
  orgId: string,
  weekKey: string,
): Promise<IndriveLoggedDay[]> {
  const end = periodEndForAnchor(weekKey);
  const { data, error } = await getServiceClient()
    .from("fleet_trips")
    .select("id, date, amount, service_line, platform")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .ilike("platform", "%indrive%")
    .limit(100000);
  if (error) {
    console.warn("[recon] indrive logged days query failed", error.message);
    return [];
  }

  const byDay = new Map<string, { tripCount: number; amountMajor: number }>();
  for (const row of data ?? []) {
    const serviceLine = String((row as { service_line?: string }).service_line || "rideshare");
    if (serviceLine === "rush_delivery") continue;
    const day = String((row as { date?: string }).date || "").slice(0, 10);
    if (!day) continue;
    const prev = byDay.get(day) ?? { tripCount: 0, amountMajor: 0 };
    prev.tripCount += 1;
    prev.amountMajor += Math.abs(Number((row as { amount?: number }).amount) || 0);
    byDay.set(day, prev);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, stats]) => ({
      day,
      tripCount: stats.tripCount,
      amountMajor: Math.round(stats.amountMajor * 100) / 100,
    }));
}