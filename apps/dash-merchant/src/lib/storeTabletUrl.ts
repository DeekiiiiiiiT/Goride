import { ALL_JOB_STATIONS, type JobStation } from './venue-ops-presets';

export interface TabletUrlParams {
  code: string | null;
  station: JobStation | null;
  prepStationId: string | null;
}

const VALID_STATIONS = new Set<JobStation>(ALL_JOB_STATIONS);

export function isTabletEntryPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/tablet' || window.location.pathname.startsWith('/tablet/');
}

/** Alias for tablet route detection (store-tablet API context). */
export const isStoreTabletContext = isTabletEntryPath;

export function parseTabletUrlParams(): TabletUrlParams {
  if (typeof window === 'undefined') return { code: null, station: null, prepStationId: null };
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code')?.trim().toUpperCase() || null;
  const stationRaw = params.get('station');
  const station =
    stationRaw && VALID_STATIONS.has(stationRaw as JobStation)
      ? (stationRaw as JobStation)
      : null;
  const prepStationId = params.get('prepStation')?.trim() || null;
  return { code, station, prepStationId };
}
