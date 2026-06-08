/** Trusted contact trip sharing — SMS links and public web view. */

export type TripShareKind = 'manual' | 'auto' | 'emergency' | 'test';

export type TripSharePublicStatus =
  | 'matching'
  | 'driver_assigned'
  | 'driver_en_route_pickup'
  | 'driver_arrived_pickup'
  | 'on_trip'
  | 'completed'
  | 'cancelled';

export interface TripSharePublicDto {
  token: string;
  rider_first_name: string;
  status: TripSharePublicStatus;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_label: string | null;
  eta_pickup_seconds_estimate: number | null;
  eta_dropoff_seconds_estimate: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  is_emergency: boolean;
  message: string | null;
  expires_at: string;
  expired: boolean;
}

export interface ShareTripBody {
  contact_ids?: string[];
  group_ids?: string[];
  message?: string;
  share_with_all?: boolean;
}

export interface ShareTripResponse {
  shared_count: number;
  share_ids: string[];
}

export interface TestShareBody {
  contact_ids: string[];
}

export interface TestShareResponse {
  sent_count: number;
}

export interface EmergencyAlertTrustedBody {
  lat?: number;
  lng?: number;
  ride_request_id?: string;
}

export interface EmergencyAlertTrustedResponse {
  sent_count: number;
}

export interface BulkMarkTrustedBody {
  contact_ids: string[];
}

export interface BulkMarkTrustedResponse {
  updated: number;
  contacts: import('./riderContacts').RiderContactRow[];
}
