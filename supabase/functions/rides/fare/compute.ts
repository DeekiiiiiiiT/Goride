/** Pure fare math — all amounts in minor units (JMD cents). */

export interface FareRulesInput {
  baseFareMinor: number;
  pricePerKmMinor: number;
  pricePerMinMinor: number;
  bookingFeeMinor: number;
  minFareMinor: number;
  currency: string;
}

export interface FareBreakdown {
  base_minor: number;
  booking_fee_minor: number;
  distance_component_minor: number;
  time_component_minor: number;
  subtotal_before_surge_minor: number;
  surge_multiplier: number;
  after_surge_minor: number;
  min_fare_applied: boolean;
  fare_estimate_minor: number;
}

export function computeFareMinor(params: {
  rules: FareRulesInput;
  distanceKm: number;
  durationMinutes: number;
  surgeMultiplier: number;
}): { fareMinor: bigint; breakdown: FareBreakdown; durationMinutes: number } {
  const durationMinutes = Math.max(1, Math.round(params.durationMinutes));
  const distanceKm = Math.max(0, params.distanceKm);
  const surge = Math.max(1, params.surgeMultiplier);

  const distanceComponent = Math.round(params.rules.pricePerKmMinor * distanceKm);
  const timeComponent = Math.round(params.rules.pricePerMinMinor * durationMinutes);
  const subtotal =
    params.rules.baseFareMinor +
    params.rules.bookingFeeMinor +
    distanceComponent +
    timeComponent;
  const afterSurge = Math.round(subtotal * surge);
  const minFare = params.rules.minFareMinor;
  const minApplied = afterSurge < minFare;
  const fareMinor = BigInt(Math.max(minFare, afterSurge));

  return {
    fareMinor,
    durationMinutes,
    breakdown: {
      base_minor: params.rules.baseFareMinor,
      booking_fee_minor: params.rules.bookingFeeMinor,
      distance_component_minor: distanceComponent,
      time_component_minor: timeComponent,
      subtotal_before_surge_minor: subtotal,
      surge_multiplier: surge,
      after_surge_minor: afterSurge,
      min_fare_applied: minApplied,
      fare_estimate_minor: Number(fareMinor),
    },
  };
}
