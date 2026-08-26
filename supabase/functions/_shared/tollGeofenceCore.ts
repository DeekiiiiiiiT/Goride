/** Shared toll plaza proximity checks (live GPS + route estimate + fleet replay). */
import { bearingDeg, distanceMeters, type LatLng } from "./geo.ts";

/** Default cooldown before the SAME plaza can be re-counted (enables round trips). */
export const ROUND_TRIP_COOLDOWN_MS = 5 * 60 * 1000;

/** Half-angle (degrees) for direction gating vs plaza.direction. */
export const DIRECTION_BEARING_TOLERANCE_DEG = 60;

export type TollPlazaVerificationStatus = "verified" | "unverified" | "learnt";

export type TollPlazaDirection =
  | "Eastbound"
  | "Westbound"
  | "Northbound"
  | "Southbound"
  | "Both"
  | "Unknown"
  | string;

export interface TollPlazaGeo {
  id: string;
  name: string;
  location: LatLng;
  geofenceRadius: number;
  defaultRateMinor: number;
  currency: string;
  /** Travel direction the plaza services; used to kill parallel-carriageway FPs. */
  direction?: TollPlazaDirection;
  /**
   * Verification workflow status. Live charging requires `verified`.
   * Absent / legacy → treated as unverified (no charge) unless opts.requireVerified=false.
   */
  verificationStatus?: TollPlazaVerificationStatus;
}

export interface MatchOptions {
  /** Global fallback when plaza.geofenceRadius is unset/0. */
  fallbackRadiusM: number;
  /**
   * When true (default), only plazas with verificationStatus === "verified" match.
   * Set false for non-charging diagnostics / spatial audit.
   */
  requireVerified?: boolean;
  /** Skip plazas with no positive rate (default true). */
  requirePositiveRate?: boolean;
  /**
   * When set, bearing of the matched segment must agree with plaza.direction
   * (Both/Unknown/absent = no gate). Default true.
   */
  enforceDirection?: boolean;
  /** Bearing half-angle tolerance in degrees (default DIRECTION_BEARING_TOLERANCE_DEG). */
  directionToleranceDeg?: number;
}

export interface PolylineReplayOptions extends MatchOptions {
  /** Cooldown between re-counts of the same plaza along the polyline (default 5 min). */
  cooldownMs?: number;
  /** Optional per-point timestamps (epoch ms); used for cooldown. */
  pointTimesMs?: number[];
}

export interface PlazaCrossingHit {
  plazaId: string;
  plazaName: string;
  tollAmountMinor: number;
  currency: string;
  /** Approximate crossing location (segment midpoint or point). */
  lat: number;
  lng: number;
  /** Index of the segment end point (or single point) that triggered the hit. */
  pointIndex: number;
  /** Epoch ms when available. */
  atMs?: number;
  bearingDeg?: number;
}

function effectiveRadiusM(plaza: TollPlazaGeo, fallbackRadiusM: number): number {
  return plaza.geofenceRadius > 0 ? plaza.geofenceRadius : fallbackRadiusM;
}

function passesRateGate(plaza: TollPlazaGeo, requirePositiveRate: boolean): boolean {
  if (!requirePositiveRate) return true;
  return plaza.defaultRateMinor > 0;
}

function passesVerifiedGate(plaza: TollPlazaGeo, requireVerified: boolean): boolean {
  if (!requireVerified) return true;
  return plaza.verificationStatus === "verified";
}

/** Normalize plaza direction labels to a compass sector center, or null = no gate. */
export function plazaDirectionBearingDeg(direction: TollPlazaDirection | undefined): number | null {
  if (!direction) return null;
  const d = String(direction).trim().toLowerCase();
  if (!d || d === "both" || d === "unknown" || d === "any") return null;
  if (d.startsWith("east") || d === "eb" || d === "e") return 90;
  if (d.startsWith("west") || d === "wb" || d === "w") return 270;
  if (d.startsWith("north") || d === "nb" || d === "n") return 0;
  if (d.startsWith("south") || d === "sb" || d === "s") return 180;
  return null;
}

/** Smallest absolute difference between two bearings in [0, 180]. */
export function bearingDeltaDeg(a: number, b: number): number {
  const raw = Math.abs(((a - b + 540) % 360) - 180);
  return raw;
}

/** True when travel bearing agrees with plaza.direction (or direction is ungated). */
export function bearingMatchesPlazaDirection(
  travelBearingDeg: number,
  direction: TollPlazaDirection | undefined,
  toleranceDeg: number = DIRECTION_BEARING_TOLERANCE_DEG,
): boolean {
  const expected = plazaDirectionBearingDeg(direction);
  if (expected == null) return true;
  return bearingDeltaDeg(travelBearingDeg, expected) <= toleranceDeg;
}

