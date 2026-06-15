/**
 * Platform Matching Brain — Shared Types
 * 
 * Contracts for the central matching engine that serves rides, fleet, dash, and enterprise.
 * See docs/platform/MATCHING_BRAIN.md for architecture overview.
 */

// -----------------------------------------------------------------------------
// Policy Types
// -----------------------------------------------------------------------------

export type BodyTypeTierMode = 'expand' | 'strict';

export type ProductKey = 'rides' | 'fleet' | 'dash' | 'enterprise';

export type SurfaceKey = 'rider' | 'driver' | 'default';

/**
 * Core matching policy configuration.
 * Stored in matching.policies table.
 */
export interface MatchingPolicy {
  id: string;
  name: string;
  
  // Wave dispatch settings
  max_match_waves: number;
  wave_radius_km: number[];
  max_offers_per_wave: number;
  default_driver_offer_timeout_seconds: number;
  driver_location_max_age_minutes: number;
  max_matching_duration_minutes: number;
  
  // Quote ETA
  quote_driver_radius_km: number;
  
  // Body type filtering
  body_type_filtering_enabled: boolean;
  body_type_tier_mode: BodyTypeTierMode;
  require_body_type_for_offers: boolean;
  
  // Driver mode
  independent_only_matching: boolean;
  
  // Trip lifecycle
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
  
  // Wait time
  wait_time_grace_minutes: number;
  wait_time_rate_per_min_minor: number;
  wait_time_charge_enabled: boolean;
  wait_time_max_minutes: number;
  
  // PIN verification
  pin_verification_enabled: boolean;
  pin_verification_required_for_start: boolean;
  
  // Toll detection
  toll_detection_enabled: boolean;
  toll_geofence_radius_m: number;
  
  // Serial dispatch (Phase 2)
  serial_dispatch_enabled: boolean;
  
  // H3 spatial indexing (Phase 4+5)
  h3_resolution: number;
  h3_supply_enabled: boolean;
  h3_surge_enabled: boolean;
  wave_h3_k_rings: number[];
  
  // Metadata
  is_default: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Default policy values matching the DB defaults.
 */
export const DEFAULT_MATCHING_POLICY: Omit<MatchingPolicy, 'id' | 'created_at' | 'updated_at' | 'updated_by'> = {
  name: 'default',
  max_match_waves: 3,
  wave_radius_km: [5, 15, 35],
  max_offers_per_wave: 8,
  default_driver_offer_timeout_seconds: 15,
  driver_location_max_age_minutes: 10,
  max_matching_duration_minutes: 15,
  quote_driver_radius_km: 15,
  body_type_filtering_enabled: true,
  body_type_tier_mode: 'expand',
  require_body_type_for_offers: true,
  independent_only_matching: true,
  trip_location_interval_seconds: 4,
  pickup_geofence_radius_m: 80,
  dropoff_geofence_radius_m: 100,
  arrival_dwell_seconds: 15,
  max_speed_mps_for_arrival: 4,
  auto_en_route_on_accept: true,
  auto_arrive_enabled: true,
  auto_complete_suggest_enabled: true,
  no_show_cancel_minutes: 5,
  gps_max_accuracy_m_for_arrival: 50,
  no_show_auto_cancel_enabled: false,
  wait_time_grace_minutes: 2,
  wait_time_rate_per_min_minor: 50,
  wait_time_charge_enabled: false,
  wait_time_max_minutes: 15,
  pin_verification_enabled: false,
  pin_verification_required_for_start: false,
  toll_detection_enabled: false,
  toll_geofence_radius_m: 100,
  serial_dispatch_enabled: false,
  h3_resolution: 7,
  h3_supply_enabled: false,
  h3_surge_enabled: false,
  wave_h3_k_rings: [0, 2, 6],
  is_default: true,
};

/**
 * Product profile links a product/surface to a policy with optional overrides.
 */
export interface MatchingProductProfile {
  id: string;
  product_key: ProductKey;
  surface_key: SurfaceKey;
  policy_id: string;
  overrides: Partial<MatchingPolicy> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Resolved policy for a specific product, after merging policy + overrides.
 */
export interface ResolvedMatchingPolicy extends MatchingPolicy {
  product_key: ProductKey;
  surface_key: SurfaceKey;
  profile_id: string;
}

// -----------------------------------------------------------------------------
// Internal RPC Request/Response DTOs (Phase 1)
// -----------------------------------------------------------------------------

/**
 * Request to start matching for a new ride.
 */
export interface StartMatchingRequest {
  product_key: ProductKey;
  surface_key?: SurfaceKey;
  ride_request_id: string;
  
