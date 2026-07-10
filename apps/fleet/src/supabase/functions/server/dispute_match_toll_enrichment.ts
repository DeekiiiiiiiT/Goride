/**
 * Live trip-refund enrichment for dispute match candidates — mirrors the
 * Underpaid & Claims shortfall display without persisting a trip link.
 */
import * as kv from "./kv_store.tsx";
import {
  findTollMatchesServer,
  pickBestValidTollMatch,
  loadAllTollLedgerWithTrips,
  getDriverAliasMap,
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

type TollPoolRow = { id: string; date: string; time?: string; amount: number };

function tollLedgerId(t: any): string | null {
  const id = t?.id ?? t?.transactionId;
  return id ? String(id) : null;
}

/** Shared pool: trip refund handed out in chronological order, each toll capped at its cost. */
export function allocateTripRefundShare(
  pool: number,
  tollId: string,
  siblings: TollPoolRow[],
): number {
  const sorted = [...siblings].sort((a, b) => {
    const ta = new Date(`${a.date}T${a.time || "00:00:00"}`).getTime();
    const tb = new Date(`${b.date}T${b.time || "00:00:00"}`).getTime();
    return ta - tb;
  });
  let remaining = pool;
  for (const s of sorted) {
    const share = Math.max(0, Math.min(remaining, s.amount));
    if (s.id === tollId) return share;
    remaining -= share;
  }
  return 0;
}

/** Persisted trip links only — avoids scanning all trips + live-matching unlinked tolls. */
async function gatherLinkedTollsForTripFast(
  targetTripId: string,
  focusToll: any,
): Promise<TollPoolRow[]> {
  const seen = new Set<string>();
  const rows: TollPoolRow[] = [];
  const add = (t: any) => {
    const id = tollLedgerId(t);
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      date: String(t.date || ""),
      time: t.time,
      amount: Math.abs(Number(t.amount) || 0),
    });
  };

  const ledger = await kv.getByPrefix("toll_ledger:");
  for (const t of ledger || []) {
    if (!t || typeof t !== "object") continue;
    if (String(t.tripId || "") === targetTripId) add(t);
  }
  add(focusToll);
  return rows;
}

/** Trip link stored on the toll row (reconciled, match-on-ingest, or top candidate). */
function persistedTripLink(rawToll: any): string | null {
  if (!rawToll || typeof rawToll !== "object") return null;
  if (rawToll.tripId) return String(rawToll.tripId);
  if (rawToll.matchedTripId) return String(rawToll.matchedTripId);
  const candidates = rawToll.metadata?.matchCandidates;
  if (Array.isArray(candidates) && candidates[0]?.tripId) {
    return String(candidates[0].tripId);
  }
  return null;
}

async function siblingsForTripPool(
  tripId: string,
  rawTollById: Map<string, any>,
  focusToll: any,
): Promise<TollPoolRow[]> {
  const rows = await gatherSiblingsForTripPool(tripId, focusToll, rawTollById);
  return rows;
}

/** All tolls sharing a trip link (persisted tripId or matchedTripId). */
async function gatherSiblingsForTripPool(
  tripId: string,
  focusToll: any,
  rawTollById?: Map<string, any>,
): Promise<TollPoolRow[]> {
  const rows = await gatherLinkedTollsForTripFast(tripId, focusToll);
  const seen = new Set(rows.map((r) => r.id));
  const addFromRaw = (raw: any) => {
    if (!raw || typeof raw !== "object") return;
    if (persistedTripLink(raw) !== tripId) return;
    const id = tollLedgerId(raw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      date: String(raw.date || ""),
      time: raw.time,
      amount: Math.abs(Number(raw.amount) || 0),
    });
  };
  if (rawTollById) {
    for (const raw of rawTollById.values()) addFromRaw(raw);
  } else {
    const ledger = await kv.getByPrefix("toll_ledger:");
    for (const raw of ledger || []) addFromRaw(raw);
  }
  return rows;
}

