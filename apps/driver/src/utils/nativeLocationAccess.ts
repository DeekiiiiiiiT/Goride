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
      timeout: 15000,
      maximumAge: 0,
    });
    return 'granted';
  } catch {
    const recheck = await checkGeolocationGranted();
    if (recheck !== 'granted') return 'denied_needs_settings';
    return 'gps_off';
  }
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
