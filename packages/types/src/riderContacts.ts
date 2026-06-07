/** Roam Contacts — passenger address book for delegated booking. */

export type RiderContactRelation =
  | 'father'
  | 'mother'
  | 'sibling'
  | 'spouse'
  | 'friend'
  | 'colleague'
  | 'other';

export type RiderContactSource = 'manual' | 'device_import' | 'roam_user';

export interface RiderContactPlaceRow {
  id: string;
  contact_id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string;
}

export interface RiderContactGroupRow {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RiderContactRow {
  id: string;
  owner_user_id: string;
  display_name: string;
  phone_e164: string;
  relation: RiderContactRelation;
  relation_custom: string | null;
  source: RiderContactSource;
  linked_user_id: string | null;
  bookable: boolean;
  trusted_for_safety: boolean;
  created_at: string;
  updated_at: string;
  places?: RiderContactPlaceRow[];
  groups?: RiderContactGroupRow[];
}

export interface CreateRiderContactBody {
  display_name: string;
  phone_e164: string;
  relation?: RiderContactRelation;
  relation_custom?: string | null;
  source?: RiderContactSource;
  bookable?: boolean;
  trusted_for_safety?: boolean;
  group_ids?: string[];
}

export interface UpdateRiderContactBody {
  display_name?: string;
  phone_e164?: string;
  relation?: RiderContactRelation;
  relation_custom?: string | null;
  bookable?: boolean;
  trusted_for_safety?: boolean;
  group_ids?: string[];
}

export interface CreateRiderContactPlaceBody {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface UpdateRiderContactPlaceBody {
  label?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface CreateRiderContactGroupBody {
  name: string;
}

export interface UpdateRiderContactGroupBody {
  name?: string;
}

export interface RiderContactsListResponse {
  contacts: RiderContactRow[];
}

export interface RiderContactGroupsListResponse {
  groups: RiderContactGroupRow[];
}

export interface BatchImportContactsBody {
  contacts: CreateRiderContactBody[];
}

export interface BatchImportContactsResponse {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  contacts: RiderContactRow[];
}

/** Passenger invite after booker creates a delegated ride. */
export interface PassengerInviteDto {
  token: string;
  url: string;
  expires_at: string;
  ride_request_id: string;
}

export interface ClaimPassengerInviteResponse {
  ride_id: string;
  passenger_user_id: string;
}

/** Roam Tag — reverse booking request. */
export type BookingRequestStatus =
  | 'pending'
  | 'claimed'
  | 'booked'
  | 'consumed'
  | 'expired'
  | 'cancelled';

export interface BookingRequestRow {
  id: string;
  token: string;
  public_code: string;
  requester_user_id: string | null;
  requester_name: string;
  requester_phone: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  dropoff_address: string | null;
  vehicle_option: string | null;
  notes: string | null;
  status: BookingRequestStatus;
  claimed_by_user_id: string | null;
  ride_request_id: string | null;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface BookingRequestRequesterPreview {
  first_name: string;
  custom_tag_name: string | null;
  avatar_url: string | null;
}

/** Public preview — no route coordinates or addresses. */
export interface BookingRequestPreviewRow {
  id: string;
  token: string;
  public_code: string;
  requester_name: string;
  status: BookingRequestStatus;
  expires_at: string;
  vehicle_option: string | null;
  has_trip_route: boolean;
}

export interface BookingRequestPreviewResponse {
  booking_request: BookingRequestPreviewRow;
  requester: BookingRequestRequesterPreview;
}

export interface CreateBookingRequestBody {
  requester_name: string;
  requester_phone: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  dropoff_address?: string;
  vehicle_option?: string;
  notes?: string;
}

export interface CreateBookingRequestResponse {
  booking_request: BookingRequestRow;
  url: string;
  public_code: string;
  /** True when an existing active link was returned instead of creating a new one. */
  reused?: boolean;
}

export interface ActiveBookingRequestResponse {
  booking_request: BookingRequestRow | null;
  url?: string;
  public_code?: string;
}

export interface ClaimBookingRequestResponse {
  booking_request: BookingRequestRow;
  requester: BookingRequestRequesterPreview;
}

export const RIDER_CONTACT_RELATION_LABELS: Record<RiderContactRelation, string> = {
  father: 'Father',
  mother: 'Mother',
  sibling: 'Sibling',
  spouse: 'Spouse',
  friend: 'Friend',
  colleague: 'Colleague',
  other: 'Other',
};
