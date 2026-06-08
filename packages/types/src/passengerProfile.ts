export type SafetySharingPreference = 'all' | 'night' | 'manual';

export interface SafetySharingPreferencesDto {
  default_sharing_preference: SafetySharingPreference;
  share_all_trips: boolean;
  night_trips_only: boolean;
}

export interface PassengerProfileDto {
  display_name: string | null;
  phone_e164: string | null;
  phone_on_file: boolean;
  phone_verified: boolean;
  safety_sharing?: SafetySharingPreferencesDto;
}

export interface UpdatePassengerProfileBody {
  phone: string;
}

export interface UpdateSafetySharingBody {
  default_sharing_preference: SafetySharingPreference;
}