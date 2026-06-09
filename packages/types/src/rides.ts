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

/** Assigned to driver and not yet completed/cancelled. */
export const DRIVER_ACTIVE_RIDE_STATUSES: readonly RideRequestStatus[] = [
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
] as const;

export function isDriverActiveRideStatus(status: RideRequestStatus | string): boolean {
  return (DRIVER_ACTIVE_RIDE_STATUSES as readonly string[]).includes(status);
}

/** P2P in-app chat is available only during active driver–rider trip phases. */
export function isRideChatEnabled(status: RideRequestStatus | string): boolean {
  return isDriverActiveRideStatus(status);
}

export type RideMessageSenderRole = 'rider' | 'driver' | 'booker';

export interface RideChatParticipantDto {
  user_id: string | null;
  label: string;
}

export interface RideChatParticipantsDto {
  driver: RideChatParticipantDto;
  booker: RideChatParticipantDto;
  passenger: RideChatParticipantDto;
}

export type RideChatViewerRole = 'driver' | 'booker' | 'passenger';

export interface RideMessageDto {
  id: string;
  ride_request_id: string;
  sender_user_id: string;
  sender_role: RideMessageSenderRole;
  body: string;
  created_at: string;
}

export interface RideMessagesResponse {
  messages: RideMessageDto[];
  participants?: RideChatParticipantsDto;
  viewer_role?: RideChatViewerRole;
}

export interface SendRideMessageBody {
  body: string;
}

export interface SendRideMessageResponse {
  message: RideMessageDto;
}

export type DriverOfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'superseded';

export type RidePaymentMethod = 'cash' | 'card';

export type DriverEarningsPeriod = 'today' | 'week' | 'all';

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
  /** Rates and inputs used for this quote (admin transparency). */
  price_per_km_minor?: number;
  price_per_min_minor?: number;
  min_fare_minor?: number;
  distance_km?: number;
  duration_minutes?: number;
  currency?: string;
  rule_source?: 'database';
  location_key?: string;
  vehicle_type?: string;
  /** Wait time fee charged after grace period (in minor units). */
  wait_time_fee_minor?: number;
  /** Billable wait time minutes (after grace period). */
  wait_time_minutes?: number;
  /** Actual tolls detected via geofence crossings. */
  actual_tolls_minor?: number;
  /** Adjustment from estimated to actual tolls. */
  toll_adjustment_minor?: number;
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
  fare_final_breakdown?: FareBreakdown | null;
  assigned_driver_user_id: string | null;
  idempotency_key: string | null;
  cancel_reason: string | null;
  cancelled_by: 'rider' | 'driver' | 'system' | null;
  driver_offer_timeout_seconds: number;
  matching_wave: number;
  payment_method?: RidePaymentMethod | null;
  completed_at?: string | null;
  en_route_at?: string | null;
  arrived_pickup_at?: string | null;
  trip_started_at?: string | null;
  route_polyline_encoded?: string | null;
  transition_version?: number;
  last_driver_lat?: number | null;
  last_driver_lng?: number | null;
  last_driver_heading?: number | null;
  last_driver_location_at?: string | null;
  complete_suggested_at?: string | null;
  /** When pickup wait-time grace started (driver entered pickup geofence). */
  wait_time_started_at?: string | null;
  wait_time_fee_minor?: number | null;
  actual_tolls_minor?: number | null;
  verification_pin?: string | null;
  pin_verified_at?: string | null;
  /** True when driver must collect rider PIN before starting (driver API only). */
  pin_verification_pending?: boolean;
  dropoff_arrived_at?: string | null;
  /** When booked for someone else — guest display name. */
  guest_passenger_name?: string | null;
  /** E.164 phone for SMS updates to the guest passenger. */
  guest_passenger_phone?: string | null;
  /** @deprecated Use rider_contacts.relation instead */
  booking_purpose?: 'guest' | 'family' | 'business' | null;
  /** Account user ID of the person actually riding (delegated booking). */
  passenger_user_id?: string | null;
  /** Roam Contact used when booking for someone else. */
  rider_contact_id?: string | null;
  /** Set when ride originated from a Roam Tag booking request. */
  booking_request_id?: string | null;
  /** Open Roam (full tracking) or Shadow Roam (pay-only booker). */
  roam_mode?: 'open_roam' | 'shadow_roam' | null;
  created_at: string;
  updated_at: string;
}

export interface DriverMyTripsResponse {
  trips: RideRequestRow[];
  total: number;
  page: number;
  limit: number;
}

export interface DriverActiveRideResponse {
  ride: RideRequestRow | null;
}

