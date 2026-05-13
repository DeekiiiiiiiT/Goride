import { TripStop, RoutePoint } from '../types/tripSession';
import { projectId, publicAnonKey } from './supabase/info';

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressResult {
  display_name: string;
  lat: string | number;
  lon: string | number;
  place_id?: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
    [key: string]: string | undefined;
  };
}

// Global variable to track loading state
let mapsLoadedPromise: Promise<void> | null = null;

/**
 * Load Google Maps API with modern async loading pattern
 */
export const loadGoogleMapsApi = async (): Promise<void> => {
  // If library is already available, we are good
  if (typeof window !== 'undefined' && window.google?.maps && window.google?.maps?.importLibrary) {
    return Promise.resolve();
  }

  if (mapsLoadedPromise) return mapsLoadedPromise;

  mapsLoadedPromise = new Promise(async (resolve, reject) => {
    try {
      // Check if script is already present
      const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]') as HTMLScriptElement;
      
      if (existingScript) {
          // Check if it has the necessary libraries
          const src = existingScript.src;
          // We now use importLibrary for places, so we just need geometry in the libraries param if using legacy
          // But actually, we should just check if geometry is there as a baseline.
          if (!src.includes('geometry')) {
             console.log("Removing existing Google Maps script missing 'places' library");
             existingScript.remove();
             // Force cleanup of google object if it exists but is incomplete?
             // window.google = undefined; // Risky if other things use it, but necessary for clean reload
          } else {
             // Script seems correct, wait for it to initialize
             let attempts = 0;
             const checkInterval = setInterval(() => {
                 attempts++;
                 const hasImportLib = !!(window.google?.maps?.importLibrary);
                 const hasPlacesLib = !!(window.google?.maps?.places);
                 const hasGeocoder = !!(window.google?.maps?.Geocoder);
                 
                 if (hasImportLib || (hasPlacesLib && hasGeocoder)) {
                     clearInterval(checkInterval);
                     resolve();
                 } else if (attempts > 100) { // 10 seconds
                     clearInterval(checkInterval);
                     console.warn("Google Maps existing script load timeout - objects missing");
                     resolve(); // Try anyway
                 }
             }, 100);
             return;
          }
      }

      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/maps-config`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Server configuration error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.apiKey) {
        console.error("Server returned empty API key. Data:", data);
        throw new Error("Google Maps API Key configuration missing on server");
      }

      const script = document.createElement('script');
      // Use v=weekly and include places in libraries to ensure legacy parts don't break
      // while we transition to modern importLibrary pattern.
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&loading=async&v=weekly&libraries=geometry,places`; 
      script.async = true;
      script.defer = true;
      script.id = 'google-maps-script';
      
      script.onload = () => {
          // Even after onload, we might need to wait for the objects to be attached to window
          let attempts = 0;
          const checkInterval = setInterval(() => {
             attempts++;
             const hasImportLib = !!(window.google?.maps?.importLibrary);
             const hasPlacesLib = !!(window.google?.maps?.places);
             const hasGeocoder = !!(window.google?.maps?.Geocoder);
             
             if (hasImportLib || (hasPlacesLib && hasGeocoder)) {
                 clearInterval(checkInterval);
                 resolve();
             } else if (attempts > 100) { // 10 seconds
                 clearInterval(checkInterval);
                 console.warn("Google Maps load timeout - objects missing despite script load");
                 resolve(); // Resolve anyway, the individual functions will check and throw specific errors
             }
          }, 100);
      };
      script.onerror = (e) => reject(new Error("Google Maps script failed to load"));
      
      document.head.appendChild(script);
    } catch (error) {
      console.error("Failed to load Google Maps:", error);
      reject(error);
      mapsLoadedPromise = null;
    }
  });

  return mapsLoadedPromise;
};

/**
 * Get current user position using Browser Geolocation API
 */
export const getCurrentPosition = (): Promise<GeoCoordinates> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser"));
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
        let errorMessage = "Unknown error getting location";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "The request to get user location timed out";
            break;
        }
        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

/**
 * Convert coordinates to address using Google Maps Geocoder
 */
