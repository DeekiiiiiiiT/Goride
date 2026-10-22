/**
 * A second live/manual save of the same driver, start, amount, and pickup
 * must keep the trip already stored. Platform CSV imports are not checked.
 */
import { getServiceClient } from "./service_client.ts";

export function isAppLoggedTrip(trip: Record<string, unknown> | null | undefined): boolean {
  if (!trip) return false;
  const id = String(trip.id ?? "");
  const batch = String(trip.batchId ?? "");
  const manual = trip.isManual === true || trip.isManual === "true";
  return manual || id.startsWith("manual_") || batch === "live_driver_app" || batch === "manual_entry";
}

function startToken(trip: Record<string, unknown>): string {
  const raw = String(trip.requestTime || trip.date || "").trim();
  if (!raw) return "";
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? String(ms) : raw;
}

/** Null when the trip is too incomplete to treat as the same ride. */
export function loggedTripSignature(trip: Record<string, unknown>): string | null {
  const driverId = String(trip.driverId ?? "").trim();
  const amount = Number(trip.amount);
  const pickup = String(trip.pickupLocation ?? "").trim().toLowerCase();
  const start = startToken(trip);
  if (!driverId || !pickup || !start || !Number.isFinite(amount)) return null;
  return `${driverId}|${amount.toFixed(2)}|${pickup}|${start}`;
}

function rowAsTrip(row: {
  id?: string;
  driver_id?: string | null;
  amount?: number | string | null;
  date?: string | null;
  payload_json?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const payload = row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {};
  return {
    ...payload,
    id: row.id ?? payload.id,
    driverId: payload.driverId || row.driver_id,
    amount: payload.amount ?? row.amount,
    date: payload.date || row.date,
  };
}

async function sameTripAlreadyStored(
  trip: Record<string, unknown>,
  orgId: string,
  signature: string,
): Promise<boolean> {
  const day = String(trip.date || trip.requestTime || "").slice(0, 10);
  const driverId = String(trip.driverId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !driverId) return false;
  const { data, error } = await getServiceClient()
    .from("fleet_trips")
    .select("id, driver_id, amount, date, payload_json")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("date", day)
    .limit(100);
  if (error) {
    console.warn("[trip-dedupe] lookup failed:", error.message);
    return false;
  }
  const incomingId = String(trip.id || "");
  for (const row of data || []) {
    if (String(row.id || "") === incomingId) continue;
    if (loggedTripSignature(rowAsTrip(row)) === signature) return true;
  }
  return false;
}

export async function dropDuplicateAppLoggedTrips(
  trips: Record<string, unknown>[],
  existingAtSameId: unknown[],
  orgId: string | null,
): Promise<{ trips: Record<string, unknown>[]; duplicatesKept: number }> {
  const kept: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let duplicatesKept = 0;

  for (let i = 0; i < trips.length; i++) {
    const trip = trips[i];
    const signature = isAppLoggedTrip(trip) ? loggedTripSignature(trip) : null;
    const alreadyStored = existingAtSameId[i] != null;

    if (alreadyStored) {
      kept.push(trip);
      if (signature) seen.add(signature);
      continue;
    }

    if (signature && seen.has(signature)) {
      duplicatesKept += 1;
      continue;
    }

    if (signature && orgId && await sameTripAlreadyStored(trip, orgId, signature)) {
      duplicatesKept += 1;
      continue;
    }

    kept.push(trip);
    if (signature) seen.add(signature);
  }

  return { trips: kept, duplicatesKept };
}
