import { sanitizeVertices } from './sanitizeVertices.ts';
import type { ActiveCoverageZone, LatLng, ZoneKind } from './zonesPayload.ts';

/** Minimal admin draft zone shape — avoids depending on dash-admin-client. */
export type AdminDraftZoneInput = {
  id: string;
  market_id?: string;
  name?: string;
  kind?: string | null;
  polygon?: unknown;
};

/** Map admin draft zone rows to ActiveCoverageZone (shared with customer loader). */
export function normalizeDraftZonesFromAdmin(
  rows: AdminDraftZoneInput[],
  marketId?: string,
): ActiveCoverageZone[] {
  const out: ActiveCoverageZone[] = [];
  for (const row of rows) {
    const polygon = sanitizeVertices(row.polygon);
    const kind: ZoneKind = row.kind === 'exclude' ? 'exclude' : 'include';
    if (polygon.length < 3) continue;
    out.push({
      id: String(row.id),
      name: row.name != null ? String(row.name) : undefined,
      kind,
      polygon,
      market_id: row.market_id != null ? String(row.market_id) : marketId,
    });
  }
  return out;
}

export type ZonesToMapPolygonsFilter = {
  kind?: ZoneKind;
  marketId?: string;
};

/** Extract polygon rings for map overlays. */
export function zonesToMapPolygons(
  zones: ActiveCoverageZone[],
  filter?: ZonesToMapPolygonsFilter,
): LatLng[][] {
  return zones
    .filter((z) => {
      if (filter?.kind && z.kind !== filter.kind) return false;
      if (filter?.marketId && z.market_id !== filter.marketId) return false;
      return z.polygon.length >= 3;
    })
    .map((z) => z.polygon);
}

function polygonSignature(polygon: LatLng[]): string {
  return polygon.map((v) => `${v.lat.toFixed(6)},${v.lng.toFixed(6)}`).join('|');
}

function includeSignatures(zones: ActiveCoverageZone[], marketId: string): string[] {
  return zones
    .filter((z) => z.kind === 'include' && z.market_id === marketId && z.polygon.length >= 3)
    .map((z) => polygonSignature(z.polygon))
    .sort();
}

/** True when draft include rings for a market differ from published includes. */
export function draftZonesDifferFromPublished(
  draft: ActiveCoverageZone[],
  published: ActiveCoverageZone[],
  marketId: string,
): boolean {
  const draftSigs = includeSignatures(draft, marketId);
  const publishedSigs = includeSignatures(published, marketId);
  if (draftSigs.length !== publishedSigs.length) return true;
  return draftSigs.some((sig, i) => sig !== publishedSigs[i]);
}
