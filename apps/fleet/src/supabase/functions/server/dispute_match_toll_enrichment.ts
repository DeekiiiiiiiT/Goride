/**
 * Live trip-refund enrichment for dispute match candidates — mirrors the
 * Underpaid & Claims shortfall display without persisting a trip link.
 */
import * as kv from "./kv_store.tsx";
import {
  findTollMatchesServer,
  pickBestValidTollMatch,
  loadAllTollLedgerWithTrips,
} from "./toll_controller.tsx";
import {
  isBareTollEligibleForDisputeMatch,
} from "./dispute_refund_eligibility.ts";

function mapTripsById(tripIds: string[], tripValues: any[]): Map<string, any> {
  const map = new Map<string, any>();
  tripIds.forEach((id, idx) => {
    const trip = tripValues[idx];
    if (trip) map.set(id, trip);
  });
  return map;
}

function attachTripDisplayFields(target: any, trip: any): void {
  target.tripPickup = trip.pickupLocation || null;
  target.tripDropoff = trip.dropoffLocation || null;
  target.tripPlatform = trip.platform || null;
  target.tripRequestTime = trip.requestTime || trip.date || null;
  target.tripDropoffTime = trip.dropoffTime || null;
}

export type BareTollCandidate = {
  tollId: string;
  tollAmount: number;
  tripId?: string | null;
  suggestedTripId?: string | null;
  tripRefund?: number | null;
  [key: string]: unknown;
};

/** Attach trip refund / shortfall fields; returns candidates still eligible for dispute linking. */
export async function enrichAndFilterDisputeBareTolls(
  candidates: BareTollCandidate[],
  rawTollById: Map<string, any>,
  fleetTz: string,
): Promise<BareTollCandidate[]> {
  if (candidates.length === 0) return [];

  const { trips } = await loadAllTollLedgerWithTrips();
  const resolved: {
    toll: BareTollCandidate;
    tripId: string;
    cost: number;
    time?: string;
  }[] = [];

  for (const t of candidates) {
    const rawToll = rawTollById.get(t.tollId);
    if (!rawToll) continue;

    const matches = findTollMatchesServer(rawToll, trips, fleetTz);
    const validMatch = pickBestValidTollMatch(matches);

    let tripId: string | null = null;
    if (validMatch) {
      if (t.tripId && t.tripId !== validMatch.tripId) {
        t.tripId = null;
      }
      tripId = validMatch.tripId;
      if (!t.tripId) t.suggestedTripId = validMatch.tripId;
    } else if (t.tripId) {
      t.tripId = null;
    }

    if (!tripId) continue;

    resolved.push({
      toll: t,
      tripId,
      cost: Math.abs(t.tollAmount || 0),
      time: rawToll.time,
    });
  }

  if (resolved.length > 0) {
    const tripIds = [...new Set(resolved.map((r) => r.tripId))];
    const tripValues = await kv.mget(tripIds.map((tid) => `trip:${tid}`));
    const tripDetailsById = mapTripsById(tripIds, tripValues);
    const tripRefundById = new Map<string, number>();
    for (const [tid, trip] of tripDetailsById) {
      tripRefundById.set(tid, Math.abs(trip.tollCharges || 0));
    }

    const byTrip = new Map<string, typeof resolved>();
    for (const r of resolved) {
      const list = byTrip.get(r.tripId) || [];
      list.push(r);
      byTrip.set(r.tripId, list);
    }
    for (const [tripId, group] of byTrip) {
      group.sort((a, b) => {
        const ta = new Date(`${a.toll.date ?? ""}T${a.time || "00:00:00"}`).getTime();
        const tb = new Date(`${b.toll.date ?? ""}T${b.time || "00:00:00"}`).getTime();
        return ta - tb;
      });
      const tripDetail = tripDetailsById.get(tripId);
      let remaining = tripRefundById.get(tripId) ?? 0;
      for (const r of group) {
        const allocated = Math.max(0, Math.min(remaining, r.cost));
        remaining -= allocated;
        r.toll.tripRefund = allocated;
        if (tripDetail) attachTripDisplayFields(r.toll, tripDetail);
      }
    }
  }

  return candidates.filter((t) => {
    const raw = rawTollById.get(t.tollId);
    return isBareTollEligibleForDisputeMatch({
      tollAmount: Math.abs(t.tollAmount || 0),
      tripRefund: t.tripRefund ?? null,
      workflowStage: raw?.workflowStage ?? null,
    });
  });
}

/** Single-toll shortfall check for smart suggestions / match guard. */
export async function computeLiveTripRefundForToll(
  rawToll: any,
  fleetTz: string,
): Promise<number | null> {
  const ctx = await resolveLiveTripContextForToll(rawToll, fleetTz);
  return ctx?.tripRefund ?? null;
}

/** Best-effort trip link + fare refund for a toll (persisted link or live match). */
export async function resolveLiveTripContextForToll(
  rawToll: any,
  fleetTz: string,
): Promise<{
  tripId: string;
  trip: any;
  tripRefund: number;
  tripLinkSource: "persisted" | "inferred";
} | null> {
  if (!rawToll) return null;

  const persistedTripId = rawToll.tripId ? String(rawToll.tripId) : null;
  if (persistedTripId) {
    const trip = await kv.get(`trip:${persistedTripId}`);
    if (trip) {
      const tollCost = Math.abs(Number(rawToll.amount) || 0);
      const pool = Math.abs(Number(trip.tollCharges) || 0);
      return {
        tripId: persistedTripId,
        trip,
        tripRefund: Math.max(0, Math.min(pool, tollCost)),
        tripLinkSource: "persisted",
      };
    }
  }

  const { trips } = await loadAllTollLedgerWithTrips();
  const matches = findTollMatchesServer(rawToll, trips, fleetTz);
  const validMatch = pickBestValidTollMatch(matches);
  if (!validMatch) return null;

  const tripValues = await kv.mget([`trip:${validMatch.tripId}`]);
  const trip = tripValues[0];
  if (!trip) return null;

  const tollCost = Math.abs(Number(rawToll.amount) || 0);
  const pool = Math.abs(Number(trip.tollCharges) || 0);
  return {
    tripId: validMatch.tripId,
    trip,
    tripRefund: Math.max(0, Math.min(pool, tollCost)),
    tripLinkSource: "inferred",
  };
}
