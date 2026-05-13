import { projectId, publicAnonKey } from '../utils/supabase/info';
import { RoutePoint } from '../types/tripSession';
import { API_ENDPOINTS } from './apiConfig';

export interface SnappedRouteResult {
  snappedRoute: { lat: number; lon: number }[];
  totalDistance: number; // meters
  totalDuration: number; // seconds
  confidence: number;
}

export const mapMatchService = {
  /**
   * Send raw GPS points to the backend for OSRM Map Matching
   */
  async snapToRoad(points: RoutePoint[]): Promise<SnappedRouteResult | null> {
    if (!points || points.length < 2) return null;

    try {
      const response = await fetch(`${API_ENDPOINTS.ai}/map-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ points })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Map Match Service Error:", errorText);
        throw new Error(`Failed to snap route: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success || !result.data) {
          console.warn("Map Match returned failure:", result.error);
          return null;
      }

      return result.data as SnappedRouteResult;
    } catch (error) {
      console.error("Map Match Service Exception:", error);
      return null;
    }
  }
};
