/**
 * Map a Roam ride_requests row to fleet KV Trip shape (major currency units).
 */
import {
  mapRideLedgerLineRowToPaymentLedgerLine,
  rollupPaymentLinesFromRows,
  type RideLedgerLineRow,
} from "./mapRideLedgerLine.ts";

export function rideRequestToFleetTrip(
  ride: Record<string, unknown>,
  ledgerLines: RideLedgerLineRow[] = [],
): Record<string, unknown> {
  const status = String(ride.status ?? "completed");
  const isCancelled = status === "cancelled";
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor) || 0;
  const amount = isCancelled ? 0 : fareMinor / 100;
  const platformFeeMinor = Number(ride.platform_fee_minor) || 0;
  // Use nullish coalescing so legitimate 0 is preserved
  const rawDriverNet = ride.driver_net_minor;
  const driverNetMinor = isCancelled
    ? 0
    : (rawDriverNet != null ? Number(rawDriverNet) : Math.max(0, fareMinor - platformFeeMinor));
  const paymentMethod = ride.payment_method === "card" ? "Card" : "Cash";
  const eventAt = String(
    isCancelled
      ? ride.updated_at ?? ride.created_at
      : ride.completed_at ?? ride.updated_at ?? new Date().toISOString(),
  );
  const breakdown = (ride.fare_final_breakdown ?? ride.fare_breakdown) as Record<string, unknown> | null;

  const fareBreakdown = breakdown
    ? {
      baseFare: Number(breakdown.base_minor ?? 0) / 100,
      tips: Number(ride.tip_minor ?? 0) / 100,
      waitTime: 0,
      surge: Math.max(
        0,
        (Number(breakdown.after_surge_minor ?? fareMinor) -
          Number(breakdown.subtotal_before_surge_minor ?? fareMinor)) / 100,
      ),
      airportFees: 0,
      timeAtStop: Number(breakdown.time_component_minor ?? 0) / 100,
      taxes: 0,
    }
    : {
      baseFare: amount,
      tips: Number(ride.tip_minor ?? 0) / 100,
      waitTime: 0,
      surge: 0,
      airportFees: 0,
      timeAtStop: 0,
      taxes: 0,
    };

  const rollup = ledgerLines.length > 0
    ? rollupPaymentLinesFromRows(ledgerLines)
    : {
      paidToYouNet: driverNetMinor / 100,
      bankTransferred: paymentMethod === "Card" ? amount : 0,
      // Fix: dead ternary always returned 1; simplify to constant
      paymentRowCount: 1,
      reportingAt: eventAt,
    };

  const cancelledBy = ride.cancelled_by ? String(ride.cancelled_by) : undefined;

  return {
    id: String(ride.id),
    platform: "Roam",
    paymentMethod,
    date: eventAt,
    completed_at: isCancelled ? undefined : eventAt,
    driverId: String(ride.assigned_driver_user_id ?? ride.driver_user_id ?? ""),
    amount,
    grossEarnings: amount,
    netToDriver: rollup.paidToYouNet,
    netPayout: rollup.paidToYouNet,
    status: isCancelled ? "Cancelled" : "Completed",
    pickupLocation: ride.pickup_address ?? "",
    dropoffLocation: ride.dropoff_address ?? "",
    cashCollected: isCancelled
      ? 0
      : (paymentMethod === "Cash"
        ? (ride.cash_received_minor != null
          ? Number(ride.cash_received_minor) / 100
          : amount)
        : 0),
    fareBreakdown,
    isLiveRecorded: true,
    serviceCategory: "ride",
    distance: ride.distance_estimate_km != null ? Number(ride.distance_estimate_km) : undefined,
    duration: ride.duration_estimate_minutes != null
      ? Number(ride.duration_estimate_minutes)
      : undefined,
    usesPaymentLineSsot: true,
    paymentRowCount: rollup.paymentRowCount,
    reportingAt: rollup.reportingAt || eventAt,
    paidToYouNet: rollup.paidToYouNet,
    bankTransferred: rollup.bankTransferred,
    cancellationReason: isCancelled ? String(ride.cancel_reason ?? cancelledBy ?? "cancelled") : undefined,
    cancelledBy: isCancelled ? cancelledBy : undefined,
  };
}

export async function loadLedgerLinesForRide(
  rideId: string,
): Promise<RideLedgerLineRow[]> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
  const { data, error } = await db.from("ledger_lines").select("*").eq(
    "ride_request_id",
    rideId,
  );
  if (error) {
    console.warn("[rideToFleetTrip] ledger_lines load failed:", error.message);
    return [];
  }
  return (data ?? []) as RideLedgerLineRow[];
}

export async function syncRideToFleetKv(ride: Record<string, unknown>): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !anon) {
    console.warn("[rideToFleetTrip] Missing SUPABASE_URL or key — skip fleet sync");
    return;
  }

  const status = String(ride.status ?? "");
  if (status !== "completed" && status !== "cancelled") return;

  const rideId = String(ride.id ?? "");
  const lines = rideId ? await loadLedgerLinesForRide(rideId) : [];
  const trip = rideRequestToFleetTrip(ride, lines);
  if (!trip.driverId) {
    console.warn("[rideToFleetTrip] No driver on ride — skip fleet sync");
    return;
  }

  const url = `${base}/functions/v1/make-server-37f42386/trips`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify([trip]),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[rideToFleetTrip] fleet sync failed:", res.status, text.slice(0, 500));
  }
}

/** @deprecated Use syncRideToFleetKv */
export async function syncCompletedRideToFleetKv(ride: Record<string, unknown>): Promise<void> {
  return syncRideToFleetKv(ride);
}