export interface DriverEarningsSummary {
  period: DriverEarningsPeriod;
  cash_minor: number;
  digital_minor: number;
  currency: string;
  trip_count: number;
  digital_payments_enabled: boolean;
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
  guest_passenger_name?: string | null;
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
  drivers_available?: boolean;
  pickup_eta_minutes_estimate?: number;
  eta_arrival_at?: string;
  pickup_eta_source?: 'google_distance_matrix' | 'haversine_fallback' | 'no_drivers';
  fare_breakdown: FareBreakdown;
  quote_token: string;
}

export interface ActiveRideResponse {
  ride: RideRequestRow | null;
  participant_role: 'booker' | 'passenger' | null;
  is_delegated?: boolean;
}

export interface ActiveRideSummaryDto {
  ride_id: string;
  status: RideRequestStatus;
  guest_passenger_name: string | null;
  participant_role: 'booker' | 'passenger';
  is_delegated: boolean;
  roam_mode?: 'open_roam' | 'shadow_roam' | null;
}

export interface ActiveRideSummaryResponse {
  summary: ActiveRideSummaryDto | null;
}

export type WalletTransactionKind = 'shadow_trip' | 'open_trip' | 'topup';

export interface WalletTransactionDto {
  id: string;
  kind: WalletTransactionKind;
  title: string;
  amount_minor: string;
  currency: string;
  date: string;
  meta?: string;
  ride_id?: string;
  driver_name?: string | null;
  pickup_at?: string | null;
  dropoff_at?: string | null;
}

export interface WalletTransactionsResponse {
  transactions: WalletTransactionDto[];
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
  route_polyline_encoded?: string;
  payment_method?: RidePaymentMethod;
  guest_passenger_name?: string;
  guest_passenger_phone?: string;
  rider_contact_id?: string;
  passenger_user_id?: string;
  passenger_authorization_id?: string;
  booking_request_id?: string;
}

export interface RideLocationUpdateBody {
  ride_id: string;
  lat: number;
  lng: number;
  heading_degrees?: number;
  speed_mps?: number;
  accuracy_m?: number;
  recorded_at?: string;
  client_seq: number;
}

export interface RideLiveResponse {
  ride: {
    id: string;
    status: RideRequestStatus;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    route_polyline_encoded?: string | null;
    complete_suggested_at?: string | null;
    last_driver_location_at?: string | null;
  };
  driver_location: {
    lat: number;
    lng: number;
    heading: number | null;
    updated_at: string | null;
  } | null;
}

export interface DispatchAutomationSettings {
  trip_location_interval_seconds: number;
  pickup_geofence_radius_m: number;
  dropoff_geofence_radius_m: number;
  arrival_dwell_seconds: number;
  max_speed_mps_for_arrival: number;
  auto_en_route_on_accept: boolean;
  auto_arrive_enabled: boolean;
  auto_complete_suggest_enabled: boolean;
  no_show_cancel_minutes: number;
  gps_max_accuracy_m_for_arrival: number;
  no_show_auto_cancel_enabled: boolean;
  wait_time_grace_minutes: number;
  wait_time_rate_per_min_minor: number;
  wait_time_charge_enabled: boolean;
  wait_time_max_minutes: number;
}

export interface DriverPresenceBody {
  lat: number;
  lng: number;
  heading_degrees?: number;
  available_for_rides?: boolean;
  /** Normalized rides body-type slug (from Commando motor vehicle catalog). */
  body_type_slug?: string;
}

export interface DriverTransitionBody {
  status: RideRequestStatus;
  reason?: string;
  /** 4-digit PIN for trip start verification (required when pin_verification_required is true). */
  verification_pin?: string;
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

export type RiderAccountStatus = 'active' | 'suspended' | 'banned';

export interface RiderDirectoryRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  account_status: RiderAccountStatus;
  total_trips: number;
  completed_trips: number;
  cancelled_trips: number;
  last_ride_at: string | null;
  lifetime_spend_minor: number;
  created_at: string | null;
  last_sign_in_at: string | null;
}

export interface RiderAdminNote {
  id: string;
  rider_user_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export interface RiderAdminPermissions {
  can_write: boolean;
  can_ban: boolean;
  can_delete: boolean;
  can_see_reset_link: boolean;
}

export interface RiderDetailDto {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  account_status: RiderAccountStatus;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  stats: {
    total_trips: number;
    completed_trips: number;
    cancelled_trips: number;
    last_ride_at: string | null;
    lifetime_spend_minor: number;
  };
  recent_notes: RiderAdminNote[];
  recent_activity: Array<{
    id: number;
    event_type: string;
    payload: Record<string, unknown>;
    actor_user_id: string | null;
    created_at: string;
  }>;
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
