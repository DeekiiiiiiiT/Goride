import type { CoverageVertex } from './index.ts';

/** Drop invalid lat/lng vertices — shared by admin + customer zone normalizers. */
export function sanitizeVertices(raw: unknown): CoverageVertex[] {
  if (!Array.isArray(raw)) return [];
  const out: CoverageVertex[] = [];
  for (const pt of raw) {
    if (!pt || typeof pt !== 'object' || !('lat' in pt) || !('lng' in pt)) continue;
    const lat = Number((pt as { lat: unknown }).lat);
    const lng = Number((pt as { lng: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}
