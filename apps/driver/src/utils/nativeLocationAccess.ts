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
};

const FUEL_GPS_OPTIONS = {
  /** Low accuracy is enough for station matching and avoids canopy timeouts. */
  enableHighAccuracy: false,
  timeout: 25000,
  maximumAge: 120000,
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

/** Native Capacitor path on device; browser geolocation on web. Used by fuel GPS lock. */
export async function readDriverGeolocationFix(
  options?: PositionOptions,
): Promise<DriverGeolocationFix> {
  const opts = { ...FUEL_GPS_OPTIONS, ...options };

  if (isNativeCapacitorPlatform()) {
    const Geo = await getNativeGeolocation();
    if (!Geo) {
      return {
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null,
        error: 'Geolocation not supported',
      };
    }

    let perm = await Geo.checkPermissions();
    if (perm.location !== 'granted' && perm.location !== 'limited') {
      perm = await Geo.requestPermissions();
    }
    if (perm.location !== 'granted' && perm.location !== 'limited') {
      return {
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null,
        error: 'Location permission denied',
      };
    }

    try {
      const pos = await Geo.getCurrentPosition(opts);
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        timestamp: Date.now(),
        error: null,
      };
    } catch (err) {
      return {
        lat: null,
        lng: null,
        accuracy: null,
        timestamp: null,
        error: mapNativeGeoError(err),
      };
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      lat: null,
      lng: null,
      accuracy: null,
      timestamp: null,
      error: 'Geolocation not supported',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
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
