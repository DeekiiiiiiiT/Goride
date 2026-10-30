// Stitch: dominion-redesign/s36c-level-browser
import { geoFetch } from '../geoClient';
import type { BoundaryRow, ImpactView, VersionRow } from './levelsFormat';

export function fetchBoundaries(token: string, level: number, parent?: string): Promise<BoundaryRow[]> {
  const parentQuery = parent ? `&parent=${encodeURIComponent(parent)}` : '';
  return geoFetch(token, `/geo/boundaries?with=metrics&level=${level}${parentQuery}`).then((body) => (body.boundaries as BoundaryRow[]) ?? []);
}

export function fetchVersions(token: string, pcode: string): Promise<VersionRow[]> {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`).then((body) => (body.versions as VersionRow[]) ?? []);
}

export function fetchShape(token: string, pcode: string, versionId: string) {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${versionId}/shape`);
}

export function fetchShapes(token: string, level: number, bbox: string) {
  const levels = level > 0 ? `${level},${level - 1}` : String(level);
  return geoFetch(token, `/geo/shapes?levels=${levels}&bbox=${encodeURIComponent(bbox)}`);
}

export function saveDraft(token: string, pcode: string, geojson: unknown, notes: string) {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions`, {
    method: 'POST',
    body: JSON.stringify({ geojson, notes }),
  });
}

export function discardDraft(token: string, pcode: string, versionId: string) {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${versionId}`, { method: 'DELETE' });
}

export function fetchImpact(token: string, pcode: string, versionId: string): Promise<ImpactView> {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${versionId}/impact`, { method: 'POST', body: '{}' }) as Promise<ImpactView>;
}

export function publishVersion(token: string, pcode: string, versionId: string, confirmName: string) {
  return geoFetch(token, `/geo/boundaries/${encodeURIComponent(pcode)}/versions/${versionId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ confirm_name: confirmName }),
  });
}
