/**
 * ADR-0018: Service areas as live coverage.
 * When a market has any non-import include (service area), official import borders
 * are context-only and excluded from customer coverage evaluation.
 */

export type LiveZoneSource = string | null | undefined;

export type LiveZoneLike = {
  kind?: string | null;
  source?: LiveZoneSource;
  market_id?: string | null;
};

const SERVICE_INCLUDE_SOURCES = new Set(['manual', 'radius', 'auto_outline']);

export function normalizeZoneSource(source: LiveZoneSource): string {
  return String(source ?? 'manual').toLowerCase();
}

export function isServiceIncludeSource(source: LiveZoneSource): boolean {
  return SERVICE_INCLUDE_SOURCES.has(normalizeZoneSource(source));
}

export function isImportIncludeSource(source: LiveZoneSource): boolean {
  return normalizeZoneSource(source) === 'import';
}

export function isIncludeKind(kind: string | null | undefined): boolean {
  return String(kind ?? 'include').toLowerCase() !== 'exclude';
}

/** True when this market has at least one service-area (non-import) include. */
export function marketHasServiceAreas(zones: LiveZoneLike[]): boolean {
  return zones.some((z) => isIncludeKind(z.kind) && isServiceIncludeSource(z.source));
}

/**
 * Filter zones for live customer coverage.
 * - Excludes always pass through (temporary cutouts).
 * - Includes: if any service include exists (per market or globally in the list),
 *   drop import includes for markets that have service areas.
 * - Markets with only import includes keep import includes (compat).
 */
export function filterLiveCoverageZones<T extends LiveZoneLike>(zones: T[]): T[] {
  const serviceMarkets = new Set<string>();
  let anyServiceWithoutMarket = false;

  for (const z of zones) {
    if (!isIncludeKind(z.kind) || !isServiceIncludeSource(z.source)) continue;
    if (z.market_id != null && String(z.market_id)) {
      serviceMarkets.add(String(z.market_id));
    } else {
      anyServiceWithoutMarket = true;
    }
  }

  return zones.filter((z) => {
    if (!isIncludeKind(z.kind)) return true; // excludes + unknown stay
    if (!isImportIncludeSource(z.source)) return true; // service includes always live
    // Import include: live only if this market has no service areas
    const mid = z.market_id != null ? String(z.market_id) : '';
    if (mid && serviceMarkets.has(mid)) return false;
    if (!mid && anyServiceWithoutMarket) return false;
    return true;
  });
}

/** Coverage role for API/UI: live delivery vs map context only. */
export function coverageRoleForZone(
  zone: LiveZoneLike,
  allZones: LiveZoneLike[],
): 'live' | 'context' {
  if (!isIncludeKind(zone.kind)) return 'live';
  if (!isImportIncludeSource(zone.source)) return 'live';
  const mid = zone.market_id != null ? String(zone.market_id) : '';
  const peers = mid ? allZones.filter((z) => String(z.market_id ?? '') === mid) : allZones;
  return marketHasServiceAreas(peers) ? 'context' : 'live';
}
