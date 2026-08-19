import { Capacitor } from '@capacitor/core';
import type { PermissionGrantState } from '@roam/types';

function mapCapLocation(location: string | undefined): PermissionGrantState {
  if (location === 'granted' || location === 'limited') return 'granted';
  if (location === 'denied') return 'denied';
  return 'prompt';
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Allow location access in your browser settings.';
    case err.POSITION_UNAVAILABLE:
      return 'Location unavailable. Turn on GPS or try again outdoors.';
    case err.TIMEOUT:
      return 'Location timed out. Try again or search for your address.';
    default:
      return 'Could not get current location';
  }
}

/** Hard cap — some mobile browsers ignore navigator.geolocation timeout options. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function queryWebGeolocationPermission(): Promise<PermissionGrantState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return null;
  }
}

function readWebPosition(options: PositionOptions): Promise<{ lat: number; lng: number }> {
  const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 15_000;
  const read = new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation unavailable on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(geolocationErrorMessage(err))),
      options,
    );
  });
  return withTimeout(
    read,
    timeoutMs + 2_000,
    'Location timed out. Try again or search for your address.',
  );
}

/** App-local Capacitor Geolocation — do not route through @roam/types (dynamic import breaks in WebView). */
export async function requestRushGeolocationPermission(): Promise<PermissionGrantState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted' && perm.location !== 'limited') {
        perm = await Geolocation.requestPermissions();
      }
      return mapCapLocation(perm.location);
    } catch (e) {
      console.warn('[rushGeolocation] requestNative', e);
      return 'denied';
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';

  // Do not probe with getCurrentPosition — that duplicates GPS work and can hang on mobile Chrome.
  const queried = await queryWebGeolocationPermission();
  if (queried === 'granted' || queried === 'denied') return queried;
  return 'prompt';
}

export async function getRushCurrentPosition(): Promise<{ lat: number; lng: number }> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (highErr) {
      console.warn('[rushGeolocation] high accuracy failed, retrying coarse', highErr);
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: 60_000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
  }

  try {
    return await readWebPosition({ enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  } catch (highErr) {
    console.warn('[rushGeolocation] high accuracy failed, retrying coarse', highErr);
    return readWebPosition({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 });
  }
}
