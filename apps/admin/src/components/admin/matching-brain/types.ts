/**
 * Matching Brain UI Types and Constants
 * 
 * Shared types, tooltips, and section keys for the Matching Brain settings UI.
 */

export interface MatchingPolicy {
  id: string;
  name: string;
  max_match_waves: number;
  wave_radius_km: number[];
  max_offers_per_wave: number;
  default_driver_offer_timeout_seconds: number;
  driver_location_max_age_minutes: number;
  max_matching_duration_minutes: number;
  quote_driver_radius_km: number;
  body_type_filtering_enabled: boolean;
  body_type_tier_mode: 'expand' | 'strict';
  require_body_type_for_offers: boolean;
  independent_only_matching: boolean;
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
  pin_verification_enabled: boolean;
  pin_verification_required_for_start: boolean;
  toll_detection_enabled: boolean;
  toll_geofence_radius_m: number;
  serial_dispatch_enabled: boolean;
  h3_resolution: number;
  h3_supply_enabled: boolean;
  h3_surge_enabled: boolean;
  wave_h3_k_rings: number[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ProductProfile {
  id: string;
  product_key: 'rides' | 'fleet' | 'dash' | 'enterprise';
  surface_key: 'rider' | 'driver' | 'default';
  policy_id: string;
  overrides: Partial<MatchingPolicy> | null;
  is_active: boolean;
  policy?: MatchingPolicy;
}

export interface BrainStatus {
  brain_enabled: boolean;
  flags: Record<string, string>;
}

export interface SyncStatus {
  policy_id: string;
  in_sync: boolean;
  legacy_available: boolean;
  differences?: Array<{
    field: string;
    matching_value: unknown;
    legacy_value: unknown;
  }>;
  message?: string;
  matching_updated_at?: string;
  legacy_updated_at?: string;
}

/**
 * Section IDs for organizing settings
 */
export type SectionId =
  | 'waveDispatch'
  | 'serialDispatch'
  | 'driverPresence'
  | 'bodyTypePolicy'
  | 'driverRollout'
  | 'quotes'
  | 'inTripAutomation'
  | 'waitTimeBilling'
  | 'pinVerification'
  | 'tollDetection'
  | 'h3Indexing';

/**
 * Maps section IDs to their policy field keys
 */
export const SECTION_KEYS: Record<SectionId, (keyof MatchingPolicy)[]> = {
  waveDispatch: [
    'max_match_waves',
    'wave_radius_km',
    'max_offers_per_wave',
    'default_driver_offer_timeout_seconds',
    'max_matching_duration_minutes',
  ],
  serialDispatch: [
    'serial_dispatch_enabled',
  ],
  driverPresence: [
    'driver_location_max_age_minutes',
    'require_body_type_for_offers',
  ],
  bodyTypePolicy: [
    'body_type_filtering_enabled',
    'body_type_tier_mode',
  ],
  driverRollout: [
    'independent_only_matching',
  ],
  quotes: [
    'quote_driver_radius_km',
  ],
  inTripAutomation: [
    'trip_location_interval_seconds',
    'pickup_geofence_radius_m',
    'dropoff_geofence_radius_m',
    'arrival_dwell_seconds',
    'max_speed_mps_for_arrival',
    'gps_max_accuracy_m_for_arrival',
    'no_show_cancel_minutes',
    'auto_en_route_on_accept',
    'auto_arrive_enabled',
    'auto_complete_suggest_enabled',
    'no_show_auto_cancel_enabled',
  ],
  waitTimeBilling: [
    'wait_time_grace_minutes',
    'wait_time_rate_per_min_minor',
    'wait_time_max_minutes',
    'wait_time_charge_enabled',
  ],
  pinVerification: [
    'pin_verification_enabled',
    'pin_verification_required_for_start',
  ],
  tollDetection: [
    'toll_detection_enabled',
    'toll_geofence_radius_m',
  ],
  h3Indexing: [
    'h3_resolution',
    'h3_supply_enabled',
    'h3_surge_enabled',
    'wave_h3_k_rings',
  ],
};

/**
 * Tooltips for all policy fields
 */
export const TOOLTIPS: Record<string, string> = {
  // Wave Dispatch
  max_match_waves:
    'How many search rounds run per ride. After each wave finishes (offers expire or are declined), the system widens the search radius. When all waves are exhausted with no accept, the ride is cancelled.',
  wave_radius_km:
    'Maximum distance from pickup (km) for drivers considered in each wave. Each wave should use a larger radius than the previous.',
  max_offers_per_wave:
    'Maximum drivers pinged at once in each wave. Higher values notify more drivers but may feel spammy.',
  default_driver_offer_timeout_seconds:
    'Seconds each driver has to accept or decline an offer before it expires and matching can advance to the next driver or wave.',
  max_matching_duration_minutes:
    'Hard ceiling: if a ride is still matching after this many minutes, the system auto-cancels (matching timeout).',

  // Serial Dispatch
  serial_dispatch_enabled:
    'When enabled, offers are sent to one driver at a time instead of multiple drivers in parallel. Reduces churn but may increase pickup wait times.',

  // Driver Presence
  driver_location_max_age_minutes:
    'Driver GPS must be updated within this window to count as online for matching and fare quotes.',
  require_body_type_for_offers:
    'When on, drivers without a registered body type are excluded from offers.',

  // Body Type Policy
  body_type_filtering_enabled:
    'When on, only drivers whose vehicle body type matches the booked service are offered the ride.',
  body_type_tier_mode:
    'Expand adds lower-priority body types in later waves. Strict keeps only the highest-priority types for every wave.',

  // Driver Rollout
  independent_only_matching:
    'Beta gate: when on, only independent drivers receive passenger offers and can go online for Roam dispatch. Fleet drivers keep the legacy START TRIP flow.',

  // Quotes
  quote_driver_radius_km:
    'Radius around pickup used on the fare quote to find nearby drivers and show pickup ETA on vehicle cards.',

  // In-Trip Automation
  trip_location_interval_seconds:
    'How often the driver app sends GPS updates during an active trip (geofence and live map).',
  pickup_geofence_radius_m:
    'Radius around pickup where the driver is considered arrived for auto-arrive and dwell timers.',
  dropoff_geofence_radius_m:
    'Radius around drop-off where complete-trip suggestions and drop-off geofence logic apply.',
  arrival_dwell_seconds:
    'Driver must remain inside the pickup geofence this long before auto-arrive or no-show logic can fire.',
  max_speed_mps_for_arrival:
    'Maximum speed (m/s) allowed when evaluating geofence arrival — filters GPS jitter while driving past the pin.',
  gps_max_accuracy_m_for_arrival:
    'GPS fix must be at least this accurate (meters) before auto-arrive is allowed.',
  no_show_cancel_minutes:
    'After driver arrives at pickup, minutes to wait before a no-show cancel is allowed (when auto no-show is enabled).',
  auto_en_route_on_accept:
    'Automatically move the ride to en route to pickup when a driver accepts, without a manual tap.',
  auto_arrive_enabled:
    'Automatically mark driver arrived at pickup when geofence + dwell rules are satisfied.',
  auto_complete_suggest_enabled:
    'Prompt or suggest completing the trip when the driver enters the drop-off geofence.',
  no_show_auto_cancel_enabled:
    'Automatically cancel the ride when the rider no-shows after dwell at pickup. Off by default until QA sign-off.',

  // Wait Time Billing
  wait_time_grace_minutes:
    'Free wait time after the driver enters the pickup geofence. Billing starts once this period ends.',
  wait_time_rate_per_min_minor:
    'Per-minute rate for wait time in JMD cents. This rate is multiplied by surge if active.',
  wait_time_max_minutes:
    'Maximum minutes a driver waits before the system may auto-cancel. Should be greater than grace period.',
  wait_time_charge_enabled:
    'Enable wait time billing. When on, riders are charged per-minute after the grace period expires.',

  // PIN Verification
  pin_verification_enabled:
    'Enable PIN generation for rides. Each ride shows a 4-digit PIN to the rider that the driver must verify.',
  pin_verification_required_for_start:
    'Require PIN verification before trip can start. Driver must enter the correct PIN to start the trip.',

  // Toll Detection
  toll_detection_enabled:
    'Enable real-time toll detection during trips. Tolls are detected via geofence and added to the final fare.',
  toll_geofence_radius_m:
    'Radius around toll plazas for geofence detection. Driver must pass within this distance for toll to be recorded.',

  // H3 Indexing
  h3_resolution:
    'H3 hexagon resolution for spatial indexing. 7 = ~1.2km edge (urban), 8 = ~460m edge (dense urban). Calibrate per market.',
  h3_supply_enabled:
    'Use H3 hexagonal indexing for driver supply lookups instead of simple radius queries.',
  h3_surge_enabled:
    'Use H3 hexagonal cells for surge pricing calculations.',
  wave_h3_k_rings:
    'K-ring values per wave for H3 lookups. Higher values search larger areas. Calibrate per market.',
};

/**
 * Validate that wave radii are strictly increasing
 */
export function validateWaveRadii(radii: number[]): string | null {
  for (let i = 1; i < radii.length; i++) {
    if (radii[i] <= radii[i - 1]) {
      return 'Wave radii must increase with each wave';
    }
  }
  return null;
}

/**
 * Check if matching settings are "aggressive" (needs confirmation)
 */
export function isAggressiveSettings(
  maxOffersPerWave: number,
  waveRadii: number[],
): boolean {
  if (maxOffersPerWave > 10) return true;
  for (let i = 1; i < waveRadii.length; i++) {
    if (waveRadii[i] > waveRadii[i - 1] * 2) return true;
  }
  return false;
}
