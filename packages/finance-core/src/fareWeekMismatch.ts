import { fleetCalendarDay, DEFAULT_FLEET_TZ } from "./periodKey.ts";

export type FareWeekMismatch = {
  tripId: string;
  tripDate: string;
  fareDate: string;
  amount: number;
};

/**
 * Completed trips inside the pay week whose fare was dated on a different week.
 * Same-week date drift is ignored. Trips with no fare are ignored.
 */
export function faresLandedOutsideTripWeek(input: {
  trips: Array<Record<string, unknown>>;
  fares: Array<Record<string, unknown>>;
  periodAnchor: string;
  periodEnd: string;
  timezone?: string;
}): FareWeekMismatch[] {
  const tz = input.timezone || DEFAULT_FLEET_TZ;
  const anchor = String(input.periodAnchor || "").slice(0, 10);
  const end = String(input.periodEnd || "").slice(0, 10);
  const fareByTrip = new Map<string, { date: string; amount: number }>();
  for (const fare of input.fares || []) {
    const meta = fare.metadata && typeof fare.metadata === "object"
      ? fare.metadata as Record<string, unknown>
      : {};
    const id = String(fare.sourceId ?? fare.tripId ?? meta.tripId ?? "").trim();
    const fareDate = fleetCalendarDay(String(fare.date ?? ""), tz);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(fareDate)) continue;
    const amount = Number(fare.grossAmount ?? fare.netAmount ?? fare.amount ?? 0);
    fareByTrip.set(id, { date: fareDate, amount: Number.isFinite(amount) ? amount : 0 });
  }

  const out: FareWeekMismatch[] = [];
  for (const trip of input.trips || []) {
    const status = String(trip.status || "").toLowerCase();
    if (status.includes("cancel")) continue;
    const tripId = String(trip.id ?? "").trim();
    const tripDate = fleetCalendarDay(String(trip.date ?? trip.dropoffTime ?? ""), tz);
    if (!tripId || !/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) continue;
    if (tripDate < anchor || tripDate > end) continue;
    const fare = fareByTrip.get(tripId);
    if (!fare || (fare.date >= anchor && fare.date <= end)) continue;
    out.push({ tripId, tripDate, fareDate: fare.date, amount: fare.amount });
  }
  return out;
}
