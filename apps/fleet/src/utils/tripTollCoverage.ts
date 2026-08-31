/**
 * Honest toll-detection coverage for fleet trips.
 * Imported Uber/inDrive rows usually have no GPS polyline — never invent charges.
 */

export type TripTollCoverageStatus =
  | 'not_applicable'
  | 'eligible'
  | 'detected'
  | 'no_plazas'
  | 'failed';

export type TripTollCoverage = {
  status: TripTollCoverageStatus;
  crossingCount: number;
  reason?: string;
  label: string;
};

export type TripTollCoverageInput = {
  route?: Array<{ lat?: number; lng?: number; lon?: number }> | null;
  isLiveRecorded?: boolean;
  /** Stamped by POST /trips replay when present. */
  tollDetection?: {
    status?: string;
    crossingCount?: number;
    reason?: string;
  } | null;
};

function routePointCount(route: TripTollCoverageInput['route']): number {
  if (!Array.isArray(route)) return 0;
  let n = 0;
  for (const p of route) {
    const lng = p?.lng ?? p?.lon;
    if (Number.isFinite(p?.lat) && Number.isFinite(lng)) n++;
  }
  return n;
}

export function resolveTripTollCoverage(trip: TripTollCoverageInput): TripTollCoverage {
  const stamped = trip.tollDetection;
  if (stamped?.status) {
    const status = stamped.status as TripTollCoverageStatus;
    const crossingCount = Number(stamped.crossingCount ?? 0) || 0;
    return {
      status,
      crossingCount,
      reason: stamped.reason,
      label: coverageLabel(status, crossingCount, stamped.reason),
    };
  }

  const pts = routePointCount(trip.route);
  if (pts < 2) {
    return {
      status: 'not_applicable',
      crossingCount: 0,
      reason: 'no_route_polyline',
      label: 'Toll detection: not available (no GPS route)',
    };
  }

  return {
    status: 'eligible',
    crossingCount: 0,
    reason: undefined,
    label: 'Toll detection: GPS route on file (awaiting / last replay)',
  };
}

function coverageLabel(
  status: TripTollCoverageStatus,
  crossingCount: number,
  reason?: string,
): string {
  switch (status) {
    case 'not_applicable':
      return 'Toll detection: not available (no GPS route)';
    case 'detected':
      return `Toll detection: ${crossingCount} plaza${crossingCount === 1 ? '' : 's'} on route`;
    case 'no_plazas':
      return 'Toll detection: no plazas on route';
    case 'failed':
      return `Toll detection: failed${reason ? ` (${reason})` : ''}`;
    case 'eligible':
    default:
      return 'Toll detection: GPS route on file';
  }
}
