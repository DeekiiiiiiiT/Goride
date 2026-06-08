export interface RoamPassengerTagDto {
  /** User-visible handle without @ prefix; null until set. */
  custom_tag_name: string | null;
  has_custom_tag: boolean;
}

export interface UpdateRoamPassengerTagBody {
  custom_tag_name: string;
}

export interface RoamPassengerTagLookupDto {
  custom_tag_name: string;
  /** Display name from profile when available. */
  display_name: string | null;
}

/** Returned when an authenticated passenger looks up a tag to book for someone. */
export interface RoamPassengerTagBookingLookupDto extends RoamPassengerTagLookupDto {
  user_id: string;
  phone_e164: string | null;
  avatar_url: string | null;
}