function gatherTollsSharingTrip(
  targetTripId: string,
  focusToll: any,
  tollTx: any[],
  trips: any[],
  fleetTz: string,
): TollPoolRow[] {
  const seen = new Set<string>();
  const rows: TollPoolRow[] = [];
  const add = (t: any) => {
    const id = tollLedgerId(t);
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      date: String(t.date || ""),
      time: t.time,
      amount: Math.abs(Number(t.amount) || 0),
    });
  };

  for (const t of tollTx) {
    if (String(t.tripId || "") === targetTripId) add(t);
  }
  for (const t of tollTx) {
    if (t.tripId) continue;
    if (t.type && String(t.type).toLowerCase() !== "usage") continue;
    const matches = findTollMatchesServer(t, trips, fleetTz);
    const best = pickBestValidTollMatch(matches);
    if (best?.tripId === targetTripId) add(t);
  }
  add(focusToll);
  return rows;
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

  const [{ trips }, driverAliasMap] = await Promise.all([
    loadAllTollLedgerWithTrips(),
    getDriverAliasMap(),
  ]);
  const resolved: {
    toll: BareTollCandidate;
    tripId: string;
    cost: number;
    time?: string;
  }[] = [];

  for (const t of candidates) {
    const rawToll = rawTollById.get(t.tollId);
    if (!rawToll) continue;

    const matches = findTollMatchesServer(rawToll, trips, fleetTz, driverAliasMap);
    const validMatch = pickBestValidTollMatch(matches);

    let tripId: string | null = null;
    if (validMatch) {
      if (t.tripId && t.tripId !== validMatch.tripId) {
        t.tripId = null;
      }
      tripId = validMatch.tripId;
      if (!t.tripId) t.suggestedTripId = validMatch.tripId;
    } else {
      const persisted = persistedTripLink(rawToll);
      if (persisted) {
        tripId = persisted;
        if (!t.tripId) t.suggestedTripId = persisted;
      } else if (t.tripId) {
        t.tripId = null;
      }
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
    const byTrip = new Map<string, typeof resolved>();
    for (const r of resolved) {
      const list = byTrip.get(r.tripId) || [];
      list.push(r);
      byTrip.set(r.tripId, list);
    }
    for (const [tripId, group] of byTrip) {
      const tripDetail = tripDetailsById.get(tripId);
      const pool = Math.abs(tripDetail?.tollCharges || 0);
      const focusRaw = rawTollById.get(group[0].toll.tollId) || group[0];
      const siblings = await siblingsForTripPool(tripId, rawTollById, focusRaw);
      for (const r of group) {
        r.toll.tripRefund = allocateTripRefundShare(pool, r.toll.tollId, siblings);
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
  opts?: { suggestedTripId?: string | null },
): Promise<number | null> {
  const ctx = await resolveLiveTripContextForToll(rawToll, fleetTz, opts);
  return ctx?.tripRefund ?? null;
}

/** Best-effort trip link + pooled fare refund for a toll (persisted, suggested, or live match). */
export async function resolveLiveTripContextForToll(
  rawToll: any,
  fleetTz: string,
  opts?: { suggestedTripId?: string | null },
): Promise<{
  tripId: string;
  trip: any;
  tripRefund: number;
  tripLinkSource: "persisted" | "inferred" | "suggested";
} | null> {
  if (!rawToll) return null;

  const tollId = tollLedgerId(rawToll);
  const tollCost = Math.abs(Number(rawToll.amount) || 0);
  const persistedTripId = persistedTripLink(rawToll);
  const suggestedTripId = opts?.suggestedTripId ? String(opts.suggestedTripId) : null;

  let tripId: string | null = persistedTripId ?? suggestedTripId ?? null;
  let tripLinkSource: "persisted" | "inferred" | "suggested" = persistedTripId
    ? "persisted"
    : suggestedTripId
      ? "suggested"
      : "inferred";

  // Fast path: trip already known (UI pick or persisted link) — skip full ledger + trip load.
  if (tripId) {
    const trip = (await kv.mget([`trip:${tripId}`]))[0];
    if (!trip) return null;
    const pool = Math.abs(Number(trip.tollCharges) || 0);
    const siblings = await gatherSiblingsForTripPool(tripId, rawToll);
    const tripRefund = tollId
      ? allocateTripRefundShare(pool, tollId, siblings)
      : Math.max(0, Math.min(pool, tollCost));
    return { tripId, trip, tripRefund, tripLinkSource };
  }

  const { tollTx, trips } = await loadAllTollLedgerWithTrips();

  if (!tripId) {
    const matches = findTollMatchesServer(rawToll, trips, fleetTz);
    const validMatch = pickBestValidTollMatch(matches);
    if (!validMatch?.tripId) return null;
    tripId = validMatch.tripId;
    tripLinkSource = "inferred";
  }

  const trip = (await kv.mget([`trip:${tripId}`]))[0];
  if (!trip) return null;

  const pool = Math.abs(Number(trip.tollCharges) || 0);
  const siblings = gatherTollsSharingTrip(tripId, rawToll, tollTx, trips, fleetTz);
  const tripRefund = tollId
    ? allocateTripRefundShare(pool, tollId, siblings)
    : Math.max(0, Math.min(pool, tollCost));

  return { tripId, trip, tripRefund, tripLinkSource };
}
