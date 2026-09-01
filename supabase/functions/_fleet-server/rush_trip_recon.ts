/**
 * Daily Rush→Fleet projection reconciliation (orders vs fleet.trips).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function reconcileRushTripProjection(
  db: SupabaseClient,
  fleetOrgId: string,
  sinceIso: string,
): Promise<{ orderCount: number; tripCount: number; drift: number }> {
  const delivery = db.schema("delivery");
  const { count: orderCount } = await delivery
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("courier_fleet_id", fleetOrgId)
    .in("status", ["delivered", "completed"])
    .gte("delivered_at", sinceIso);

  const { count: tripCount } = await db
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", fleetOrgId)
    .gte("date", sinceIso.slice(0, 10));

  const orders = orderCount ?? 0;
  const trips = tripCount ?? 0;
  return { orderCount: orders, tripCount: trips, drift: orders - trips };
}
