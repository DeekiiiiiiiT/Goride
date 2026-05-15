/**
 * Shared API contracts for passenger dispatch (`rides` Edge function).
 * @see docs/passenger-rides/RIDES_SPEC.md
 */

export type RideRequestStatus =
  | 'matching'
  | 'driver_assigned'
  | 'driver_en_route_pickup'
  | 'driver_arrived_pickup'
  | 'on_trip'
  | 'completed'
  | 'cancelled';

export type DriverOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'superseded';

export interface RideRequestRow {
  id: string;
  rider_user_id: string;
  status: RideRequestStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string | null;
  vehicle_option: string;
  fare_estimate_minor: number;
  fare_final_minor: number | null;
  surge_multiplier: number;
  currency: string;
  distance_estimate_km: number | null;
  eta_pickup_seconds_estimate: number | null;
  assigned_driver_user_id: string | null;
  idempotency_key: string | null;
  cancel_reason: string | null;
  cancelled_by: 'rider' | 'driver' | 'system' | null;
  driver_offer_timeout_seconds: number;
  matching_wave: number;
  created_at: string;
  updated_at: string;
}

export interface DriverOfferRow {
  id: string;
  ride_request_id: string;
  driver_user_id: string;
  status: DriverOfferStatus;
  wave: number;
  rank_score: number | null;
  distance_km: number | null;
  expires_at: string;
  created_at: string;
}

export interface FareQuoteResponse {
  distance_estimate_km: number;
  eta_trip_minutes_estimate: number;
  eta_pickup_seconds_estimate: number;
  surge_multiplier: number;
  fare_estimate_minor: string;
  currency: string;
  grid_cell_key: string;
}

export interface CreateRideBody {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  pickup_address?: string;
  dropoff_address?: string;
  vehicle_option?: string;
  idempotency_key?: string;
  driver_offer_timeout_seconds?: number;
}

export interface DriverPresenceBody {
  lat: number;
  lng: number;
  heading_degrees?: number;
  available_for_rides?: boolean;
}

export interface DriverTransitionBody {
  status: RideRequestStatus;
  reason?: string;
}
