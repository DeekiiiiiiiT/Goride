/**
 * Map a completed Roam ride_requests row to fleet KV Trip shape (major currency units).
 */
export function rideRequestToFleetTrip(ride: Record<string, unknown>): Record<string, unknown> {
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor) || 0;
  const amount = fareMinor / 100;
  const platformFeeMinor = Number(ride.platform_fee_minor) || 0;
  const driverNetMinor = Number(ride.driver_net_minor) || Math.max(0, fareMinor - platformFeeMinor);
  const paymentMethod = ride.payment_method === "card" ? "Card" : "Cash";
  const completedAt = String(ride.completed_at ?? ride.updated_at ?? new Date().toISOString());
  const breakdown = (ride.fare_final_breakdown ?? ride.fare_breakdown) as Record<string, unknown> | null;

  const fareBreakdown = breakdown
    ? {
        baseFare: Number(breakdown.base_minor ?? 0) / 100,
        tips: Number(ride.tip_minor ?? 0) / 100,
        waitTime: 0,
        surge: Math.max(0, (Number(breakdown.after_surge_minor ?? fareMinor) - Number(breakdown.subtotal_before_surge_minor ?? fareMinor)) / 100),
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

  return {
    id: String(ride.id),
    platform: "Roam",
    paymentMethod,
    date: completedAt,
    completed_at: completedAt,
    driverId: String(ride.assigned_driver_user_id ?? ""),
    amount,
    grossEarnings: amount,
    netToDriver: driverNetMinor / 100,
    netPayout: driverNetMinor / 100,
    status: "Completed",
    pickupLocation: ride.pickup_address ?? "",
    dropoffLocation: ride.dropoff_address ?? "",
    cashCollected: paymentMethod === "Cash" ? amount : 0,
    fareBreakdown,
    isLiveRecorded: true,
    serviceCategory: "ride",
    distance: ride.distance_estimate_km != null ? Number(ride.distance_estimate_km) : undefined,
    duration: ride.duration_estimate_minutes != null ? Number(ride.duration_estimate_minutes) : undefined,
    usesPaymentLineSsot: true,
    paymentRowCount: 1,
    reportingAt: completedAt,
    paidToYouNet: driverNetMinor / 100,
  };
}

export async function syncCompletedRideToFleetKv(ride: Record<string, unknown>): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!base || !anon) {
    console.warn("[rideToFleetTrip] Missing SUPABASE_URL or key — skip fleet sync");
    return;
  }

  const trip = rideRequestToFleetTrip(ride);
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
