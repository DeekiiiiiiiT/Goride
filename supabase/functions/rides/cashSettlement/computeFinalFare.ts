export interface FinalFareResult {
  fareMinor: number;
  waitTimeFeeMinor: number;
  actualTollsMinor: number;
  tollAdjustment: number;
  fareFinalBreakdown: Record<string, unknown>;
}

export function computeFinalFareFromRide(ride: Record<string, unknown>): FinalFareResult | { error: string } {
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);
  const waitTimeFeeMinor = Number(ride.wait_time_fee_minor ?? 0);
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const estimatedTollsMinor = Number(
    (ride.fare_breakdown as Record<string, unknown>)?.estimated_tolls_minor ?? 0,
  );
  const tollAdjustment = actualTollsMinor - estimatedTollsMinor;
  const fareMinor = baseFareMinor + waitTimeFeeMinor + Math.max(0, tollAdjustment);
  if (!Number.isFinite(fareMinor) || fareMinor < 0) {
    return { error: "invalid_fare" };
  }
  const breakdown = (ride.fare_breakdown ?? {}) as Record<string, unknown>;
  return {
    fareMinor,
    waitTimeFeeMinor,
    actualTollsMinor,
    tollAdjustment,
    fareFinalBreakdown: {
      ...breakdown,
      wait_time_fee_minor: waitTimeFeeMinor,
      actual_tolls_minor: actualTollsMinor,
      toll_adjustment_minor: tollAdjustment,
    },
  };
}

export function completionFinancialPatch(
  ride: Record<string, unknown>,
  fare: FinalFareResult,
  nowIso: string,
): Record<string, unknown> {
  return {
    fare_final_minor: fare.fareMinor,
    completed_at: nowIso,
    fare_final_breakdown: fare.fareFinalBreakdown,
    platform_fee_minor: 0,
    tip_minor: 0,
    driver_net_minor: fare.fareMinor,
    payment_method: ride.payment_method ?? "cash",
  };
}
