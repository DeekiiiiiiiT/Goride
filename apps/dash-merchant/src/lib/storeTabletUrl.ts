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

/** Drop station params so pairing flow can show the station picker again. */
export function clearTabletStationFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('station');
  params.delete('prepStation');
  const search = params.toString();
  window.history.replaceState({}, '', `/tablet${search ? `?${search}` : ''}`);
}

/** Keep pairing code in the URL so remounting opens the station picker. */
export function syncTabletPairingCodeInUrl(code: string) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  params.set('code', code.trim().toUpperCase());
  window.history.replaceState({}, '', `/tablet?${params.toString()}`);
}

const TABLET_RETURN_KEY = 'roam_tablet_return_url';

/** Remember where the user was before opening /tablet (same tab). */
export function captureTabletReturnUrl() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/tablet')) return;
  try {
    sessionStorage.setItem(TABLET_RETURN_KEY, window.location.href);
  } catch {
    // ignore quota / private mode
  }
}

export function clearTabletReturnUrl() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TABLET_RETURN_KEY);
  } catch {
    // ignore
  }
}

/** Go back to the screen before /tablet when possible. */
export function navigateTabletBack() {
  if (typeof window === 'undefined') return;
  try {
    const returnUrl = sessionStorage.getItem(TABLET_RETURN_KEY);
    if (returnUrl && !returnUrl.includes('/tablet')) {
      sessionStorage.removeItem(TABLET_RETURN_KEY);
      window.location.assign(returnUrl);
      return;
    }
  } catch {
    // ignore
  }
  if (window.history.length > 1) {
    window.history.back();
  }
}

export function canNavigateTabletBack() {
  if (typeof window === 'undefined') return false;
  try {
    const returnUrl = sessionStorage.getItem(TABLET_RETURN_KEY);
    if (returnUrl && !returnUrl.includes('/tablet')) return true;
  } catch {
    // ignore
  }
  return window.history.length > 1;
}
