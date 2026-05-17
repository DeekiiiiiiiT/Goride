import { publicAnonKey } from '../utils/supabase/info';
import type { RoutePoint } from '../types/tripSession';
import { API_ENDPOINTS } from './apiConfig';

export interface SnappedRouteResult {
  snappedRoute: { lat: number; lon: number }[];
  totalDistance: number;
  totalDuration: number;
  confidence: number;
}

export const mapMatchService = {
  async snapToRoad(points: RoutePoint[]): Promise<SnappedRouteResult | null> {
    if (!points || points.length < 2) return null;

    try {
      const response = await fetch(`${API_ENDPOINTS.ai}/map-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ points }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Map Match Service Error:', errorText);
        throw new Error(`Failed to snap route: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        console.warn('Map Match returned failure:', result.error);
        return null;
      }

      return result.data as SnappedRouteResult;
    } catch (error) {
      console.error('Map Match Service Exception:', error);
      return null;
    }
  },
};
