export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressResult {
  display_name: string;
  lat: string;
  lon: string;
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

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

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
 * Convert coordinates to address using OpenStreetMap Nominatim API
 */
export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<string> => {
  try {
    const response = await fetch(
      `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch address");
    }

    const data: AddressResult = await response.json();
    return data.display_name;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    throw new Error("Failed to convert coordinates to address");
  }
};

/**
 * Search for addresses using OpenStreetMap Nominatim API
 */
export const searchAddress = async (query: string): Promise<AddressResult[]> => {
  if (!query || query.length < 3) return [];

  try {
    const response = await fetch(
      `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(
        query
      )}&addressdetails=1&limit=5`,
      {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to search address");
    }

    const data: AddressResult[] = await response.json();
    return data;
  } catch (error) {
    console.error("Address search error:", error);
    return [];
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
 * Calculate driving distance between two points using OSRM
 * Returns distance in kilometers
 */
export const calculateRouteDistance = async (
  start: { lat: number; lon: number },
  end: { lat: number; lon: number }
): Promise<number | null> => {
  try {
    // OSRM requires {lon},{lat} format
    const startCoord = `${start.lon},${start.lat}`;
    const endCoord = `${end.lon},${end.lat}`;
    
    // Using OSRM public demo server (Note: subject to usage policies)
    // For production, you should host your own OSRM instance or use a paid service
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${startCoord};${endCoord}?overview=false`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch route");
    }

    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // OSRM returns distance in meters
      const meters = data.routes[0].distance;
      return meters / 1000;
    }
    
    return null;
  } catch (error) {
    console.error("Routing error:", error);
    // Fallback to Haversine if OSRM fails
    return calculateHaversineDistance(start, end);
  }
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

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}
