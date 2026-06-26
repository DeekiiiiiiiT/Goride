import {
  type JobStation,
  type RosterMember,
} from '../types/team';

export interface StationShiftSession {
  token: string;
  expiresAt: string;
  member: RosterMember;
}

function storageKey(merchantId: string) {
  return `roam_station_shift_${merchantId}`;
}

export function persistShift(merchantId: string, session: StationShiftSession) {
  sessionStorage.setItem(storageKey(merchantId), JSON.stringify(session));
}

export function readShift(merchantId: string): StationShiftSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(merchantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StationShiftSession;
    if (!parsed.token || !parsed.member?.id) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearShift(merchantId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearShift(merchantId: string) {
  sessionStorage.removeItem(storageKey(merchantId));
}

export function getActingMember(merchantId: string): RosterMember | null {
  return readShift(merchantId)?.member ?? null;
}

export function getActingKioskRoute(
  merchantId: string,
): 'counter' | 'kitchen' | 'manager' | null {
  const member = getActingMember(merchantId);
  if (!member) return null;

  const station = member.jobStation;
  if (station === 'counter' || station === 'kitchen') return station;
  if (station === 'manager' || member.role === 'manager') return 'manager';
  return null;
}

/** @deprecated Use getActingKioskRoute */
export function getActingStation(merchantId: string): JobStation | null {
  const route = getActingKioskRoute(merchantId);
  return route === 'counter' || route === 'kitchen' ? route : null;
}
