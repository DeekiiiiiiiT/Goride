import type { JobStation } from '../types/team';

/** Station locked on a paired store tablet device. */
export type StoreTabletStation = JobStation;

export interface StoreTabletSession {
  deviceToken: string;
  merchantId: string;
  storeName: string;
  station: StoreTabletStation;
  expiresAt: string;
  staffOperationsEnabled: boolean;
  staffStationPinEnabled: boolean;
  /** False when owner has not opted into in-store / POS yet. */
  inStoreOperationsEnabled?: boolean;
  /** Kitchen prep zone lock when prepStationsV1 is on. */
  prepStationId?: string | null;
}

const STORAGE_KEY = 'roam_store_tablet_session';

export function persistDeviceSession(session: StoreTabletSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function readDeviceSession(): StoreTabletSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreTabletSession;
    if (!parsed.deviceToken || !parsed.merchantId || !parsed.station) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearDeviceSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDeviceSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasDeviceSession(): boolean {
  return readDeviceSession() != null;
}
