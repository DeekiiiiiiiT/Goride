import { pointInPolygon, type CoverageVertex, type CoverageZone } from './index.ts';

export type ParishCoverageMode = 'town_zones' | 'parish_boundary';

export function parseFoundationPolygon(raw: unknown): CoverageVertex[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CoverageVertex[] = [];
  for (const pt of raw) {
    if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
      const lat = Number((pt as { lat: unknown }).lat);
      const lng = Number((pt as { lng: unknown }).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
    }
  }
  return out.length >= 3 ? out : null;
}

/** No foundation polygon means no outer gate. */
export function isInsideParishFoundation(
  lat: number,
  lng: number,
  polygon: CoverageVertex[] | null | undefined,
): boolean {
  if (!polygon || polygon.length < 3) return true;
  return pointInPolygon(lat, lng, polygon);
}

export function buildParishSyntheticZone(
  parishId: string,
  marketId: string,
  parishName: string,
  polygon: CoverageVertex[],
): CoverageZone {
  return {
    id: `parish-${parishId}-market-${marketId}`,
    name: `${parishName} parish`,
    market_id: marketId,
    kind: 'include',
    polygon,
  };
}
