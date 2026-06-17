/**
 * Passenger GPS permission helpers (Settings + deep links to OS).
 * Web: uses @roam/types check/request helpers.
 * Native: Capacitor Geolocation + capacitor-native-settings (see driver nativeLocationAccess.ts).
 */
import {
  checkGeolocationGranted,
  isNativeCapacitorPlatform,
  requestGeolocationPermission,
  type PermissionGrantState,
} from '@roam/types';

export type PassengerLocationAccessResult = 'granted' | 'denied_needs_settings' | 'unsupported';

export function grantStateToStatusLabelKey(
  state: PermissionGrantState,
): 'locationStatusGranted' | 'locationStatusDenied' | 'locationStatusPrompt' | 'locationStatusUnsupported' {
  if (state === 'granted') return 'locationStatusGranted';
  if (state === 'denied') return 'locationStatusDenied';
  if (state === 'prompt') return 'locationStatusPrompt';
  return 'locationStatusUnsupported';
}

export async function ensurePassengerLocationAccess(): Promise<PassengerLocationAccessResult> {
  if (!isNativeCapacitorPlatform()) {
    const initial = await checkGeolocationGranted();
    if (initial === 'unsupported') return 'unsupported';
    if (initial === 'granted') return 'granted';

    const state = await requestGeolocationPermission();
    if (state === 'granted') return 'granted';
    if (state === 'unsupported') return 'unsupported';
    return 'denied_needs_settings';
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
    return 'granted';
  }
}

export async function openPassengerAppSettings(): Promise<void> {
  if (!isNativeCapacitorPlatform()) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      'capacitor-native-settings'
    );
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.getPlatform() === 'ios') {
      await NativeSettings.openIOS({ option: IOSSettings.App });
      return;
    }
    await NativeSettings.openAndroid({
      option: AndroidSettings.ApplicationDetails,
    });
  } catch (e) {
    console.warn('openPassengerAppSettings failed', e);
  }
}

export async function openPassengerLocationSettings(): Promise<void> {
  if (!isNativeCapacitorPlatform()) return;
  try {
    const { NativeSettings, AndroidSettings } = await import('capacitor-native-settings');
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.getPlatform() !== 'android') return;
    await NativeSettings.openAndroid({
      option: AndroidSettings.Location,
    });
  } catch (e) {
    console.warn('openPassengerLocationSettings failed', e);
  }
}

export async function promptPassengerLocationAccess(): Promise<PassengerLocationAccessResult> {
  const result = await ensurePassengerLocationAccess();
  if (result === 'denied_needs_settings') {
    await openPassengerAppSettings();
  }
  return result;
}
