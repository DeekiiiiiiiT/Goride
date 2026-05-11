import { loadGoogleMapsApi } from './locationService';

export interface GeocodedResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string;
  partialMatch: boolean;
  addressComponents: any[]; // google.maps.GeocoderAddressComponent[]
}

export type GeocodingStatus = 'OK' | 'ZERO_RESULTS' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR' | 'ERROR';

export interface GeocodingResponse {
  success: boolean;
  result?: GeocodedResult;
  status: GeocodingStatus;
  error?: string;
}

// Simple delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Geocode a single address string
 * Handles loading the API if needed
 */
export const geocodeAddress = async (query: string): Promise<GeocodingResponse> => {
  try {
    await loadGoogleMapsApi();

    // Use any casting for window.google as types might not be fully available
    const g = window.google as any;

    if (!g?.maps?.importLibrary) {
         // Fallback for legacy loading if importLibrary is missing
         if (g?.maps?.Geocoder) {
             const geocoder = new g.maps.Geocoder();
             return executeGeocode(geocoder, query);
         }
         throw new Error("Google Maps API not fully loaded");
    }

    const { Geocoder } = await g.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
    return executeGeocode(geocoder, query);

  } catch (error: any) {
    console.error("Geocoding error:", error);
    return {
      success: false,
      status: 'ERROR',
      error: error.message || "Unknown error"
    };
  }
};

const executeGeocode = (geocoder: any, query: string): Promise<GeocodingResponse> => {
    return new Promise((resolve) => {
      geocoder.geocode({ address: query }, (results: any[], status: string) => {
        if (status === 'OK' && results && results[0]) {
          const res = results[0];
          resolve({
            success: true,
            status: 'OK',
            result: {
              lat: res.geometry.location.lat(),
              lng: res.geometry.location.lng(),
              formattedAddress: res.formatted_address,
              placeId: res.place_id,
              partialMatch: res.partial_match || false,
              addressComponents: res.address_components
            }
          });
        } else {
          resolve({
            success: false,
            status: status as GeocodingStatus,
            error: status
          });
        }
      });
    });
}

/**
 * Search for a place using the Places API (Text Search)
 * This is better for searching by name (e.g. "Cool Oasis Black River")
 * Returns a GeocodedResult by fetching details via Geocoder after finding the place.
 */
export const searchPlace = async (query: string): Promise<GeocodingResponse> => {
  try {
    await loadGoogleMapsApi();
    const g = window.google as any;
    
    let placeId: string | null = null;

    // 1. Try Modern Place API (Place.searchByText)
    // This resolves the "PlacesService is not available" deprecation warning
    if (g.maps.importLibrary) {
        try {
            const { Place } = await g.maps.importLibrary("places");
            
            // Check if searchByText is supported (v3.54+)
            if (Place.searchByText) {
                const { places } = await Place.searchByText({
                    textQuery: query,
                    fields: ['id'], // We only need the ID to pass to Geocoder
                });
                
                if (places && places.length > 0) {
                    placeId = places[0].id;
                }
            } else {
                console.warn("Place.searchByText is not supported in this version of Maps API");
            }
        } catch (e) {
            console.warn("Modern Place.searchByText failed:", e);
        }
    }

    // 2. REMOVED Legacy PlacesService Fallback
    // As of March 1st, 2025, PlacesService is not available to new customers.
    
    if (!placeId) {
        return {
            success: false,
            status: 'ZERO_RESULTS',
            error: "No places found matching query"
        };
    }

    // 3. Geocode via Place ID to get standardized components (City, Parish, etc.)
    const { Geocoder } = await g.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode({ placeId }, (results: any[], status: string) => {
        if (status === 'OK' && results && results[0]) {
          const res = results[0];
          resolve({
            success: true,
            status: 'OK',
            result: {
              lat: res.geometry.location.lat(),
              lng: res.geometry.location.lng(),
              formattedAddress: res.formatted_address,
              placeId: res.place_id,
              partialMatch: false, 
              addressComponents: res.address_components
            }
          });
        } else {
          resolve({
            success: false,
            status: status as GeocodingStatus,
            error: status
          });
        }
      });
    });

  } catch (error: any) {
    console.error("Place search error:", error);
    return {
      success: false,
      status: 'ERROR',
      error: error.message || "Unknown error"
    };
  }
};

/**
 * Rate limited batch processor
 * Processes a list of items using a processor function
 * with delays between calls to avoid hitting rate limits.
 * 
 * Includes exponential backoff for OVER_QUERY_LIMIT
 */
export const processBatchWithRateLimit = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  baseDelayMs: number = 300,
  onProgress?: (completed: number, total: number, result: R) => void
): Promise<R[]> => {
  const results: R[] = [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    let attempts = 0;
    let success = false;
    let result: R | null = null;
    let currentDelay = baseDelayMs;

    // Retry loop for this specific item (specifically for rate limits)
    while (!success && attempts < 3) {
        try {
            result = await processor(item);
            
            // Check if result indicates rate limit (if R is GeocodingResponse)
            const geoRes = result as any as GeocodingResponse;
            if (geoRes && geoRes.status === 'OVER_QUERY_LIMIT') {
                console.warn(`Rate limit hit for item ${i}. Retrying in ${currentDelay * 2}ms...`);
                await delay(currentDelay * 2);
                currentDelay *= 2; // Exponential backoff
                attempts++;
            } else {
                success = true;
            }
        } catch (e) {
            console.error(`Error processing item ${i}:`, e);
            break; // Don't retry on generic errors, just fail this item
        }
    }

    if (result) {
        results.push(result);
        if (onProgress) {
            onProgress(i + 1, total, result);
        }
    } else {
        // Should happen if processor throws or returns null
        // We push a "failed" result if we can construct one, or just the failed result if processor returned it
        // Depending on usage. Here we assume processor returns a result even on failure (like GeocodingResponse)
        if (result) results.push(result);
    }

    // Wait before next item (unless it's the last one)
    if (i < total - 1) {
      await delay(currentDelay);
    }
  }

  return results;
};
