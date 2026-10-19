import {
  checkGeolocationGranted,
  getNativeGeolocation,
  isNativeCapacitorPlatform,
  requestGeolocationPermission,
} from '@roam/types';

export type DriverLocationAccessResult = 'granted' | 'denied_needs_settings' | 'gps_off' | 'unsupported';

export async function ensureDriverLocationAccess(): Promise<DriverLocationAccessResult> {
  if (!isNativeCapacitorPlatform()) {
    const state = await requestGeolocationPermission();
    return state === 'granted' ? 'granted' : 'denied_needs_settings';
  }

  const Geo = await getNativeGeolocation();
  if (!Geo) return 'unsupported';
  let perm = await Geo.checkPermissions();

  if (perm.location !== 'granted' && perm.location !== 'limited') {
    perm = await Geo.requestPermissions();
  }

  if (perm.location !== 'granted' && perm.location !== 'limited') {
    return 'denied_needs_settings';
  }

  try {
    await Geo.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 10000,
    });
    return 'granted';
  } catch {
    const recheck = await checkGeolocationGranted();
    if (recheck !== 'granted') return 'denied_needs_settings';
    // Permission granted; GPS fix may still be warming up.
    return 'granted';
  }
}

export type DriverGeolocationFix = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  timestamp: number | null;
  error: string | null;
  /** Android mock-location flag when the platform exposes it. */
  mock?: boolean;
};

/** Geolocation options — local type avoids DOM PositionOptions lib gaps in tsc. */
type FuelGeoOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

/** Prefer a fresh high-accuracy fix; fall back to low-accuracy if canopy/timeout. */
const FUEL_GPS_HIGH_ACCURACY: FuelGeoOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 10000,
};

const FUEL_GPS_LOW_ACCURACY: FuelGeoOptions = {
  enableHighAccuracy: false,
  timeout: 25000,
  maximumAge: 10000,
};

function mapNativeGeoError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === 'NOT_AUTHORIZED' || code === 'LOCATION_DISABLED') {
    return 'Location permission denied';
  }
  if (code === 'POSITION_UNAVAILABLE') return 'Location information unavailable';
  if (code === 'TIMEOUT') return 'Location request timed out';
  return 'Failed to get location';
}

/** Prefer plugin/browser fix time; never invent wall-clock as the measurement time. */
function fixTimestampMs(raw: number | undefined | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return Date.now();
}

function readMockFlag(pos: { coords?: Record<string, unknown> }): boolean | undefined {
  const coords = pos?.coords || {};
  // Capacitor Geolocation rarely exposes a mock flag — leave unset when unknown.
  // Never invent mock:false; callers must preserve mock when present (Retry GPS included).
  if (typeof coords.isFromMockProvider === 'boolean') return coords.isFromMockProvider;
  if (typeof coords.mocked === 'boolean') return coords.mocked;
  return undefined;
}

async function readNativeFix(
  Geo: NonNullable<Awaited<ReturnType<typeof getNativeGeolocation>>>,
  opts: FuelGeoOptions,
): Promise<DriverGeolocationFix> {
  const pos = await Geo.getCurrentPosition(opts);
  const mock = readMockFlag(pos as { coords?: Record<string, unknown> });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    timestamp: fixTimestampMs((pos as { timestamp?: number }).timestamp),
    error: null,
    ...(mock !== undefined ? { mock } : {}),
  };
}

function readBrowserFix(opts: FuelGeoOptions): Promise<DriverGeolocationFix> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: fixTimestampMs(position.timestamp),
          error: null,
        }),
      (error) => {
        let errorMessage = 'Failed to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        resolve({
          lat: null,
          lng: null,
          accuracy: null,
          timestamp: null,
          error: errorMessage,
        });
      },
      opts,
    );
  });
}

/**
 * Fuel GPS lock: high-accuracy first (maxAge ≤ 10s), then low-accuracy fallback.
 * `timestamp` is the real fix time from the plugin/browser when available.
 */
export async function readDriverGeolocationFix(
  options?: FuelGeoOptions,
): Promise<DriverGeolocationFix> {
  // Explicit caller options skip the dual-attempt path (tests / probes).
  if (options) {
    if (isNativeCapacitorPlatform()) {
      const Geo = await getNativeGeolocation();
      if (!Geo) {
        return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Geolocation not supported' };
      }
      let perm = await Geo.checkPermissions();
      if (perm.location !== 'granted' && perm.location !== 'limited') {
        perm = await Geo.requestPermissions();
      }
      if (perm.location !== 'granted' && perm.location !== 'limited') {
        return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Location permission denied' };
      }
      try {
        return await readNativeFix(Geo, { ...FUEL_GPS_HIGH_ACCURACY, ...options });
      } catch (err) {
        return { lat: null, lng: null, accuracy: null, timestamp: null, error: mapNativeGeoError(err) };
      }
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Geolocation not supported' };
    }
    return readBrowserFix({ ...FUEL_GPS_HIGH_ACCURACY, ...options });
  }

  if (isNativeCapacitorPlatform()) {
    const Geo = await getNativeGeolocation();
    if (!Geo) {
      return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Geolocation not supported' };
    }

    let perm = await Geo.checkPermissions();
    if (perm.location !== 'granted' && perm.location !== 'limited') {
      perm = await Geo.requestPermissions();
    }
    if (perm.location !== 'granted' && perm.location !== 'limited') {
      return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Location permission denied' };
    }

    try {
      return await readNativeFix(Geo, FUEL_GPS_HIGH_ACCURACY);
    } catch {
      try {
        return await readNativeFix(Geo, FUEL_GPS_LOW_ACCURACY);
      } catch (err) {
        return { lat: null, lng: null, accuracy: null, timestamp: null, error: mapNativeGeoError(err) };
      }
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { lat: null, lng: null, accuracy: null, timestamp: null, error: 'Geolocation not supported' };
  }

  const high = await readBrowserFix(FUEL_GPS_HIGH_ACCURACY);
  if (high.lat != null && high.lng != null) return high;
  return readBrowserFix(FUEL_GPS_LOW_ACCURACY);
}

export type DriverPosition = {
  lat: number;
  lng: number;
  heading?: number | null;
};

export async function readCurrentDriverPosition(): Promise<DriverPosition | null> {
  if (isNativeCapacitorPlatform()) {
    const Geo = await getNativeGeolocation();
    if (!Geo) return null;
    try {
      const pos = await Geo.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
      };
    } catch {
      return null;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  });
}

export async function openRoamDriverAppSettings(): Promise<void> {
  if (!isNativeCapacitorPlatform()) return;
  try {
    const { NativeSettings, AndroidSettings } = await import('capacitor-native-settings');
    await NativeSettings.openAndroid({
      option: AndroidSettings.ApplicationDetails,
    });
  } catch (e) {
    console.warn('openRoamDriverAppSettings failed', e);
  }
}

export async function openAndroidLocationSettings(): Promise<void> {
  if (!isNativeCapacitorPlatform()) return;
  try {
    const { NativeSettings, AndroidSettings } = await import('capacitor-native-settings');
    await NativeSettings.openAndroid({
      option: AndroidSettings.Location,
    });
  } catch (e) {
    console.warn('openAndroidLocationSettings failed', e);
  }
}

export async function promptDriverLocationAccess(): Promise<DriverLocationAccessResult> {
  const result = await ensureDriverLocationAccess();
  if (result === 'denied_needs_settings') {
    await openRoamDriverAppSettings();
  } else if (result === 'gps_off') {
    await openAndroidLocationSettings();
  }
  return result;
}
