import { ALL_JOB_STATIONS, type JobStation } from '@roam/merchant-ops';
import { hasDeviceSession } from '@roam/merchant-ops';

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

/** Kiosk context: tablet URL or an active paired device session. */
export function isStoreTabletContext(): boolean {
  return isTabletEntryPath() || hasDeviceSession();
}

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

export function clearTabletStationFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('station');
  params.delete('prepStation');
  const search = params.toString();
  window.history.replaceState({}, '', `/tablet${search ? `?${search}` : ''}`);
}

export function syncTabletPairingCodeInUrl(code: string) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('code', code.trim().toUpperCase());
  window.history.replaceState({}, '', `/tablet?${params.toString()}`);
}

export function canNavigateTabletBack(): boolean {
  if (typeof window === 'undefined') return false;
  return window.history.length > 1;
}

export function navigateTabletBack() {
  if (typeof window === 'undefined') return;
  window.history.back();
}

export function captureTabletReturnUrl() {
  // no-op on Command — tablets stay on Command origin
}

export function clearTabletReturnUrl() {
  // no-op
}