export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<string> => {
  try {
    await loadGoogleMapsApi();
    
    // Check if importLibrary is available
    if (window.google?.maps?.importLibrary) {
        const { Geocoder } = await google.maps.importLibrary("geocoding") as any;
        const geocoder = new Geocoder();
        return new Promise((resolve, reject) => {
            geocoder.geocode({ location: { lat, lng: lon } }, (results: any[], status: string) => {
                if (status === 'OK' && results[0]) {
                resolve(results[0].formatted_address);
                } else {
                reject(new Error("Address not found"));
                }
            });
        });
    }

    // Fallback for legacy
    if (!window.google?.maps?.Geocoder) {
         throw new Error("Google Maps Geocoder not available");
    }
    const geocoder = new window.google.maps.Geocoder();
    return new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (results: any[], status: string) => {
            if (status === 'OK' && results[0]) {
                resolve(results[0].formatted_address);
            } else {
                reject(new Error("Address not found"));
            }
        });
    });

  } catch (error) {
    console.error("Reverse geocoding error:", error);
    throw new Error("Failed to convert coordinates to address");
  }
};

/**
 * Search for addresses using Google Places Autocomplete (New API)
 * Restricted to Jamaica (country: 'jm')
 */
export const searchAddress = async (query: string): Promise<AddressResult[]> => {
  if (!query || query.length < 3) return [];

  try {
    await loadGoogleMapsApi();

    // Try modern API (AutocompleteSuggestion)
    // This is the new Places Library (v3.54+)
    // We prioritize this to avoid Deprecation warnings for AutocompleteService
    if (window.google?.maps?.importLibrary) {
        try {
            const { AutocompleteSuggestion } = await google.maps.importLibrary("places") as any;
            
            if (AutocompleteSuggestion) {
                // Static method on the class
                const request = {
                    input: query,
                    includedRegionCodes: ['jm'],
                };
                
                const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
                const suggestions = response.suggestions || [];
                
                if (suggestions.length > 0) {
                    return suggestions.map((suggestion: any) => ({
                        display_name: suggestion.placePrediction?.text?.text || suggestion.placePrediction?.mainText?.text || "Unknown Location",
                        lat: '', 
                        lon: '', 
                        place_id: suggestion.placePrediction?.placeId || suggestion.placePrediction?.place?.split('/').pop(), 
                    }));
                }
            }
        } catch (e) {
            console.error("Modern AutocompleteSuggestion failed:", e);
            // If the modern API fails completely (e.g. network or specific account restriction), 
            // we have no choice but to return empty or try a different fallback if available.
            // But we avoid AutocompleteService to stop the error reported by the user.
        }
    }
    
    return [];

  } catch (error) {
    console.error("Address search error:", error);
    return [];
  }
};

/**
 * Fetch Place Details (lat, lon) from Place ID using modern Place Class
 */
export const getPlaceDetails = async (placeId: string): Promise<{ lat: number; lon: number; address: string } | null> => {
  try {
    await loadGoogleMapsApi();

    if (window.google?.maps?.importLibrary) {
        try {
            const { Place } = await google.maps.importLibrary("places") as any;
            if (Place) {
                const place = new Place({ id: placeId });
                await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
                const location = place.location;
                if (location) {
                    return {
                        lat: location.lat(),
                        lon: location.lng(),
                        address: place.formattedAddress || place.displayName,
                    };
                }
            }
        } catch (e) {
             console.error("Modern Place Details API failed:", e);
        }
    }

    return null;

  } catch (error) {
    console.error("Get place details error:", error);
    return null;
  }
};

/**
 * Simple debounce utility to delay function execution
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: any;

  return (...args: Parameters<T>) => {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Calculate driving distance between two points using Haversine
 */
export const calculateRouteDistance = async (
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<number | null> => {
  return calculateHaversineDistance(start, end);
};

/**
 * Calculate straight-line distance (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateHaversineDistance = (
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(end.lat - start.lat);
  const dLon = deg2rad(end.lon - start.lon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(start.lat)) *
      Math.cos(deg2rad(end.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  
  // Apply a tortuosity factor to estimate driving distance (typically ~1.3-1.4x straight line)
  return parseFloat((d * 1.3).toFixed(1));
};

/**
 * Calculate total distance from a list of route points
 * Returns distance in kilometers
 */
export const calculatePathDistance = (points: { lat: number; lon: number }[]): number => {
  if (points.length < 2) return 0;
  
  let totalDistance = 0;
  const R = 6371; // km
  
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i+1];
    
    const dLat = (end.lat - start.lat) * (Math.PI / 180);
    const dLon = (end.lon - start.lon) * (Math.PI / 180);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(start.lat * (Math.PI / 180)) *
      Math.cos(end.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalDistance += R * c;
  }
  
  return parseFloat(totalDistance.toFixed(2));
};

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/**
 * Create a new TripStop object
 */
export const createStop = (
  location: string, 
  coordinates: { lat: number; lon: number }
): TripStop => {
  return {
    id: crypto.randomUUID(),
    location,
    coordinates,
    arrivalTime: Date.now(),
    durationSeconds: 0,
    isOverThreshold: false
  };
};
