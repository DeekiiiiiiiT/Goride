/**
 * Project Rush delivery.orders → fleet.trips (mirrors rideToFleetTrip.ts).
 */
import {
  courierDeliveryEarnings,
  courierTipEarnings,
} from "./dashMoneySplit.ts";
import {
  ensureRushSyntheticBatch,
  rushLiveSyncBatchId,
  type SyncOrderResult,
} from "./ensureRushSyntheticBatch.ts";

function isCashPayment(order: Record<string, unknown>): boolean {
  const pm = String(order.payment_method ?? "").toLowerCase();
  return pm === "cash" || pm === "cod";
}

function courierGrossEarning(order: Record<string, unknown>): number {
  const peak = Number(order.peak_pay_amount ?? 0);
  return (
    courierDeliveryEarnings(order as Parameters<typeof courierDeliveryEarnings>[0]) +
    courierTipEarnings(order as Parameters<typeof courierTipEarnings>[0]) +
    (Number.isFinite(peak) ? Math.max(0, peak) : 0)
  );
}

export function deliveryOrderToFleetTrip(
  order: Record<string, unknown>,
): Record<string, unknown> {
  const status = String(order.status ?? "delivered");
  const isCancelled = status === "cancelled";
  const amount = isCancelled ? 0 : courierGrossEarning(order);
  const paymentMethod = isCashPayment(order) ? "Cash" : "Card";
  const eventAt = String(
    isCancelled
      ? order.cancelled_at ?? order.updated_at
      : order.delivered_at ?? order.updated_at ?? new Date().toISOString(),
  );
  const orderId = String(order.id ?? "");
  const cashCollected =
    paymentMethod === "Cash" && !isCancelled ? Number(order.total ?? 0) : 0;
  const netPayout = amount - cashCollected;

  return {
    id: `rush-order:${orderId}`,
    platform: "Roam Rush",
    paymentMethod,
    date: eventAt,
    completed_at: isCancelled ? undefined : eventAt,
    driverId: String(order.courier_id ?? ""),
    amount,
    grossEarnings: amount,
    netToDriver: netPayout,
    netPayout,
    status: isCancelled ? "Cancelled" : "Completed",
    pickupLocation: (order.merchant as { name?: string } | undefined)?.name ?? "Merchant",
    dropoffLocation: String(order.delivery_address ?? ""),
    batchId: order._syntheticBatchId ? String(order._syntheticBatchId) : undefined,
    isLiveRecorded: true,
    serviceCategory: "courier",
    serviceLine: "rush_delivery",
    service_line: "rush_delivery",
    cashCollected,
    organizationId: order.courier_fleet_id ? String(order.courier_fleet_id) : undefined,
    payload_json: {
      rushOrderId: orderId,
      orderNumber: order.order_number,
      pricingSnapshot: order.pricing_snapshot,
    },
  };
}

export async function syncOrderToFleetKv(
  order: Record<string, unknown>,
): Promise<SyncOrderResult> {
  const fleetId = order.courier_fleet_id ? String(order.courier_fleet_id) : null;
  if (!fleetId) return { ok: false, reason: "no_courier_fleet_id" };

  const status = String(order.status ?? "");
  if (status !== "delivered" && status !== "completed" && status !== "cancelled") {
    return { ok: false, reason: "non_terminal_status" };
  }

  const courierId = String(order.courier_id ?? "");
  if (!courierId) return { ok: false, reason: "no_courier_id" };

  try {
    const { isFeatureEnabled, FEATURE_FLAGS } = await import(
      "../_fleet-server/feature_flags.ts"
    );
    const enabled = await isFeatureEnabled(FEATURE_FLAGS.RUSH_TRIP_PROJECTION, fleetId);
    if (!enabled) return { ok: false, reason: "projection_flag_off" };
  } catch (e) {
    console.warn("[orderToFleetTrip] feature flag check failed — skip:", e);
    return { ok: false, reason: "flag_check_failed" };
  }

  const eventIso = String(
    order.delivered_at ?? order.cancelled_at ?? order.updated_at ?? new Date().toISOString(),
  );
  const syntheticBatchId = order._syntheticBatchId
    ? String(order._syntheticBatchId)
    : await ensureRushSyntheticBatch(fleetId, eventIso);

  const trip = deliveryOrderToFleetTrip({
    ...order,
    courier_fleet_id: fleetId,
    _syntheticBatchId: syntheticBatchId,
  });
  trip.organizationId = fleetId;
  trip.batchId = syntheticBatchId;

  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !anon) {
    console.warn("[orderToFleetTrip] Missing SUPABASE_URL or key — skip fleet sync");
    return { ok: false, reason: "missing_supabase_config" };
  }

  const url = `${base}/functions/v1/make-server-37f42386/trips`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anon}`,
      apikey: anon,
      "X-Roam-Product-Line": "fleet",
    },
    body: JSON.stringify([trip]),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[orderToFleetTrip] fleet sync failed:", res.status, text.slice(0, 500));
    return { ok: false, reason: `fleet_post_${res.status}` };
  }

  try {
    await upsertDeliveryDetails(order, trip);
  } catch (e) {
    console.error("[orderToFleetTrip] delivery_details upsert failed:", e);
    return { ok: false, reason: "delivery_details_failed" };
  }

  return { ok: true };
}

function trimOrderPayload(order: Record<string, unknown>): Record<string, unknown> {
  return {
    rushOrderId: order.id,
    orderNumber: order.order_number,
    status: order.status,
    payment_method: order.payment_method,
    delivery_fee: order.delivery_fee,
    tip: order.tip,
    total: order.total,
    platform_fee: order.platform_fee,
    delivered_at: order.delivered_at,
    accepted_at: order.accepted_at,
    picked_up_at: order.picked_up_at,
    pricing_snapshot: order.pricing_snapshot,
  };
}

async function upsertDeliveryDetails(
  order: Record<string, unknown>,
  trip: Record<string, unknown>,
): Promise<void> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const merchant = order.merchant as { id?: string; name?: string } | null;
  const snap = (order.pricing_snapshot ?? {}) as Record<string, unknown>;
  const row = {
    trip_id: String(trip.id),
    organization_id: String(order.courier_fleet_id),
    order_id: String(order.id),
    order_number: order.order_number ? String(order.order_number) : null,
    merchant_id: merchant?.id ?? order.merchant_id ?? null,
    merchant_name: merchant?.name ?? null,
    delivery_fee: Number(order.delivery_fee ?? 0),
    tip: Number(order.tip ?? 0),
    cod_collected: isCashPayment(order) ? Number(order.total ?? 0) : 0,
    platform_due: Number(snap.platform_fee ?? order.platform_fee ?? 0),
    merchant_due: Number(snap.merchant_receivable ?? 0),
    distance_km: Number(order.distance_km ?? snap.distance_km ?? 0) || null,
    accepted_at: order.accepted_at ?? null,
    picked_up_at: order.picked_up_at ?? null,
    delivered_at: order.delivered_at ?? null,
    payload_json: trimOrderPayload(order),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("fleet_delivery_details").upsert(row, { onConflict: "trip_id" });
  if (error) console.error("[orderToFleetTrip] fleet_delivery_details:", error.message);
}

export { rushLiveSyncBatchId };
