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

export interface FareBreakdown {
  base_minor: number;
  booking_fee_minor: number;
  estimated_tolls_minor?: number;
  distance_component_minor: number;
  time_component_minor: number;
  subtotal_before_surge_minor: number;
  surge_multiplier: number;
  after_surge_minor: number;
  min_fare_applied: boolean;
  fare_estimate_minor: number;
}

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
  duration_estimate_minutes?: number | null;
  eta_pickup_seconds_estimate: number | null;
  fare_breakdown?: FareBreakdown | null;
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

/** Ride summary attached to driver pending offers. */
export interface DriverOfferRideSummary {
  id: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  fare_estimate_minor: number;
  currency: string;
  distance_estimate_km: number | null;
  duration_estimate_minutes?: number | null;
  vehicle_option: string;
  surge_multiplier: number;
}

export interface DriverOfferWithRide extends DriverOfferRow {
  ride: DriverOfferRideSummary | null;
}

export interface FareQuoteResponse {
  distance_estimate_km: number;
  duration_estimate_minutes: number;
  eta_trip_minutes_estimate: number;
  eta_pickup_seconds_estimate: number;
  surge_multiplier: number;
  fare_estimate_minor: string;
  currency: string;
  grid_cell_key: string;
  vehicle_option: string;
  route_source: 'google_directions' | 'haversine_fallback';
  duration_traffic_aware?: boolean;
  route_polyline_encoded?: string;
  fare_breakdown: FareBreakdown;
  quote_token: string;
}

export interface CreateRideBody {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  pickup_address?: string;
  dropoff_address?: string;
  vehicle_option?: string;
  quote_token: string;
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

/** DB row + major-unit fields for Super Admin API responses. */
export interface FareRuleAdminDto {
  id: string;
  city: string;
  vehicle_type: string;
  currency: string;
  is_active: boolean;
  effective_from: string;
  created_at: string;
  updated_at: string;
  base_fare_minor: number;
  price_per_km_minor: number;
  price_per_min_minor: number;
  booking_fee_minor: number;
  min_fare_minor: number;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  min_fare: number;
}

export interface FareRuleAdminInput {
  city: string;
  vehicle_type: string;
  currency?: string;
  is_active?: boolean;
  base_fare: number;
  price_per_km: number;
  price_per_min: number;
  booking_fee: number;
  min_fare: number;
}

export interface SurgeCellAdminRow {
  cell_key: string;
  surge_multiplier: number;
  open_requests: number;
  available_drivers: number;
  updated_at: string;
}

/** Format minor currency units (JMD cents) for display. */
export function formatMoneyMinor(
  minor: bigint | number | string | null | undefined,
  currency = 'JMD',
): string {
  if (minor == null) return '—';
  const n = typeof minor === 'bigint' ? Number(minor) : Number(minor);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-JM', { style: 'currency', currency }).format(n / 100);
}
