// Stitch: dominion-redesign/s36c-level-browser
import type { DashZoneVertex } from '@roam/dash-admin-client';

export type BoundaryRow = {
  pcode: string;
  admin_level: number;
  parent_pcode: string | null;
  name: string;
  parent_name: string | null;
  parish_pcode: string | null;
  town_pcode: string | null;
  area_sqkm: number | null;
  vertex_count: number | null;
  children: number | null;
  version: number | null;
  published_at: string | null;
  has_draft: boolean;
  same_name_count: number;
};

export type DraftChecks = {
  valid?: boolean;
  outside_parent_pct?: number;
  outside_parent_name?: string | null;
  overlap_pct?: number;
  overlap_with?: string | null;
  area_change_pct?: number;
  vertex_count?: number;
  warnings?: string[];
};

export type VersionRow = {
  id: string;
  version: number;
  status: string;
  created_at: string;
  notes?: string | null;
  source?: string | null;
  checks?: DraftChecks | null;
};

export type ImpactView = {
  name?: string;
  places_moving?: number;
  places_sample?: Array<{ name?: string } | string>;
  live_markets?: number;
  merchants_moving?: number;
  merchants_checked?: number;
  area_change_pct?: number;
  needs_typed_name?: boolean;
  version_id?: string;
};

export function levelFromPage(page: string): 1 | 2 | 3 {
  if (page === 'world-towns') return 2;
  if (page === 'world-communities') return 3;
  return 1;
}

export function pageForLevel(level: number): string {
  if (level === 2) return 'world-towns';
  if (level === 3) return 'world-communities';
  return 'world-parishes';
}

export function levelWord(level: number): string {
  if (level === 1) return 'Parish';
  if (level === 2) return 'Town';
  return 'Community';
}

export function levelPlural(level: number): string {
  if (level === 1) return 'parishes';
  if (level === 2) return 'towns';
  return 'communities';
}

export function childWord(level: number): string {
  if (level === 1) return 'towns';
  if (level === 2) return 'communities';
  return '';
}

export function uploadRefusal(featureCount: number, geometryType: string | null): string | null {
  if (featureCount > 1) return `This file has ${featureCount} areas. Use Imports for more than one.`;
  if (geometryType !== 'Polygon' && geometryType !== 'MultiPolygon') return 'This file has no area shape.';
  return null;
}

export function simplifyRing(points: DashZoneVertex[], detail: 'full' | 'medium' | 'light'): DashZoneVertex[] {
  const tolerance = detail === 'light' ? 0.0003 : detail === 'medium' ? 0.0001 : 0;
  if (tolerance <= 0 || points.length < 4) return points;
  const kept = [points[0]];
  for (const point of points.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point.lat - last.lat, point.lng - last.lng) >= tolerance) kept.push(point);
  }
  return kept.length >= 3 ? kept : points;
}

export function sampleNames(sample: ImpactView['places_sample']): string {
  return (sample ?? [])
    .slice(0, 10)
    .map((row) => (typeof row === 'string' ? row : row.name || ''))
    .filter(Boolean)
    .join(', ');
}

export function canConfirmPublish(input: {
  impactLoaded: boolean;
  warnings: string[];
  ticked: number;
  needsName: boolean;
  typed: string;
  expectedName: string;
}): boolean {
  if (!input.impactLoaded) return false;
  if (input.ticked < input.warnings.length) return false;
  if (input.needsName && input.typed.trim().toLowerCase() !== input.expectedName.trim().toLowerCase()) return false;
  return true;
}

export type SortKey = 'name' | 'pcode' | 'parent_name' | 'area_sqkm' | 'vertex_count' | 'children' | 'version' | 'published_at';

export function sortRows(rows: BoundaryRow[], key: SortKey, dir: 1 | -1): BoundaryRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
