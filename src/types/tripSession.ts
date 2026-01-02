export interface RoutePoint {
  lat: number;
  lon: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
}

export interface TripSession {
  isActive: boolean;
  startTime: number | null; // Timestamp (Date.now())
  startLocation: string | null;
  startCoords: {
    lat: number;
    lon: number;
  } | null;
  vehicleId: string | null;
  route: RoutePoint[];
}
