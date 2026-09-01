/**
 * Rush → fleet.trips projection helpers: synthetic live-sync batches + backfill.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { deliveryOrderToFleetTrip, syncOrderToFleetKv } from "../_shared/orderToFleetTrip.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import * as kv from "./kv_store.tsx";

const RUSH_PLATFORM = "Roam Rush";

/** Stable weekly synthetic import batch id per org (mirrors live Roam ride sync). */
export function rushLiveSyncBatchId(orgId: string, weekStartYmd: string): string {
  return `rush-live-sync:${orgId}:${weekStartYmd}`;
}

/** Monday yyyy-MM-dd for a given ISO date string. */
export function weekStartYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Ensure KV + Postgres import_batches row exists for live Rush sync week. */
export async function ensureRushSyntheticBatch(
  orgId: string,
  eventIso: string,
): Promise<string> {
  const weekStart = weekStartYmdFromIso(eventIso);
  const batchId = rushLiveSyncBatchId(orgId, weekStart);
  const existing = await kv.get(`batch:${batchId}`);
  if (existing) return batchId;

  const batch = {
    id: batchId,
    organizationId: orgId,
    platform: RUSH_PLATFORM,
    type: "live_sync",
    status: "completed",
    uploadDate: new Date().toISOString(),
    recordCount: 0,
    dataPeriodStart: weekStart,
    dataPeriodEnd: weekStart,
    notes: "Auto-created live Rush delivery sync batch",
    isSynthetic: true,
  };
  await kv.set(`batch:${batchId}`, batch);
  return batchId;
}

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
  const { data: orders, error } = await delivery
    .from("orders")
    .select("*")
    .eq("courier_fleet_id", fleetOrgId)
    .in("status", ["delivered", "completed", "cancelled"])
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) throw error;

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of orders ?? []) {
    try {
      const batchId = await ensureRushSyntheticBatch(
        fleetOrgId,
        String(order.delivered_at ?? order.updated_at ?? new Date().toISOString()),
      );
      await syncOrderToFleetKv({ ...order, _syntheticBatchId: batchId });
      synced++;
    } catch (e) {
      console.error("[rush_backfill] order sync failed:", order.id, e);
      errors++;
    }
  }

  skipped = (orders?.length ?? 0) - synced - errors;
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

export { deliveryOrderToFleetTrip, RUSH_PLATFORM };
