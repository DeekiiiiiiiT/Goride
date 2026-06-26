import type { JobStation } from '../types/team';

export interface TabletUrlParams {
  code: string | null;
  station: JobStation | null;
}

const VALID_STATIONS = new Set<JobStation>(['counter', 'kitchen', 'manager']);

export function isTabletEntryPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/tablet' || window.location.pathname.startsWith('/tablet/');
}

export function parseTabletUrlParams(): TabletUrlParams {
  if (typeof window === 'undefined') return { code: null, station: null };
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code')?.trim().toUpperCase() || null;
  const stationRaw = params.get('station');
  const station =
    stationRaw && VALID_STATIONS.has(stationRaw as JobStation)
      ? (stationRaw as JobStation)
      : null;
  return { code, station };
}

export function buildStationDeepLink(code: string, station: JobStation): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://partner.roamdash.co';
  const params = new URLSearchParams({
    code: code.trim().toUpperCase(),
    station,
  });
  return `${origin}/tablet?${params.toString()}`;
}

export function clearTabletPath() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/tablet')) {
    window.history.replaceState({}, '', '/');
  }
}
