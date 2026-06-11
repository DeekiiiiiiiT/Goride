export type PickupLocationRequestStatus =
  | 'pending'
  | 'shared'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'consumed';

export type PickupLocationRiderSource = 'roam_tag' | 'roam_contact' | 'phone_contact';

export type PickupLocationDeliveryChannel = 'sms' | 'in_app';

export interface PickupLocationRequestDto {
  id: string;
  token: string;
  url: string;
  status: PickupLocationRequestStatus;
  rider_name: string;
  rider_phone_e164: string;
  rider_user_id?: string | null;
  rider_source: PickupLocationRiderSource;
  rider_contact_id?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_address?: string | null;
  accuracy_meters?: number | null;
  shared_at?: string | null;
  expires_at: string;
  consumed_at?: string | null;
}

export interface CreatePickupLocationRequestBody {
  rider_name: string;
  rider_phone_e164: string;
  rider_source: PickupLocationRiderSource;
  rider_user_id?: string | null;
  rider_contact_id?: string | null;
}

export interface CreatePickupLocationRequestResponse {
  request: PickupLocationRequestDto;
  delivery_channel: PickupLocationDeliveryChannel;
  sms_attempted: boolean;
  sms_sent: boolean;
}

/** Rider-facing pending request (no booker/rider phone PII). */
export interface IncomingPickupLocationRequestDto {
  id: string;
  token: string;
  booker_name: string | null;
  status: PickupLocationRequestStatus;
  expires_at: string;
  created_at: string;
}

export interface SharePickupLocationBody {
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  accuracy_meters?: number | null;
}

export interface PickupLocationRequestPreviewDto {
  token: string;
  rider_name: string;
  booker_name: string | null;
  status: PickupLocationRequestStatus;
  expires_at: string;
  phone_masked?: string;
}
