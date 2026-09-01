/**
 * G16 — attribute fuel/toll/expense rows to rideshare vs rush_delivery.
 */
import * as kv from "./kv_store.tsx";

export type ServiceLine = "rideshare" | "rush_delivery";

export function inferTripServiceLine(trip: Record<string, unknown>): ServiceLine {
  const explicit = trip.serviceLine ?? trip.service_line;
  if (explicit === "rush_delivery" || explicit === "rideshare") return explicit;
  if (String(trip.platform ?? "") === "Roam Rush") return "rush_delivery";
  return "rideshare";
}

export function inferServiceLineFromTripId(
  trip: Record<string, unknown> | null | undefined,
): ServiceLine | null {
  if (!trip) return null;
  return inferTripServiceLine(trip);
}

/** Stamp service_line on a cost KV record when a linked trip is known. */
export async function stampServiceLineFromTripLink(
  record: Record<string, unknown>,
  opts?: { tripId?: string | null; trip?: Record<string, unknown> | null },
): Promise<Record<string, unknown>> {
  const existing = record.service_line ?? record.serviceLine;
  if (existing === "rush_delivery" || existing === "rideshare") return record;

  let trip = opts?.trip;
  const tripId =
    opts?.tripId ??
    record.tripId ??
    record.trip_id ??
    (record.metadata as Record<string, unknown> | undefined)?.tripId;

  if (!trip && tripId) {
    trip = (await kv.get(`trip:${tripId}`)) as Record<string, unknown> | null;
    if (!trip) trip = (await kv.get(`fleet_trip:${tripId}`)) as Record<string, unknown> | null;
  }

  const line = inferServiceLineFromTripId(trip);
  if (!line) return record;

  record.service_line = line;
  record.serviceLine = line;
  const meta = (record.metadata as Record<string, unknown>) || {};
  if (!meta.service_line && !meta.serviceLine) {
    record.metadata = { ...meta, service_line: line, serviceLine: line };
  }
  return record;
}

export type TripMixAllocation = {
  rideshareTrips: number;
  rushDeliveryTrips: number;
  ratio: { rideshare: number; rush_delivery: number };
};

/** Weekly trip-mix ratio for pro-rata shared vehicle costs (G16). */
export function allocateSharedCostsByTripMix(
  trips: Array<Record<string, unknown>>,
  periodAnchor: string,
  periodEnd: string,
  dayOfTrip: (trip: Record<string, unknown>) => string | null,
): TripMixAllocation {
  let rideshareTrips = 0;
  let rushDeliveryTrips = 0;

  for (const trip of trips || []) {
    const d = dayOfTrip(trip);
    if (!d || d < periodAnchor || d > periodEnd) continue;
    const st = String(trip.status ?? "").toLowerCase();
    if (st.includes("cancel")) continue;
    if (inferTripServiceLine(trip) === "rush_delivery") rushDeliveryTrips++;
    else rideshareTrips++;
  }

  const total = rideshareTrips + rushDeliveryTrips;
  if (total === 0) {
    return {
      rideshareTrips: 0,
      rushDeliveryTrips: 0,
      ratio: { rideshare: 1, rush_delivery: 0 },
    };
  }

  return {
    rideshareTrips,
    rushDeliveryTrips,
    ratio: {
      rideshare: rideshareTrips / total,
      rush_delivery: rushDeliveryTrips / total,
    },
  };
}
