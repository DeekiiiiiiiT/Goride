/**
 * Google Maps JS loader for station import / place search (platform ops).
 * Uses fleet maps-config endpoint with platform session (or anon bootstrap).
 */
import { API_ENDPOINTS } from '@roam/api-client';
import { requirePlatformAuthHeaders } from '../auth/platformAuthHeaders';

let mapsLoadedPromise: Promise<void> | null = null;

declare global {
  interface Window {
    google?: typeof google;
  }
}

export async function loadGoogleMapsApi(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps && typeof window.google.maps.importLibrary === 'function') {
    return;
  }
  if (mapsLoadedPromise) return mapsLoadedPromise;

  mapsLoadedPromise = new Promise((resolve, reject) => {
    void (async () => {
      try {
        const existingScript = document.querySelector(
          'script[src*="maps.googleapis.com/maps/api/js"]',
        ) as HTMLScriptElement | null;

        if (existingScript) {
          let attempts = 0;
          const checkInterval = setInterval(() => {
            attempts++;
            if (window.google?.maps && typeof window.google.maps.importLibrary === 'function') {
              clearInterval(checkInterval);
              resolve();
            } else if (attempts > 100) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          return;
        }

        let headers: HeadersInit;
        try {
          headers = await requirePlatformAuthHeaders(null);
        } catch {
          // Maps-config allows anon bootstrap when no session yet.
          headers = {};
        }

        const response = await fetch(`${API_ENDPOINTS.fleetCore}/maps-config`, { headers });
        if (!response.ok) {
          throw new Error(`Server configuration error: ${response.status}`);
        }
        const data = await response.json();
        if (!data.apiKey) throw new Error('Google Maps API Key configuration missing on server');

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&loading=async&v=weekly&libraries=geometry,places`;
        script.async = true;
        script.defer = true;
        script.id = 'google-maps-script';
        script.onload = () => {
          let attempts = 0;
          const checkInterval = setInterval(() => {
            attempts++;
            if (window.google?.maps && typeof window.google.maps.importLibrary === 'function') {
              clearInterval(checkInterval);
              resolve();
            } else if (attempts > 100) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        };
        script.onerror = () => {
          mapsLoadedPromise = null;
          reject(new Error('Failed to load Google Maps'));
        };
        document.head.appendChild(script);
      } catch (err) {
        mapsLoadedPromise = null;
        reject(err);
      }
    })();
  });

  return mapsLoadedPromise;
}
