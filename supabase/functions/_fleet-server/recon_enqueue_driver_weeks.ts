/**
 * WRA-67: queue driver_week units after a lane seal so step 7 follows statements.
 */
import { getServiceClient } from "./service_client.ts";

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function enqueueDriverWeekUnitsForWeek(
  orgId: string,
  weekKey: string,
  reason: string,
): Promise<{ enqueued: number; errors: string[] }> {
  const week = String(weekKey || "").slice(0, 10);
  if (!orgId || !WEEK_RE.test(week)) {
    return { enqueued: 0, errors: ["invalid org or week"] };
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("driver_financial_periods")
    .select("driver_id")
    .eq("organization_id", orgId)
    .eq("period_anchor", week);
  if (error) throw new Error(error.message);

  const driverIds = [
    ...new Set(
      (data ?? [])
        .map((r) => String((r as { driver_id?: unknown }).driver_id || ""))
        .filter(Boolean),
    ),
  ];

  const errors: string[] = [];
  let enqueued = 0;
  for (const driverId of driverIds) {
    const { error: rpcErr } = await sb.rpc("recon_enqueue_unit", {
      p_org: orgId,
      p_kind: "driver_week",
      p_week: week,
      p_driver: driverId,
      p_vehicle: null,
      p_reason: reason,
    });
    if (rpcErr) {
      errors.push(`${driverId}: ${rpcErr.message}`);
      console.warn("[recon] enqueue driver_week failed", week, driverId, rpcErr.message);
      continue;
    }
    enqueued += 1;
  }
  return { enqueued, errors };
}