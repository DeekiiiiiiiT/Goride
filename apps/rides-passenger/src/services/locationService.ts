/**
 * Google Maps / Places — Roam Rides uses its own browser key via Edge:
 * `make-server-37f42386/maps-config-rides` → secret `GOOGLE_MAPS_API_KEY_RIDES`.
 */
import { projectId, publicAnonKey } from '@roam/api-client';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressResult {
  display_name: string;
  lat: string | number;
  lon: string | number;
  place_id?: string;
}

let mapsLoadedPromise: Promise<void> | null = null;

export const loadGoogleMapsApi = async (): Promise<void> => {
  if (typeof window !== 'undefined' && window.google?.maps?.importLibrary) {
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

export const searchAddress = async (query: string): Promise<AddressResult[]> => {
  if (!query || query.length < 3) return [];
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

/** Browser Geolocation API — current device position. */
export const getCurrentPosition = (): Promise<GeoCoordinates> => {
  return new Promise((resolve, reject) => {
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
};

/** Coordinates → formatted address (Google Geocoder). */
export const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
  await loadGoogleMapsApi();

  const geocode = (
    geocoder: google.maps.Geocoder,
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          resolve(results[0].formatted_address);
        } else {
          reject(new Error('Address not found'));
        }
      });
    });

  if (window.google?.maps?.importLibrary) {
    const { Geocoder } = (await google.maps.importLibrary('geocoding')) as {
      Geocoder: new () => google.maps.Geocoder;
    };
    return geocode(new Geocoder());
  }

  if (!window.google?.maps?.Geocoder) {
    throw new Error('Google Maps Geocoder not available');
  }
  return geocode(new window.google.maps.Geocoder());
};

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
