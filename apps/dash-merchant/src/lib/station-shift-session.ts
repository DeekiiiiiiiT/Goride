import {
  type JobStation,
  type RosterMember,
} from '../types/team';
import { isStoreTabletContext } from './storeTabletUrl';

export type ShiftSessionSurface = 'owner_kiosk' | 'store_tablet';

export interface StationShiftSession {
  token: string;
  expiresAt: string;
  member: RosterMember;
}

function storageKey(merchantId: string, surface: ShiftSessionSurface) {
  return `roam_station_shift_${surface}_${merchantId}`;
}

export function resolveShiftSurface(): ShiftSessionSurface {
  return isStoreTabletContext() ? 'store_tablet' : 'owner_kiosk';
}

export function persistShift(
  merchantId: string,
  session: StationShiftSession,
  surface: ShiftSessionSurface = resolveShiftSurface(),
) {
  sessionStorage.setItem(storageKey(merchantId, surface), JSON.stringify(session));
}

function legacyStorageKey(merchantId: string) {
  return `roam_station_shift_${merchantId}`;
}

function consumeLegacyShift(merchantId: string, surface: ShiftSessionSurface): string | null {
  const legacyKey = legacyStorageKey(merchantId);
  const legacy = sessionStorage.getItem(legacyKey);
  if (!legacy) return null;
  sessionStorage.removeItem(legacyKey);
  if (surface === 'store_tablet') {
    sessionStorage.setItem(storageKey(merchantId, surface), legacy);
    return legacy;
  }
  return null;
}

export function readShift(
  merchantId: string,
  surface: ShiftSessionSurface = resolveShiftSurface(),
): StationShiftSession | null {
  try {
    let raw = sessionStorage.getItem(storageKey(merchantId, surface));
    if (!raw) {
      raw = consumeLegacyShift(merchantId, surface);
      if (!raw) return null;
    }
    const parsed = JSON.parse(raw) as StationShiftSession;
    if (!parsed.token || !parsed.member?.id) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearShift(merchantId, surface);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearShift(
  merchantId: string,
  surface: ShiftSessionSurface = resolveShiftSurface(),
) {
  sessionStorage.removeItem(storageKey(merchantId, surface));
}

export function getActingMember(
  merchantId: string,
  surface: ShiftSessionSurface = resolveShiftSurface(),
): RosterMember | null {
  return readShift(merchantId, surface)?.member ?? null;
}

export function getActingKioskRoute(
  merchantId: string,
  surface: ShiftSessionSurface = 'owner_kiosk',
): 'counter' | 'kitchen' | 'manager' | null {
  const member = getActingMember(merchantId, surface);
  if (!member) return null;

  const station = member.jobStation;
  if (station === 'counter' || station === 'kitchen') return station;
  if (station === 'manager' || member.role === 'manager') return 'manager';
  return null;
}

/** @deprecated Use getActingKioskRoute */
export function getActingStation(
  merchantId: string,
  surface: ShiftSessionSurface = 'owner_kiosk',
): JobStation | null {
  const route = getActingKioskRoute(merchantId, surface);
  return route === 'counter' || route === 'kitchen' ? route : null;
}
