export interface RoutePoint {
  lat: number;
  lon: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
}

export type TripStatus = 'IDLE' | 'DRIVING' | 'WAITING';

export interface TripStop {
  id: string;
  location: string;       // Address
  coordinates: { lat: number; lon: number };
  arrivalTime: number;    // Timestamp
  departureTime?: number; // Timestamp
  durationSeconds: number;
  isOverThreshold: boolean; // > 120 seconds
}

export interface TripSession {
  isActive: boolean;
  status: TripStatus;
  startTime: number | null; // Timestamp (Date.now())
  startLocation: string | null;
  startCoords: {
    lat: number;
    lon: number;
  } | null;
  vehicleId: string | null;
  route: RoutePoint[];
  stops: TripStop[];
  currentStop: TripStop | null;
}
