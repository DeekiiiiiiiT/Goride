import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeFareMinor, type FareBreakdown } from "./compute.ts";
import { loadFareRules, resolvePickupLocation } from "./rules.ts";
import { getRouteEstimate, type RouteEstimate } from "./routing.ts";
import { mintQuoteToken } from "./quoteToken.ts";

export interface BuiltFareQuote {
  distanceKm: number;
  durationMinutes: number;
  etaTripMinutes: number;
  etaPickupSeconds: number;
  surgeMultiplier: number;
  gridCellKey: string;
  fareEstimateMinor: bigint;
  currency: string;
  vehicleType: string;
  city: string;
  breakdown: FareBreakdown;
  routeSource: RouteEstimate["source"];
  durationTrafficAware: boolean;
  routePolylineEncoded?: string;
  quoteToken: string;
}

export function gridCellKey(lat: number, lng: number): string {
  return `grid:${Math.floor(lat * 50)}:${Math.floor(lng * 50)}`;
}

export async function buildFareQuote(
  db: SupabaseClient,
  params: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    vehicleType: string;
    readSurge: (cellKey: string) => Promise<number>;
  },
): Promise<BuiltFareQuote> {
  const vehicleType = params.vehicleType || "uberx";
  const resolved = resolvePickupLocation(params.pickupLat, params.pickupLng);
  const rules = await loadFareRules(db, params.pickupLat, params.pickupLng, vehicleType);
  const city = resolved.locationKey;
  const route = await getRouteEstimate(
    params.pickupLat,
    params.pickupLng,
    params.dropoffLat,
    params.dropoffLng,
  );

  const cellKey = gridCellKey(params.pickupLat, params.pickupLng);
  const surge = await params.readSurge(cellKey);

  const { fareMinor, breakdown, durationMinutes } = computeFareMinor({
    rules,
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    surgeMultiplier: surge,
  });

  const quoteToken = await mintQuoteToken({
    pickup_lat: params.pickupLat,
    pickup_lng: params.pickupLng,
    dropoff_lat: params.dropoffLat,
    dropoff_lng: params.dropoffLng,
    vehicle_type: vehicleType,
    city,
    distance_km: route.distanceKm,
    duration_minutes: durationMinutes,
    surge_multiplier: surge,
    fare_estimate_minor: Number(fareMinor),
    currency: rules.currency,
    fare_breakdown: breakdown,
  });

  const avgSpeedKmh = 25;
  const etaPickupSeconds = Math.round((route.distanceKm / avgSpeedKmh) * 3600);

  return {
    distanceKm: route.distanceKm,
    durationMinutes,
    etaTripMinutes: durationMinutes,
    etaPickupSeconds,
    surgeMultiplier: surge,
    gridCellKey: cellKey,
    fareEstimateMinor: fareMinor,
    currency: rules.currency,
    vehicleType,
    city,
    breakdown,
    routeSource: route.source,
    durationTrafficAware: route.trafficAware === true,
    routePolylineEncoded: route.encodedPolyline,
    quoteToken,
  };
}
