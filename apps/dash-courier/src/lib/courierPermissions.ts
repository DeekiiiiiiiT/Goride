import type { PermissionGrantState } from '@roam/types';
import { isCourierNativePlatform } from '@/capacitor-native';

export type { PermissionGrantState };

export type CourierPermissionId = 'location' | 'notifications' | 'camera';

function mapCapLocation(location: string | undefined): PermissionGrantState {
  if (location === 'granted' || location === 'limited') return 'granted';
  if (location === 'denied') return 'denied';
  return 'prompt';
}

/** App-local Capacitor Geolocation — do not route through @roam/types (dynamic import breaks in WebView). */
async function checkNativeGeolocation(): Promise<PermissionGrantState> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.checkPermissions();
    return mapCapLocation(perm.location);
  } catch (e) {
    console.warn('[courierPermissions] checkNativeGeolocation', e);
    return 'prompt';
  }
}

async function requestNativeGeolocation(): Promise<PermissionGrantState> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.location !== 'limited') {
      perm = await Geolocation.requestPermissions();
    }
    const mapped = mapCapLocation(perm.location);
    if (mapped !== 'granted') return mapped;
    try {
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
    } catch {
      /* Permission granted; GPS may still be warming up. */
    }
    return 'granted';
  } catch (e) {
    console.warn('[courierPermissions] requestNativeGeolocation', e);
    return 'denied';
  }
}

async function checkWebGeolocation(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

async function requestWebGeolocation(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === 1 ? 'denied' : 'prompt'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function checkNativeNotifications(): Promise<PermissionGrantState> {
  // Web Notification API is missing in Capacitor WebView — use Push plugin when present.
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    // Plugin not installed in this build — don't block onboarding.
    return 'unsupported';
  }
}

async function requestNativeNotifications(): Promise<PermissionGrantState> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

async function checkWebNotifications(): Promise<PermissionGrantState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

async function requestWebNotifications(): Promise<PermissionGrantState> {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') return 'granted';
  if (result === 'denied') return 'denied';
  return 'prompt';
}

export async function checkCameraGranted(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return isCourierNativePlatform() ? 'prompt' : 'unsupported';
  }
  if (!navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function requestCameraPermission(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return isCourierNativePlatform() ? 'denied' : 'unsupported';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}

export async function checkCourierPermission(
  id: CourierPermissionId,
): Promise<PermissionGrantState> {
  if (id === 'location') {
    return isCourierNativePlatform() ? checkNativeGeolocation() : checkWebGeolocation();
  }
  if (id === 'notifications') {
    return isCourierNativePlatform() ? checkNativeNotifications() : checkWebNotifications();
  }
  return checkCameraGranted();
}

export async function requestCourierPermission(
  id: CourierPermissionId,
): Promise<PermissionGrantState> {
  if (id === 'location') {
    return isCourierNativePlatform() ? requestNativeGeolocation() : requestWebGeolocation();
  }
  if (id === 'notifications') {
    return isCourierNativePlatform() ? requestNativeNotifications() : requestWebNotifications();
  }
  return requestCameraPermission();
}

/** Location is required. Notifications required only when the platform can grant them. */
export function canContinueCourierPermissions(
  granted: Record<CourierPermissionId, PermissionGrantState>,
): boolean {
  if (granted.location !== 'granted') return false;
  // Unsupported (no plugin / no Web API) must not block courier onboarding.
  if (granted.notifications === 'unsupported') return true;
  return granted.notifications === 'granted';
}

/** Opens iOS App / Android Application Details so the courier can re-enable Location. */
export async function openCourierAppSettings(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return false;
    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      'capacitor-native-settings'
    );
    if (Capacitor.getPlatform() === 'ios') {
      await NativeSettings.openIOS({ option: IOSSettings.App });
    } else {
      await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails });
    }
    return true;
  } catch {
    return false;
  }
}
