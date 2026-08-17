import { Capacitor } from '@capacitor/core';
import type { PermissionGrantState } from '@roam/types';

function mapCapLocation(location: string | undefined): PermissionGrantState {
  if (location === 'granted' || location === 'limited') return 'granted';
  if (location === 'denied') return 'denied';
  return 'prompt';
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
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === 1 ? 'denied' : 'prompt'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export async function getRushCurrentPosition(): Promise<{ lat: number; lng: number }> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    // maximumAge: 0 — address pinning must not reuse a stale cached fix
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
