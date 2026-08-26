/**
 * Fleet post-trip toll detection — replay saved Trip.route through the shared
 * segment geofence matcher. There is no live GPS stream for fleet trips;
 * useTripTracker persists the polyline on completion and POST /trips triggers this.
 */
import type { LatLng } from "../_shared/geo.ts";
import {
  ROUND_TRIP_COOLDOWN_MS,
  replayPolylineCrossings,
  type PlazaCrossingHit,
  type TollPlazaGeo,
} from "../_shared/tollGeofenceCore.ts";
import {
  loadTollPlazas,
  type LoadedTollPlaza,
} from "../_shared/tollPlazaLoader.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface FleetRoutePoint {
  lat: number;
  lon?: number;
  lng?: number;
  timestamp?: number;
}

export interface FleetTripForTollReplay {
  id: string;
  driverId?: string | null;
  driverName?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
  route?: FleetRoutePoint[] | null;
  organizationId?: string | null;
  date?: string | null;
  isLiveRecorded?: boolean;
}

export interface FleetTollReplayResult {
  tripId: string;
  scanned: boolean;
  hits: PlazaCrossingHit[];
  written: number;
  skipped: number;
  reason?: string;
}

function toLatLng(p: FleetRoutePoint): LatLng | null {
  const lng = p.lng ?? p.lon;
  if (!Number.isFinite(p.lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(p.lat), lng: Number(lng) };
}

export function normalizeFleetRoutePoints(
  route: FleetRoutePoint[] | null | undefined,
): { points: LatLng[]; timesMs: number[] } {
  const points: LatLng[] = [];
  const timesMs: number[] = [];
  if (!Array.isArray(route)) return { points, timesMs };
  for (let i = 0; i < route.length; i++) {
    const ll = toLatLng(route[i]);
    if (!ll) continue;
    points.push(ll);
    const t = route[i].timestamp;
    timesMs.push(typeof t === "number" && Number.isFinite(t) ? t : i * 1000);
  }
  return { points, timesMs };
}

function toPlazaGeo(p: LoadedTollPlaza): TollPlazaGeo {
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    geofenceRadius: p.geofenceRadius,
    defaultRateMinor: p.defaultRateMinor,
    currency: p.currency,
    direction: p.direction,
    verificationStatus: p.verificationStatus,
  };
}

/** Pure replay — no IO. */
export function detectFleetTripTollCrossings(
  trip: FleetTripForTollReplay,
  plazas: TollPlazaGeo[],
  opts?: {
    fallbackRadiusM?: number;
    cooldownMs?: number;
  },
): PlazaCrossingHit[] {
  const { points, timesMs } = normalizeFleetRoutePoints(trip.route);
  if (points.length < 2) return [];
  return replayPolylineCrossings(points, plazas, {
    fallbackRadiusM: opts?.fallbackRadiusM ?? 100,
    cooldownMs: opts?.cooldownMs ?? ROUND_TRIP_COOLDOWN_MS,
    pointTimesMs: timesMs,
    requireVerified: true,
    enforceDirection: true,
  });
}

export type SaveFleetTollUsageFn = (entry: {
  id: string;
  createdAt: string;
  updatedAt: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  tollTagId: null;
  tagNumber: null;
  plaza: string;
  plazaId: string;
  highway: null;
  location: string;
  date: string;
  time: string | null;
  type: "usage";
  amount: number;
  paymentMethod: "fleet_account";
  status: "pending";
  resolution: null;
  isReconciled: false;
  tripId: string;
  matchConfidence: null;
  matchedAt: null;
  matchedBy: null;
  batchId: null;
  batchName: null;
  importedAt: string;
  sourceFile: null;
  receiptUrl: null;
  referenceNumber: string;
  description: string;
  notes: null;
  auditTrail: [];
  metadata: Record<string, unknown>;
  organizationId?: string | null;
}) => Promise<boolean>;

/**
 * Run post-trip replay for one fleet trip and persist attributed ledger rows.
 * Idempotent via referenceNumber = fleet_replay:{tripId}:{plazaId}:{pointIndex}.
 */
