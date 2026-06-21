import { API_ENDPOINTS } from '@roam/api-client';

let mapsLoadedPromise: Promise<void> | null = null;
let cachedApiKey: string | null = null;

declare global {
  interface Window {
    google?: typeof google;
  }
}

export async function loadPartnerMapsApi(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.importLibrary) {
    return;
  }
  if (mapsLoadedPromise) return mapsLoadedPromise;

  mapsLoadedPromise = new Promise((resolve, reject) => {
    void (async () => {
      try {
        const res = await fetch(`${API_ENDPOINTS.delivery}/maps-config`);
        if (!res.ok) throw new Error('Maps configuration unavailable');
        const data = await res.json();
        if (!data.apiKey) throw new Error('Maps API key missing');
        cachedApiKey = data.apiKey;

        const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
        if (existing) {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (window.google?.maps?.importLibrary) {
              clearInterval(interval);
              resolve();
            } else if (attempts > 100) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&loading=async&v=weekly&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (window.google?.maps?.importLibrary) {
              clearInterval(interval);
              resolve();
            } else if (attempts > 100) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        };
        script.onerror = () => reject(new Error('Failed to load Google Maps'));
        document.head.appendChild(script);
      } catch (err) {
        mapsLoadedPromise = null;
        reject(err);
      }
    })();
  });

  return mapsLoadedPromise;
}

export function getCachedMapsApiKey(): string | null {
  return cachedApiKey;
}
