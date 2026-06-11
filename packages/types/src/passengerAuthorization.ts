export type PassengerAuthorizationStatus =
  | 'pending'
  | 'claimed'
  | 'consumed'
  | 'expired'
  | 'cancelled';

export interface PassengerAuthorizationDto {
  id: string;
  token: string;
  url: string;
  status: PassengerAuthorizationStatus;
  recipient_name: string;
  phone_e164: string;
  passenger_user_id?: string | null;
  expires_at: string;
  claimed_at?: string | null;
}

export interface PassengerLookupResult {
  found: boolean;
  profile?: {
    user_id: string;
    display_name: string | null;
    custom_tag_name: string | null;
    avatar_url: string | null;
    phone_masked: string;
  };
}

export interface CreatePassengerAuthorizationBody {
  recipient_name: string;
  phone_e164: string;
  draft_trip_json?: Record<string, unknown> | null;
}

export interface ClaimPassengerAuthorizationResponse {
  authorization_id: string;
  passenger_user_id: string;
}

export interface PassengerAuthorizationListResponse {
  authorizations: PassengerAuthorizationDto[];
}

export interface UpdatePassengerAuthorizationPhoneBody {
  phone_e164: string;
}

export interface UpdatePassengerAuthorizationPhoneResponse {
  authorization: PassengerAuthorizationDto;
  cancelled_authorization_id: string;
}