  // Ride snapshot (or matching can load from DB)
  ride_snapshot?: {
    pickup_lat: number;
    pickup_lng: number;
    vehicle_option: string;
    rider_user_id: string;
    driver_offer_timeout_seconds?: number;
    booking_request_id?: string;
    guest_passenger_name?: string;
  };
}

export interface StartMatchingResponse {
  ok: boolean;
  ride_request_id: string;
  wave: number;
  offers_created: number;
  error?: string;
}

/**
 * Request to reconcile matching state (advance waves, expire offers).
 */
export interface ReconcileMatchingRequest {
  product_key: ProductKey;
  ride_request_id: string;
  request_id?: string;
}

export interface ReconcileMatchingResponse {
  ok: boolean;
  ride_request_id: string;
  status: string;
  wave: number;
  pending_offers: number;
  action_taken?: 'wave_advanced' | 'cancelled' | 'assigned' | 'none';
  error?: string;
}

/**
 * Request to run a specific matching wave.
 */
export interface RunWaveRequest {
  product_key: ProductKey;
  ride_request_id: string;
  wave: number;
  request_id?: string;
}

export interface RunWaveResponse {
  ok: boolean;
  ride_request_id: string;
  wave: number;
  candidates_found: number;
  offers_created: number;
  supply_source: 'h3' | 'legacy';
  error?: string;
}

/**
 * Request to accept a driver offer (Phase 3: atomic).
 */
export interface AcceptOfferRequest {
  product_key: ProductKey;
  offer_id: string;
  driver_user_id: string;
}

export interface AcceptOfferResponse {
  ok: boolean;
  ride_request_id: string;
  offer_id: string;
  ride?: Record<string, unknown>;
  error?: 'offer_not_found' | 'offer_not_pending' | 'offer_expired' | 'ride_not_matching' | 'assign_failed' | 'driver_debt_blocked';
}

/**
 * Request to decline a driver offer.
 */
export interface DeclineOfferRequest {
  product_key: ProductKey;
  offer_id: string;
  driver_user_id: string;
}

export interface DeclineOfferResponse {
  ok: boolean;
  offer_id: string;
  reconcile_triggered: boolean;
  error?: string;
}

// -----------------------------------------------------------------------------
// Admin API DTOs
// -----------------------------------------------------------------------------

export interface MatchingPolicyUpdateInput {
  name?: string;
  max_match_waves?: number;
  wave_radius_km?: number[];
  max_offers_per_wave?: number;
  default_driver_offer_timeout_seconds?: number;
  driver_location_max_age_minutes?: number;
  max_matching_duration_minutes?: number;
  quote_driver_radius_km?: number;
  body_type_filtering_enabled?: boolean;
  body_type_tier_mode?: BodyTypeTierMode;
  require_body_type_for_offers?: boolean;
  independent_only_matching?: boolean;
  serial_dispatch_enabled?: boolean;
  h3_resolution?: number;
  h3_supply_enabled?: boolean;
  h3_surge_enabled?: boolean;
  wave_h3_k_rings?: number[];
  // Trip lifecycle fields can also be updated...
}

export interface MatchingProductProfileInput {
  product_key: ProductKey;
  surface_key?: SurfaceKey;
  policy_id: string;
  overrides?: Partial<MatchingPolicy>;
  is_active?: boolean;
}

// -----------------------------------------------------------------------------
// Audit Events
// -----------------------------------------------------------------------------

export type MatchingAuditEventType =
  | 'matching_policy_created'
  | 'matching_policy_updated'
  | 'matching_profile_created'
  | 'matching_profile_updated'
  | 'matching_wave_started'
  | 'matching_wave_completed'
  | 'matching_offer_created'
  | 'matching_offer_accepted'
  | 'matching_offer_declined'
  | 'matching_offer_expired'
  | 'matching_cancelled_no_drivers'
  | 'matching_cancelled_timeout';

export interface MatchingAuditEvent {
  id: number;
  event_type: MatchingAuditEventType;
  product_key: ProductKey | null;
  policy_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Utility types
// -----------------------------------------------------------------------------

/**
 * Wave radius calculation helper.
 */
export function getWaveRadiusKm(policy: Pick<MatchingPolicy, 'wave_radius_km'>, wave: number): number {
  const idx = Math.min(Math.max(wave, 1) - 1, policy.wave_radius_km.length - 1);
  return policy.wave_radius_km[idx] ?? policy.wave_radius_km[policy.wave_radius_km.length - 1] ?? 35;
}

/**
 * Driver location max age in milliseconds.
 */
export function driverLocationMaxAgeMs(policy: Pick<MatchingPolicy, 'driver_location_max_age_minutes'>): number {
  return policy.driver_location_max_age_minutes * 60 * 1000;
}

/**
 * Check if matching has timed out.
 */
export function isMatchingTimedOut(
  rideCreatedAt: string | Date,
  policy: Pick<MatchingPolicy, 'max_matching_duration_minutes'>,
  nowMs = Date.now(),
): boolean {
  const createdMs = typeof rideCreatedAt === 'string' ? Date.parse(rideCreatedAt) : rideCreatedAt.getTime();
  if (!Number.isFinite(createdMs)) return false;
  const ageMs = nowMs - createdMs;
  return ageMs > policy.max_matching_duration_minutes * 60 * 1000;
}
