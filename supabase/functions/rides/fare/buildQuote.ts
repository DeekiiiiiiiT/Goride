import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeFareMinor, type FareBreakdown } from "./compute.ts";
import { loadFareRules, resolvePickupLocation } from "./rules.ts";
import { getRouteEstimate, type RouteEstimate } from "./routing.ts";
import { mintQuoteToken } from "./quoteToken.ts";
import type { DispatchSettings } from "./dispatchSettings.ts";
import { resolvePickupEta, type PickupEtaSource } from "./pickupEta.ts";

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
  driversAvailable: boolean;
  pickupEtaSource: PickupEtaSource;
  etaArrivalAt?: string;
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
    allowedBodyTypeSlugs?: Set<string>;
    dispatchSettings?: DispatchSettings;
    /** PostgREST client + table for fare_rules (public view when rides schema is not exposed). */
    fareRulesDb?: SupabaseClient;
    fareRulesTable?: string;
    vehicleTypesTable?: string;
  },
): Promise<BuiltFareQuote> {
  const vehicleType = params.vehicleType || "uberx";
  const resolved = resolvePickupLocation(params.pickupLat, params.pickupLng);
  const rules = await loadFareRules(
    params.fareRulesDb ?? db,
    params.pickupLat,
    params.pickupLng,
    vehicleType,
    {
      fareRulesTable: params.fareRulesTable,
      vehicleTypesTable: params.vehicleTypesTable,
    },
  );
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
    locationKey: rules.location_key,
    vehicleType: rules.vehicle_type,
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

  const pickupEta = await resolvePickupEta(db, params.pickupLat, params.pickupLng, {
    allowedBodyTypeSlugs: params.allowedBodyTypeSlugs,
    dispatchSettings: params.dispatchSettings,
  });
  const etaPickupSeconds = pickupEta.pickupSeconds ?? 0;
  const etaArrivalAt = pickupEta.driversAvailable && pickupEta.pickupSeconds != null
    ? new Date(
      Date.now() +
        pickupEta.pickupSeconds * 1000 +
        durationMinutes * 60 * 1000,
    ).toISOString()
    : undefined;

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
    driversAvailable: pickupEta.driversAvailable,
    pickupEtaSource: pickupEta.pickupEtaSource,
    etaArrivalAt,
    quoteToken,
  };
}