/**
 * Minimum distance from circle center to the finite segment a→b (meters).
 * Uses local equirectangular projection around the plaza (accurate for ~km scales).
 */
export function distancePointToSegmentMeters(
  a: LatLng,
  b: LatLng,
  center: LatLng,
): number {
  const toRad = Math.PI / 180;
  const cosLat = Math.cos(center.lat * toRad);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * cosLat;

  const ax = (a.lng - center.lng) * metersPerDegLng;
  const ay = (a.lat - center.lat) * metersPerDegLat;
  const bx = (b.lng - center.lng) * metersPerDegLng;
  const by = (b.lat - center.lat) * metersPerDegLat;
  // Center is origin in this frame.
  const abx = bx - ax;
  const aby = by - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 < 1e-6) {
    // Degenerate segment → point distance.
    return Math.hypot(ax, ay);
  }
  // Projection of (0,0)−A onto AB, clamped to [0,1].
  let t = (-ax * abx + -ay * aby) / abLen2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(cx, cy);
}

/** True when the finite GPS segment a→b intersects the plaza circle. */
export function segmentIntersectsCircle(
  a: LatLng,
  b: LatLng,
  center: LatLng,
  radiusM: number,
): boolean {
  if (!(radiusM > 0)) return false;
  return distancePointToSegmentMeters(a, b, center) <= radiusM;
}

function resolveMatchFlags(opts: MatchOptions) {
  return {
    fallbackRadiusM: opts.fallbackRadiusM,
    requireVerified: opts.requireVerified !== false,
    requirePositiveRate: opts.requirePositiveRate !== false,
    enforceDirection: opts.enforceDirection !== false,
    directionToleranceDeg: opts.directionToleranceDeg ?? DIRECTION_BEARING_TOLERANCE_DEG,
  };
}

/**
 * Point within plaza geofence (uses plaza radius when > 0).
 * Prefer segmentIntersectsCircle / routeCrossesPlaza for live GPS — points alone
 * miss highway-speed skips between pings.
 */
export function isPointNearPlaza(
  point: LatLng,
  plaza: TollPlazaGeo,
  fallbackRadiusM: number,
  opts?: Partial<Omit<MatchOptions, "fallbackRadiusM">>,
): boolean {
  const flags = resolveMatchFlags({ fallbackRadiusM, ...opts });
  if (!passesRateGate(plaza, flags.requirePositiveRate)) return false;
  if (!passesVerifiedGate(plaza, flags.requireVerified)) return false;
  const radius = effectiveRadiusM(plaza, flags.fallbackRadiusM);
  return distanceMeters(point, plaza.location) <= radius;
}

/**
 * Segment a→b crosses the plaza geofence, with optional direction gating.
 * Returns bearing when the segment is non-degenerate.
 */
export function segmentCrossesPlaza(
  a: LatLng,
  b: LatLng,
  plaza: TollPlazaGeo,
  opts: MatchOptions,
): { hit: boolean; bearingDeg?: number } {
  const flags = resolveMatchFlags(opts);
  if (!passesRateGate(plaza, flags.requirePositiveRate)) return { hit: false };
  if (!passesVerifiedGate(plaza, flags.requireVerified)) return { hit: false };

  const radius = effectiveRadiusM(plaza, flags.fallbackRadiusM);
  if (!segmentIntersectsCircle(a, b, plaza.location, radius)) {
    return { hit: false };
  }

  const dist = distanceMeters(a, b);
  let travelBearing: number | undefined;
  if (dist >= 1) {
    travelBearing = bearingDeg(a, b);
    if (
      flags.enforceDirection &&
      !bearingMatchesPlazaDirection(travelBearing, plaza.direction, flags.directionToleranceDeg)
    ) {
      return { hit: false, bearingDeg: travelBearing };
    }
  }

  return { hit: true, bearingDeg: travelBearing };
}

/**
 * Any route segment (or single point) intersects the plaza geofence.
 * Uses segment-to-circle so highway-speed vehicles cannot skip a geofence between pings.
 */
export function routeCrossesPlaza(
  routePoints: LatLng[],
  plaza: TollPlazaGeo,
  fallbackRadiusM: number,
  opts?: Partial<Omit<MatchOptions, "fallbackRadiusM">>,
): boolean {
  if (routePoints.length === 0) return false;
  const matchOpts: MatchOptions = { fallbackRadiusM, ...opts };

  if (routePoints.length === 1) {
    return isPointNearPlaza(routePoints[0], plaza, fallbackRadiusM, opts);
  }

  for (let i = 1; i < routePoints.length; i++) {
    const { hit } = segmentCrossesPlaza(routePoints[i - 1], routePoints[i], plaza, matchOpts);
    if (hit) return true;
  }
  return false;
}

