/**
 * Rush → fleet.trips projection helpers: synthetic live-sync batches + backfill.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  deliveryOrderToFleetTrip,
  syncOrderToFleetKv,
} from "../_shared/orderToFleetTrip.ts";
import {
  ensureRushSyntheticBatch,
  rushLiveSyncBatchId,
  weekStartYmdFromIso,
  RUSH_PLATFORM,
} from "../_shared/ensureRushSyntheticBatch.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";

export {
  deliveryOrderToFleetTrip,
  ensureRushSyntheticBatch,
  rushLiveSyncBatchId,
  weekStartYmdFromIso,
  RUSH_PLATFORM,
};

export async function backfillRushOrdersToFleet(
  db: SupabaseClient,
  fleetOrgId: string,
  sinceIso: string,
): Promise<{ synced: number; skipped: number; errors: number }> {
  const enabled = await isFeatureEnabled(FEATURE_FLAGS.RUSH_TRIP_PROJECTION, fleetOrgId);
  if (!enabled) {
    return { synced: 0, skipped: 0, errors: 0 };
  }

  const delivery = db.schema("delivery");
  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let cursor = sinceIso;
  let isFirstPage = true;
  const pageSize = 500;

  for (;;) {
    let query = delivery
      .from("orders")
      .select("*")
      .eq("courier_fleet_id", fleetOrgId)
      .in("status", ["delivered", "completed", "cancelled"])
      .order("updated_at", { ascending: true })
      .limit(pageSize);

    query = isFirstPage
      ? query.gte("updated_at", sinceIso)
      : query.gt("updated_at", cursor);

    const { data: orders, error } = await query;

    if (error) throw error;
    if (!orders?.length) break;

    for (const order of orders) {
      try {
        const batchId = await ensureRushSyntheticBatch(
          fleetOrgId,
          String(order.delivered_at ?? order.updated_at ?? new Date().toISOString()),
        );
        const result = await syncOrderToFleetKv({ ...order, _syntheticBatchId: batchId });
        if (result.ok) synced++;
        else skipped++;
      } catch (e) {
        console.error("[rush_backfill] order sync failed:", order.id, e);
        errors++;
      }
    }

    if (orders.length < pageSize) break;
    cursor = String(orders[orders.length - 1]!.updated_at);
    isFirstPage = false;
  }

  return { synced, skipped, errors };
}

/** Admin/cron: reconcile all pilot orgs with rush projection enabled. */
export async function runDailyRushTripRecon(
  db: SupabaseClient,
): Promise<Array<{ orgId: string; orderCount: number; tripCount: number; drift: number }>> {
  const { reconcileRushTripProjection } = await import("./rush_trip_recon.ts");
  const sinceIso = new Date(Date.now() - 86400000).toISOString();

  const { data: orgs } = await db
    .from("organizations")
    .select("id, service_lines")
    .contains("service_lines", ["rush_delivery"]);

  const results: Array<{ orgId: string; orderCount: number; tripCount: number; drift: number }> = [];
  for (const org of orgs ?? []) {
    const orgId = String(org.id);
    const flagOn = await isFeatureEnabled(FEATURE_FLAGS.RUSH_TRIP_PROJECTION, orgId);
    if (!flagOn) continue;
    const row = await reconcileRushTripProjection(db, orgId, sinceIso);
    results.push({ orgId, ...row });
    if (row.drift !== 0) {
      console.warn(`[rush_recon] drift org=${orgId} orders=${row.orderCount} trips=${row.tripCount}`);
    }
  }
  return results;
}
