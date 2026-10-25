import { currentPath } from '../nav';

/** The open car. Never invents one. */
export function vehicleId(): string | null {
  const match = currentPath().match(/^\/garage\/([^/]+)/);
  if (match && !['add', 'added', 'empty', 'remove'].includes(match[1])) return decodeURIComponent(match[1]);
  return sessionStorage.getItem('plug-vehicle');
}

export function catalogVariant(): string | null {
  return sessionStorage.getItem('plug-catalog');
}

export type Fix = { lat: number; lng: number; accuracyM: number };

/** A GPS fix the phone actually reported. */
export function deviceFix(): Fix | null {
  const lat = Number(sessionStorage.getItem('plug-lat'));
  const lng = Number(sessionStorage.getItem('plug-lng'));
  const accuracyM = Number(sessionStorage.getItem('plug-accuracy'));
  if (!(accuracyM > 0) || accuracyM > 100) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracyM };
}

export function pinFix(): Fix | null {
  const lat = Number(sessionStorage.getItem('plug-pin-lat'));
  const lng = Number(sessionStorage.getItem('plug-pin-lng'));
  const accuracyM = Number(sessionStorage.getItem('plug-accuracy'));
  if (!(accuracyM > 0) || accuracyM > 50) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracyM };
}

export function lastOdometer(): number {
  const stored = sessionStorage.getItem('plug-last-odo');
  return stored ? Number(stored) || 0 : 0;
}

export function rememberVehicle(row: { id?: string; catalog_variant_id?: string | null; starting_odometer?: number | null; nickname?: string | null }) {
  if (row.id) sessionStorage.setItem('plug-vehicle', row.id);
  if (row.catalog_variant_id) sessionStorage.setItem('plug-catalog', row.catalog_variant_id);
  if (row.starting_odometer != null && !sessionStorage.getItem('plug-last-odo')) {
    sessionStorage.setItem('plug-last-odo', String(row.starting_odometer));
  }
  if (row.nickname) sessionStorage.setItem('plug-car-name', row.nickname);
}
