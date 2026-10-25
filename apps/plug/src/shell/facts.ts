import { demoOn } from '../demo/mode';
import { currentPath } from '../nav';

/** The open car. Demo mode may use the labelled sample car. Real mode never invents one. */
export function vehicleId(): string | null {
  const match = currentPath().match(/^\/garage\/([^/]+)/);
  if (match && !['add', 'added', 'empty', 'remove'].includes(match[1])) return decodeURIComponent(match[1]);
  const stored = sessionStorage.getItem('plug-vehicle');
  if (stored) return stored;
  if (demoOn()) return 'demo-car';
  return null;
}

export function catalogVariant(): string | null {
  const stored = sessionStorage.getItem('plug-catalog');
  if (stored) return stored;
  if (demoOn()) return 'demo-variant';
  return null;
}

export type Fix = { lat: number; lng: number; accuracyM: number };

/** A GPS fix the phone actually reported. Demo mode may use the labelled sample fix. */
export function deviceFix(): Fix | null {
  const lat = Number(sessionStorage.getItem('plug-lat'));
  const lng = Number(sessionStorage.getItem('plug-lng'));
  const accuracyM = Number(sessionStorage.getItem('plug-accuracy'));
  if (demoOn()) {
    return {
      lat: Number.isFinite(lat) ? lat : 18.0128,
      lng: Number.isFinite(lng) ? lng : -76.7967,
      accuracyM: accuracyM > 0 ? accuracyM : 12,
    };
  }
  if (!(accuracyM > 0) || accuracyM > 100) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracyM };
}

export function pinFix(): Fix | null {
  const lat = Number(sessionStorage.getItem('plug-pin-lat'));
  const lng = Number(sessionStorage.getItem('plug-pin-lng'));
  const accuracyM = Number(sessionStorage.getItem('plug-accuracy'));
  if (demoOn()) {
    return {
      lat: Number.isFinite(lat) ? lat : 18.0128,
      lng: Number.isFinite(lng) ? lng : -76.7967,
      accuracyM: accuracyM > 0 ? accuracyM : 12,
    };
  }
  if (!(accuracyM > 0) || accuracyM > 50) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, accuracyM };
}

export function lastOdometer(): number {
  const stored = sessionStorage.getItem('plug-last-odo');
  if (stored) return Number(stored) || 0;
  if (demoOn()) return 84210;
  return 0;
}

export function rememberVehicle(row: { id?: string; catalog_variant_id?: string | null; starting_odometer?: number | null; nickname?: string | null }) {
  if (row.id) sessionStorage.setItem('plug-vehicle', row.id);
  if (row.catalog_variant_id) sessionStorage.setItem('plug-catalog', row.catalog_variant_id);
  if (row.starting_odometer != null && !sessionStorage.getItem('plug-last-odo')) {
    sessionStorage.setItem('plug-last-odo', String(row.starting_odometer));
  }
  if (row.nickname) sessionStorage.setItem('plug-car-name', row.nickname);
}
