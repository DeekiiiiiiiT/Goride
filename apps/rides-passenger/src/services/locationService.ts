/**
 * Google Maps / Places — Roam Rides uses its own browser key via Edge:
 * `make-server-37f42386/maps-config-rides` → secret `GOOGLE_MAPS_API_KEY_RIDES`.
 *
 * Capacitor Android serves the app at https://localhost, so the browser key’s HTTP
 * referrer rules block Places JS. Native builds use `/rides/v1/places/*` instead.
 */
import { API_ENDPOINTS, projectId, publicAnonKey } from '@roam/api-client';
import { isNativeCapacitorPlatform } from '@roam/types';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeoPositionWithAccuracy {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

/** Accuracy thresholds in meters */
export const GPS_ACCURACY = {
  PRECISE: 20,
  ACCEPTABLE: 50,
  POOR: 100,
} as const;

export type AccuracyLevel = 'precise' | 'approximate' | 'poor';

export interface AddressResult {
  display_name: string;
  lat: string | number;
  lon: string | number;
  place_id?: string;
}

let mapsLoadedPromise: Promise<void> | null = null;

const waitForGeocoder = async (maxMs = 5000): Promise<void> => {
  const step = 100;
  for (let elapsed = 0; elapsed < maxMs; elapsed += step) {
    if (window.google?.maps?.Geocoder) return;
    await new Promise((r) => window.setTimeout(r, step));
  }
  if (!window.google?.maps?.Geocoder) {
    throw new Error('Google Maps Geocoder not available');
  }
};

export const loadGoogleMapsApi = async (): Promise<void> => {
  if (
    typeof window !== 'undefined' &&
    window.google?.maps &&
    (window.google.maps.Geocoder || window.google.maps.importLibrary)
  ) {
    return Promise.resolve();
  }

  if (mapsLoadedPromise) return mapsLoadedPromise;

  mapsLoadedPromise = new Promise((resolve, reject) => {
    void (async () => {
      try {
        const existingScript = document.querySelector(
          'script[src*="maps.googleapis.com/maps/api/js"]',
        ) as HTMLScriptElement | null;

        if (existingScript) {
          if (!existingScript.src.includes('geometry')) {
            existingScript.remove();
          } else {
            let attempts = 0;
            const checkInterval = window.setInterval(() => {
              attempts++;
              const ok =
                !!(window.google?.maps?.importLibrary) ||
                (!!(window.google?.maps?.places) && !!(window.google?.maps?.Geocoder));
              if (ok || attempts > 100) {
                window.clearInterval(checkInterval);
                resolve();
              }
            }, 100);
            return;
          }
        }

        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-37f42386/maps-config-rides`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } },
        );
        if (!response.ok) {
          throw new Error(`Maps config error: ${response.status}`);
        }
        const data = (await response.json()) as { apiKey?: string };
        if (!data.apiKey) {
          throw new Error(
            'Rides Maps key missing: set Edge secret GOOGLE_MAPS_API_KEY_RIDES and redeploy make-server-37f42386',
          );
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&loading=async&v=weekly&libraries=geometry,places`;
        script.async = true;
        script.defer = true;
        script.id = 'google-maps-script';
        script.onload = () => {
          let attempts = 0;
          const checkInterval = window.setInterval(() => {
            attempts++;
            const ok =
              !!(window.google?.maps?.importLibrary) ||
              (!!(window.google?.maps?.places) && !!(window.google?.maps?.Geocoder));
            if (ok || attempts > 100) {
              window.clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        };
        script.onerror = () => reject(new Error('Google Maps script failed to load'));
        document.head.appendChild(script);
      } catch (e) {
        mapsLoadedPromise = null;
        reject(e);
      }
    })();
  });

  return mapsLoadedPromise;
};

async function edgePlacesHeaders(): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${publicAnonKey}`,
    apikey: publicAnonKey,
  };
}

async function searchAddressViaEdge(query: string): Promise<AddressResult[]> {
  const res = await fetch(
    `${API_ENDPOINTS.rides}/v1/places/autocomplete?q=${encodeURIComponent(query)}`,
    { headers: await edgePlacesHeaders() },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions?: AddressResult[] };
  return data.suggestions ?? [];
}

async function getPlaceDetailsViaEdge(
  placeId: string,
): Promise<{ lat: number; lon: number; address: string } | null> {
  const res = await fetch(
    `${API_ENDPOINTS.rides}/v1/places/${encodeURIComponent(placeId)}/details`,
    { headers: await edgePlacesHeaders() },
  );
  if (!res.ok) return null;
  return (await res.json()) as { lat: number; lon: number; address: string };
}

export const searchAddress = async (query: string): Promise<AddressResult[]> => {
  if (!query || query.length < 3) return [];
  if (isNativeCapacitorPlatform()) {
    try {
      return await searchAddressViaEdge(query);
    } catch (e) {
      console.error('Native address search error:', e);
      return [];
    }
  }
  try {
    await loadGoogleMapsApi();
    if (window.google?.maps?.importLibrary) {
      const { AutocompleteSuggestion } = (await google.maps.importLibrary('places')) as {
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (req: {
            input: string;
            includedRegionCodes: string[];
          }) => Promise<{ suggestions?: unknown[] }>;
        };
      };
      if (AutocompleteSuggestion) {
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ['jm'],
        });
        const suggestions = response.suggestions || [];
        return suggestions.map((suggestion: unknown) => {
          const s = suggestion as {
            placePrediction?: {
              text?: { text?: string };
              mainText?: { text?: string };
              placeId?: string;
              place?: string;
            };
          };
          const pred = s.placePrediction;
          return {
            display_name:
              pred?.text?.text || pred?.mainText?.text || 'Unknown location',
            lat: '',
            lon: '',
            place_id: pred?.placeId || pred?.place?.split('/').pop(),
          };
        });
      }
    }
  } catch (e) {
    console.error('Address search error:', e);
  }
  return [];
};

export const getPlaceDetails = async (
  placeId: string,
): Promise<{ lat: number; lon: number; address: string } | null> => {
  if (isNativeCapacitorPlatform()) {
    try {
      return await getPlaceDetailsViaEdge(placeId);
    } catch (e) {
      console.error('Native place details error:', e);
      return null;
    }
  }
  try {
    await loadGoogleMapsApi();
    if (window.google?.maps?.importLibrary) {
      const { Place } = (await google.maps.importLibrary('places')) as {
        Place: new (opts: { id: string }) => {
          fetchFields: (o: { fields: string[] }) => Promise<void>;
          location: { lat: () => number; lng: () => number } | null;
          formattedAddress?: string;
          displayName?: string;
        };
      };
      if (Place) {
        const place = new Place({ id: placeId });
        await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
        const location = place.location;
        if (location) {
          return {
            lat: location.lat(),
            lon: location.lng(),
            address: place.formattedAddress || place.displayName || '',
          };
        }
      }
    }
  } catch (e) {
    console.error('Get place details error:', e);
  }
  return null;
};

const readCurrentPosition = (options: PositionOptions): Promise<GeoCoordinates> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        let message = 'Unknown error getting location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            message = 'The request to get user location timed out';
            break;
        }
        reject(new Error(message));
      },
      options,
    );
  });

/** Browser Geolocation API — current device position (high accuracy, then coarse fallback). */
export const getCurrentPosition = async (): Promise<GeoCoordinates> => {
  try {
    return await readCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (highAccuracyError) {
    console.warn('High-accuracy geolocation failed, retrying:', highAccuracyError);
    return readCurrentPosition({
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60_000,
    });
  }
};

/** Get accuracy level from meters */
export function getAccuracyLevel(accuracyMeters: number): AccuracyLevel {
  if (accuracyMeters <= GPS_ACCURACY.PRECISE) return 'precise';
  if (accuracyMeters <= GPS_ACCURACY.ACCEPTABLE) return 'approximate';
  return 'poor';
}

/** Get current position with accuracy info */
export const getCurrentPositionWithAccuracy = (): Promise<GeoPositionWithAccuracy> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        let message = 'Unknown error getting location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            message = 'The request to get user location timed out';
            break;
        }
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });

export type PositionWatchCallback = (position: GeoPositionWithAccuracy) => void;
export type PositionErrorCallback = (error: Error) => void;

/** Watch position continuously with accuracy updates. Returns cleanup function. */
export function watchPosition(
  onPosition: PositionWatchCallback,
  onError?: PositionErrorCallback,
): () => void {
  if (!navigator.geolocation) {
    onError?.(new Error('Geolocation is not supported by your browser'));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onPosition({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      });
    },
    (error) => {
      let message = 'Unknown error getting location';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'Location permission denied';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Location information is unavailable';
          break;
        case error.TIMEOUT:
          message = 'The request to get user location timed out';
          break;
      }
      onError?.(new Error(message));
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

/** Snap coordinates to nearest road using Google Roads API (requires Roads API enabled) */
export async function snapToNearestRoad(
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number } | null> {
  try {
    await loadGoogleMapsApi();
    
    // Use the Geocoder to find nearest road-addressable location
    const geocoder = new window.google.maps.Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode(
        { location: { lat, lng } },
        (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const snapped = results[0].geometry.location;
            resolve({ lat: snapped.lat(), lng: snapped.lng() });
          } else {
            resolve(null);
          }
        },
      );
    });
  } catch (e) {
    console.warn('Snap to road failed:', e);
    return null;
  }
}

/** Coordinates → formatted address (Google Geocoder, legacy API). */
export const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
  await loadGoogleMapsApi();
  await waitForGeocoder();

  const geocoder = new window.google.maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
      if (status === 'OK' && results?.[0]?.formatted_address) {
        resolve(results[0].formatted_address);
        return;
      }
      reject(new Error(`Geocoder status: ${status}`));
    });
  });
};

async function reverseGeocodeNominatim(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = (await res.json()) as { display_name?: string };
  if (!data.display_name) throw new Error('Nominatim returned no address');
  return data.display_name;
}

function formatCoordsAsAddress(lat: number, lon: number): string {
  return `Current location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}

/** Best-effort address string for coordinates (Google → OSM → coords label). */
export async function resolveAddressFromCoordinates(lat: number, lon: number): Promise<string> {
  try {
    return await reverseGeocode(lat, lon);
  } catch (e) {
    console.warn('Google reverse geocode failed:', e);
  }
  try {
    return await reverseGeocodeNominatim(lat, lon);
  } catch (e) {
    console.warn('Nominatim reverse geocode failed:', e);
  }
  return formatCoordsAsAddress(lat, lon);
}

export type ResolvedDeviceLocation = { address: string; lat: number; lng: number };

/** Device GPS → pickup address + coordinates. */
export async function resolveCurrentPickupLocation(): Promise<ResolvedDeviceLocation> {
  const position = await getCurrentPosition();
  const address = await resolveAddressFromCoordinates(position.latitude, position.longitude);
  return {
    address,
    lat: position.latitude,
    lng: position.longitude,
  };
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}
