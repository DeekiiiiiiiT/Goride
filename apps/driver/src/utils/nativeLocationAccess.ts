import {
  checkGeolocationGranted,
  isNativeCapacitorPlatform,
  requestGeolocationPermission,
} from '@roam/types';

export type DriverLocationAccessResult = 'granted' | 'denied_needs_settings' | 'gps_off' | 'unsupported';

export async function ensureDriverLocationAccess(): Promise<DriverLocationAccessResult> {
  if (!isNativeCapacitorPlatform()) {
    const state = await requestGeolocationPermission();
    return state === 'granted' ? 'granted' : 'denied_needs_settings';
  }

  const { Geolocation } = await import('@capacitor/geolocation');
  let perm = await Geolocation.checkPermissions();

  if (perm.location !== 'granted' && perm.location !== 'limited') {
    perm = await Geolocation.requestPermissions();
  }

  if (perm.location !== 'granted' && perm.location !== 'limited') {
    return 'denied_needs_settings';
  }

  try {
    await Geolocation.getCurrentPosition({
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

export type DriverPosition = {
  lat: number;
  lng: number;
  heading?: number | null;
};

export async function readCurrentDriverPosition(): Promise<DriverPosition | null> {
  if (isNativeCapacitorPlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      const pos = await Geolocation.getCurrentPosition({
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
