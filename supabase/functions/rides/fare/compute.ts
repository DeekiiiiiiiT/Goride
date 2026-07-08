/** Pure fare math — all amounts in minor units (JMD cents). */

export interface FareRulesInput {
  baseFareMinor: number;
  pricePerKmMinor: number;
  pricePerMinMinor: number;
  bookingFeeMinor: number;
  estimatedTollsMinor: number;
  minFareMinor: number;
  currency: string;
}

export interface FareBreakdown {
  base_minor: number;
  booking_fee_minor: number;
  estimated_tolls_minor: number;
  /** Plazas on planned route (metadata only; not added again to fare math). */
  estimated_tolls_plazas?: Array<{
    toll_plaza_id: string;
    toll_plaza_name: string;
    toll_amount_minor: number;
    currency: string;
  }>;
  distance_component_minor: number;
  time_component_minor: number;
  subtotal_before_surge_minor: number;
  surge_multiplier: number;
  after_surge_minor: number;
  min_fare_applied: boolean;
  fare_estimate_minor: number;
  /** Rates and inputs used for this quote (admin / transparency). */
  price_per_km_minor: number;
  price_per_min_minor: number;
  min_fare_minor: number;
  distance_km: number;
  duration_minutes: number;
  currency: string;
  rule_source: "database";
  location_key: string;
  vehicle_type: string;
}

export function computeFareMinor(params: {
  rules: FareRulesInput;
  distanceKm: number;
  durationMinutes: number;
  surgeMultiplier: number;
  locationKey: string;
  vehicleType: string;
}): { fareMinor: bigint; breakdown: FareBreakdown; durationMinutes: number } {
  const durationMinutes = Math.max(1, Math.round(params.durationMinutes));
  const distanceKm = Math.max(0, params.distanceKm);
  const surge = Math.max(1, params.surgeMultiplier);

  const distanceComponent = Math.round(params.rules.pricePerKmMinor * distanceKm);
  const timeComponent = Math.round(params.rules.pricePerMinMinor * durationMinutes);
  const subtotal =
    params.rules.baseFareMinor +
    params.rules.bookingFeeMinor +
    params.rules.estimatedTollsMinor +
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
      estimated_tolls_minor: params.rules.estimatedTollsMinor,
      distance_component_minor: distanceComponent,
      time_component_minor: timeComponent,
      subtotal_before_surge_minor: subtotal,
      surge_multiplier: surge,
      after_surge_minor: afterSurge,
      min_fare_applied: minApplied,
      fare_estimate_minor: Number(fareMinor),
      price_per_km_minor: params.rules.pricePerKmMinor,
      price_per_min_minor: params.rules.pricePerMinMinor,
      min_fare_minor: minFare,
      distance_km: distanceKm,
      duration_minutes: durationMinutes,
      currency: params.rules.currency,
      rule_source: "database",
      location_key: params.locationKey,
      vehicle_type: params.vehicleType,
    },
  };
}
