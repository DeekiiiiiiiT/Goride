/**
 * Daily Rush→Fleet projection reconciliation (orders vs fleet.trips).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function reconcileRushTripProjection(
  db: SupabaseClient,
  fleetOrgId: string,
  sinceIso: string,
): Promise<{ orderCount: number; tripCount: number; drift: number; perCourier: Record<string, number> }> {
  const delivery = db.schema("delivery");
  const sinceDate = sinceIso.slice(0, 10);

  const { data: orders } = await delivery
    .from("orders")
    .select("id, courier_id")
    .eq("courier_fleet_id", fleetOrgId)
    .in("status", ["delivered", "completed"])
    .gte("delivered_at", sinceIso);

  const { data: trips } = await db
    .from("fleet_trips")
    .select("id, driver_id")
    .eq("organization_id", fleetOrgId)
    .eq("service_line", "rush_delivery")
    .eq("status", "Completed")
    .gte("date", sinceDate);

  const ordersByCourier = new Map<string, number>();
  for (const o of orders ?? []) {
    const cid = String(o.courier_id ?? "");
    if (!cid) continue;
    ordersByCourier.set(cid, (ordersByCourier.get(cid) ?? 0) + 1);
  }

  const tripsByCourier = new Map<string, number>();
  for (const t of trips ?? []) {
    const did = String(t.driver_id ?? "");
    if (!did) continue;
    tripsByCourier.set(did, (tripsByCourier.get(did) ?? 0) + 1);
  }

  const perCourier: Record<string, number> = {};
  const allCouriers = new Set([...ordersByCourier.keys(), ...tripsByCourier.keys()]);
  for (const cid of allCouriers) {
    const drift = (ordersByCourier.get(cid) ?? 0) - (tripsByCourier.get(cid) ?? 0);
    if (drift !== 0) perCourier[cid] = drift;
  }

  const orderCount = orders?.length ?? 0;
  const tripCount = trips?.length ?? 0;
  return { orderCount, tripCount, drift: orderCount - tripCount, perCourier };
}
