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
  if (typeof window !== 'undefined' && window.google?.maps && window.google?.maps?.importLibrary) {
    return Promise.resolve();
  }

  if (mapsLoadedPromise) return mapsLoadedPromise;

  mapsLoadedPromise = new Promise(async (resolve, reject) => {
    try {
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

      // Check if script is already present
      if (document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      // Added loading=async as requested by warning
      // Removed libraries parameter as we will use dynamic importLibrary
      script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&loading=async`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => resolve();
      script.onerror = (e) => reject(e);
      
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
    
    // Dynamically import Geocoding library
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

    // Use dynamic import for Places library
    const { AutocompleteSuggestion } = await google.maps.importLibrary("places") as any;

    // The new AutocompleteSuggestion API
    if (AutocompleteSuggestion && AutocompleteSuggestion.fetchAutocompleteSuggestions) {
      const request = {
        input: query,
        includedRegionCodes: ['jm'],
      };

      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      
      // Map suggestions to our AddressResult format
      // Note: New API results might structure data differently.
      // We often need to fetch details for the coordinates, so we store the placeSuggestion.
      return suggestions.map((suggestion: any) => ({
        display_name: suggestion.placePrediction?.text?.text || suggestion.placePrediction?.mainText?.text || "Unknown Location",
        lat: '', // To be fetched
        lon: '', // To be fetched
        place_id: suggestion.placePrediction?.placeId || suggestion.placePrediction?.place, // Handle different structure versions
      }));
    } 
    
    // Fallback to legacy service if new API class is missing (shouldn't happen with modern key)
    console.warn("AutocompleteSuggestion not found, falling back to legacy service");
    return new Promise((resolve) => {
       const autocompleteService = new window.google.maps.places.AutocompleteService();
       autocompleteService.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: 'jm' },
        },
        (predictions: any[], status: string) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
             resolve([]);
             return;
          }
          const results: AddressResult[] = predictions.map(prediction => ({
            display_name: prediction.description,
            lat: '',
            lon: '',
            place_id: prediction.place_id
          }));
          resolve(results);
        }
       );
    });

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

    // Modern Place API (2025+)
    const { Place } = await google.maps.importLibrary("places") as any;
    
    if (Place) {
      const place = new Place({ id: placeId });
      
      // Fetch only the fields we need
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

    // Fallback if Place class fails
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