/**
 * Replay a polyline through the segment matcher with per-plaza cooldown.
 * Used for fleet post-trip detection (no live GPS stream) and tests.
 */
export function replayPolylineCrossings(
  routePoints: LatLng[],
  plazas: TollPlazaGeo[],
  opts: PolylineReplayOptions,
): PlazaCrossingHit[] {
  if (routePoints.length === 0 || plazas.length === 0) return [];

  const cooldownMs = opts.cooldownMs ?? ROUND_TRIP_COOLDOWN_MS;
  const matchOpts: MatchOptions = {
    fallbackRadiusM: opts.fallbackRadiusM,
    requireVerified: opts.requireVerified,
    requirePositiveRate: opts.requirePositiveRate,
    enforceDirection: opts.enforceDirection,
    directionToleranceDeg: opts.directionToleranceDeg,
  };
  const recentByPlaza = new Map<string, number>();
  const hits: PlazaCrossingHit[] = [];

  const timeAt = (i: number): number => {
    const t = opts.pointTimesMs?.[i];
    return typeof t === "number" && Number.isFinite(t) ? t : i * 1000;
  };

  const tryHit = (
    plaza: TollPlazaGeo,
    lat: number,
    lng: number,
    pointIndex: number,
    atMs: number,
    travelBearing?: number,
  ) => {
    const last = recentByPlaza.get(plaza.id);
    if (last !== undefined && atMs - last < cooldownMs) return;
    recentByPlaza.set(plaza.id, atMs);
    hits.push({
      plazaId: plaza.id,
      plazaName: plaza.name,
      tollAmountMinor: plaza.defaultRateMinor,
      currency: plaza.currency,
      lat,
      lng,
      pointIndex,
      atMs,
      bearingDeg: travelBearing,
    });
  };

  if (routePoints.length === 1) {
    const p = routePoints[0];
    const atMs = timeAt(0);
    for (const plaza of plazas) {
      if (!isPointNearPlaza(p, plaza, opts.fallbackRadiusM, matchOpts)) continue;
      tryHit(plaza, p.lat, p.lng, 0, atMs);
    }
    return hits;
  }

  for (let i = 1; i < routePoints.length; i++) {
    const a = routePoints[i - 1];
    const b = routePoints[i];
    const atMs = timeAt(i);
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    for (const plaza of plazas) {
      const { hit, bearingDeg: brng } = segmentCrossesPlaza(a, b, plaza, matchOpts);
      if (!hit) continue;
      tryHit(plaza, mid.lat, mid.lng, i, atMs, brng);
    }
  }

  return hits;
}

/**
 * Live consecutive-fix helper: evaluate segment prev→curr (or single curr when no prev).
 */
export function evaluateLiveFixAgainstPlazas(
  prev: LatLng | null,
  curr: LatLng,
  plazas: TollPlazaGeo[],
  opts: MatchOptions & {
    recentByPlaza?: Map<string, number>;
    cooldownMs?: number;
    nowMs?: number;
    alreadyCrossed?: Set<string>;
  },
): PlazaCrossingHit[] {
  const nowMs = opts.nowMs ?? Date.now();
  const cooldownMs = opts.cooldownMs ?? ROUND_TRIP_COOLDOWN_MS;
  const cooldownMode = !!opts.recentByPlaza;
  const hits: PlazaCrossingHit[] = [];

  for (const plaza of plazas) {
    if (cooldownMode) {
      const last = opts.recentByPlaza!.get(plaza.id);
      if (last !== undefined && nowMs - last < cooldownMs) continue;
    } else if (opts.alreadyCrossed?.has(plaza.id)) {
      continue;
    }

    let hit = false;
    let bearing: number | undefined;
    if (prev) {
      const res = segmentCrossesPlaza(prev, curr, plaza, opts);
      hit = res.hit;
      bearing = res.bearingDeg;
    } else {
      hit = isPointNearPlaza(curr, plaza, opts.fallbackRadiusM, opts);
    }
    if (!hit) continue;

    hits.push({
      plazaId: plaza.id,
      plazaName: plaza.name,
      tollAmountMinor: plaza.defaultRateMinor,
      currency: plaza.currency,
      lat: curr.lat,
      lng: curr.lng,
      pointIndex: 0,
      atMs: nowMs,
      bearingDeg: bearing,
    });
  }

  return hits;
}