export async function replayAndPersistFleetTripTolls(input: {
  db: SupabaseClient;
  trip: FleetTripForTollReplay;
  saveTollUsage: SaveFleetTollUsageFn;
  fallbackRadiusM?: number;
  cooldownMs?: number;
}): Promise<FleetTollReplayResult> {
  const tripId = String(input.trip.id || "").trim();
  if (!tripId) {
    return { tripId: "", scanned: false, hits: [], written: 0, skipped: 0, reason: "missing_trip_id" };
  }

  const { points } = normalizeFleetRoutePoints(input.trip.route);
  if (points.length < 2) {
    return {
      tripId,
      scanned: false,
      hits: [],
      written: 0,
      skipped: 0,
      reason: "no_route_polyline",
    };
  }

  const orgId =
    input.trip.organizationId != null && String(input.trip.organizationId).trim()
      ? String(input.trip.organizationId)
      : null;

  const loaded = await loadTollPlazas(input.db, { organizationId: orgId });
  const plazas = loaded.map(toPlazaGeo);
  const hits = detectFleetTripTollCrossings(input.trip, plazas, {
    fallbackRadiusM: input.fallbackRadiusM,
    cooldownMs: input.cooldownMs,
  });

  let written = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const date =
    (input.trip.date && String(input.trip.date).split("T")[0]) ||
    now.split("T")[0];

  const vehicleId =
    input.trip.vehicleId && input.trip.vehicleId !== "unknown"
      ? String(input.trip.vehicleId)
      : null;
  const driverId = input.trip.driverId ? String(input.trip.driverId) : null;

  for (const hit of hits) {
    const ref = `fleet_replay:${tripId}:${hit.plazaId}:${hit.pointIndex}`;
    const ledgerId = crypto.randomUUID();
    const amountMajor = hit.tollAmountMinor / 100;
    try {
      const saved = await input.saveTollUsage({
        id: ledgerId,
        createdAt: now,
        updatedAt: now,
        vehicleId,
        vehiclePlate: input.trip.vehiclePlate ? String(input.trip.vehiclePlate) : null,
        driverId,
        driverName: input.trip.driverName ? String(input.trip.driverName) : null,
        tollTagId: null,
        tagNumber: null,
        plaza: hit.plazaName,
        plazaId: hit.plazaId,
        highway: null,
        location: hit.plazaName,
        date,
        time: hit.atMs ? new Date(hit.atMs).toISOString().slice(11, 19) : null,
        type: "usage",
        amount: -Math.abs(amountMajor),
        paymentMethod: "fleet_account",
        status: "pending",
        resolution: null,
        isReconciled: false,
        tripId,
        matchConfidence: null,
        matchedAt: null,
        matchedBy: null,
        batchId: null,
        batchName: null,
        importedAt: now,
        sourceFile: null,
        receiptUrl: null,
        referenceNumber: ref,
        description: `Toll crossing (fleet post-trip replay): ${hit.plazaName}`,
        notes: null,
        auditTrail: [],
        metadata: {
          source: "roam_geofence_fleet_replay",
          tollPlazaId: hit.plazaId,
          currency: hit.currency,
          driverLat: hit.lat,
          driverLng: hit.lng,
          pointIndex: hit.pointIndex,
          bearingDeg: hit.bearingDeg ?? null,
          tripId,
          isLiveRecorded: input.trip.isLiveRecorded === true,
        },
        organizationId: orgId,
      });
      if (saved) written++;
      else skipped++;
    } catch (e) {
      console.warn(
        `[fleetTripTollReplay] persist failed trip=${tripId} plaza=${hit.plazaId}:`,
        e instanceof Error ? e.message : e,
      );
      skipped++;
    }
  }

  return { tripId, scanned: true, hits, written, skipped };
}

/** Batch helper for POST /trips — only trips with a recorded route are replayed. */
export async function replayFleetTripsWithRoutes(input: {
  db: SupabaseClient;
  trips: FleetTripForTollReplay[];
  saveTollUsage: SaveFleetTollUsageFn;
  fallbackRadiusM?: number;
  cooldownMs?: number;
}): Promise<{ tripsScanned: number; crossingsWritten: number; results: FleetTollReplayResult[] }> {
  const results: FleetTollReplayResult[] = [];
  let crossingsWritten = 0;
  let tripsScanned = 0;
  for (const trip of input.trips) {
    const { points } = normalizeFleetRoutePoints(trip.route);
    if (points.length < 2) continue;
    const r = await replayAndPersistFleetTripTolls({
      db: input.db,
      trip,
      saveTollUsage: input.saveTollUsage,
      fallbackRadiusM: input.fallbackRadiusM,
      cooldownMs: input.cooldownMs,
    });
    results.push(r);
    if (r.scanned) tripsScanned++;
    crossingsWritten += r.written;
  }
  return { tripsScanned, crossingsWritten, results };
}
