/**
 * Shift breaks and the legs we can route: home to a shift, and a short
 * gap from one dropoff to the next pickup.
 */
import { DEFAULT_SHIFT_BREAK_HOURS, REPOSITION_GAP_MAX_MINUTES } from './evidenceLadder.ts';

export type LegPoint = {
  lat?: number;
  lng?: number;
  label?: string;
};

export type ShiftTrip = {
  id?: string;
  requestTime?: string;
  dropoffTime?: string;
  date?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  pickupLocation?: string;
  dropoffLocation?: string;
  enrouteKm?: number;
  openKm?: number;
  unavailableKm?: number;
};

export type RouteLeg = {
  from: LegPoint;
  to: LegPoint;
  /** Positioning already inside the next trip file. */
  alreadyCountedKm: number;
};

const SHIFT_BREAK_MS = DEFAULT_SHIFT_BREAK_HOURS * 60 * 60 * 1000;
const REPOSITION_MAX_MS = REPOSITION_GAP_MAX_MINUTES * 60 * 1000;
const LAT_LON_LABEL = /Lat:\s*(-?\d+(?:\.\d+)?)\s*,\s*Lon:\s*(-?\d+(?:\.\d+)?)/i;

/** Roam sometimes stores a pin as text: "Lat: 17.97911, Lon: -76.99786". */
export function coordsFromLabel(label?: string): { lat: number; lng: number } | null {
  const match = String(label || '').match(LAT_LON_LABEL);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function alreadyOnTrip(trip: ShiftTrip): number {
  return (
    Math.max(0, Number(trip.enrouteKm) || 0) +
    Math.max(0, Number(trip.openKm) || 0) +
    Math.max(0, Number(trip.unavailableKm) || 0)
  );
}

/** Routed distance left after the trip file already counted part of the same drive. */
export function netLegKm(routedKm: number | null, alreadyCountedKm: number): number | null {
  if (routedKm == null || !Number.isFinite(routedKm)) return null;
  return Math.max(0, routedKm - (Number(alreadyCountedKm) || 0));
}

export type MeasuredGap = {
  routedKm: number | null;
  straightKm: number | null;
  alreadyCountedKm: number;
};

/**
 * One gap that cannot be routed does not throw away the others.
 * Straight-line is used only for that gap. The week estimate is for when nothing was measured.
 */
export function foldMeasuredGaps(gaps: MeasuredGap[]): {
  repositionKm: number | null;
  measured: boolean;
  anyEstimated: boolean;
  anySkipped: boolean;
} {
  let sum = 0;
  let measuredCount = 0;
  let anyEstimated = false;
  let anySkipped = false;
  for (const gap of gaps) {
    const routed = netLegKm(gap.routedKm, gap.alreadyCountedKm);
    if (routed != null) {
      sum += routed;
      measuredCount += 1;
      continue;
    }
    const straight = netLegKm(gap.straightKm, gap.alreadyCountedKm);
    if (straight != null) {
      sum += straight;
      measuredCount += 1;
      anyEstimated = true;
      continue;
    }
    anySkipped = true;
  }
  if (measuredCount === 0) {
    return { repositionKm: null, measured: false, anyEstimated: false, anySkipped };
  }
  return {
    repositionKm: Math.round(sum * 100) / 100,
    measured: true,
    anyEstimated,
    anySkipped,
  };
}

function instant(value?: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function startMs(trip: ShiftTrip): number | null {
  return instant(trip.requestTime) ?? instant(trip.date);
}

function endMs(trip: ShiftTrip): number | null {
  return instant(trip.dropoffTime) ?? startMs(trip);
}

export function pointUsable(point: LegPoint | undefined): boolean {
  if (!point) return false;
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) return true;
  return Boolean(point.label && point.label.trim());
}

function located(point: LegPoint): LegPoint {
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) return point;
  const parsed = coordsFromLabel(point.label);
  if (!parsed) return point;
  return { ...point, lat: parsed.lat, lng: parsed.lng };
}

function pickup(trip: ShiftTrip): LegPoint {
  return located({
    lat: numberOrUndefined(trip.startLat),
    lng: numberOrUndefined(trip.startLng),
    label: trip.pickupLocation,
  });
}

function dropoff(trip: ShiftTrip): LegPoint {
  return located({
    lat: numberOrUndefined(trip.endLat),
    lng: numberOrUndefined(trip.endLng),
    label: trip.dropoffLocation,
  });
}

function numberOrUndefined(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

export function groupShifts(trips: ShiftTrip[]): ShiftTrip[][] {
  const ordered = (trips || [])
    .filter((trip) => startMs(trip) != null)
    .sort((a, b) => (startMs(a) || 0) - (startMs(b) || 0));
  const shifts: ShiftTrip[][] = [];
  for (const trip of ordered) {
    const current = shifts[shifts.length - 1];
    const previous = current?.[current.length - 1];
    const gap = previous ? (startMs(trip) || 0) - (endMs(previous) || 0) : 0;
    if (!current || gap >= SHIFT_BREAK_MS) shifts.push([trip]);
    else current.push(trip);
  }
  return shifts;
}

export function commuteLegs(home: LegPoint, shifts: ShiftTrip[][]): RouteLeg[] {
  if (!pointUsable(home)) return [];
  const legs: RouteLeg[] = [];
  for (const shift of shifts) {
    const first = shift[0];
    const last = shift[shift.length - 1];
    if (!first || !last) continue;
    const start = pickup(first);
    const end = dropoff(last);
    if (pointUsable(start)) {
      legs.push({ from: home, to: start, alreadyCountedKm: alreadyOnTrip(first) });
    }
    if (pointUsable(end)) legs.push({ from: end, to: home, alreadyCountedKm: 0 });
  }
  return legs;
}

/** Dropoff to the next pickup when the wait stays inside one shift and under 30 minutes. */
export function repositionGaps(shifts: ShiftTrip[][]): RouteLeg[] {
  const gaps: RouteLeg[] = [];
  for (const shift of shifts) {
    for (let i = 0; i < shift.length - 1; i++) {
      const prev = shift[i];
      const next = shift[i + 1];
      const gap = (startMs(next) || 0) - (endMs(prev) || 0);
      if (gap < 0 || gap >= REPOSITION_MAX_MS) continue;
      const from = dropoff(prev);
      const to = pickup(next);
      if (!pointUsable(from) || !pointUsable(to)) continue;
      gaps.push({ from, to, alreadyCountedKm: alreadyOnTrip(next) });
    }
  }
  return gaps;
}
