export type GuestRecipientDraft = {
  fullName: string;
  /** Local number digits (no country code). */
  phone: string;
  countryCode: string;
  contactId?: string;
  selectedPlaceId?: string;
  /** Roam account passenger when booked via @tag. */
  passengerUserId?: string;
  roamTagName?: string;
  /** Pre-set pickup from contact saved place (optional override). */
  pickupPreset?: {
    label: string;
    address: string;
    lat: number;
    lng: number;
  };
};

export type BookForSomeoneTripDraft = {
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
};

const STORAGE_KEY = 'roam:guest-recipient-draft';
const TRIP_STORAGE_KEY = 'roam:book-for-someone-trip';

export function persistGuestRecipientDraft(draft: GuestRecipientDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readGuestRecipientDraft(): GuestRecipientDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestRecipientDraft;
    if (!parsed?.fullName?.trim()) return null;
    if (!parsed.phone?.trim() && !parsed.passengerUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGuestRecipientDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function persistBookForSomeoneTrip(draft: BookForSomeoneTripDraft): void {
  try {
    sessionStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readBookForSomeoneTrip(): BookForSomeoneTripDraft | null {
  try {
    const raw = sessionStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookForSomeoneTripDraft;
    if (
      !parsed?.pickupAddress?.trim() ||
      !parsed?.dropoffAddress?.trim() ||
      typeof parsed.pickupLat !== 'number' ||
      typeof parsed.pickupLng !== 'number' ||
      typeof parsed.dropoffLat !== 'number' ||
      typeof parsed.dropoffLng !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearBookForSomeoneTrip(): void {
  try {
    sessionStorage.removeItem(TRIP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearDelegatedBookingDrafts(): void {
  clearGuestRecipientDraft();
  clearBookForSomeoneTrip();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Format local US/JM number as (555) 000-0000 while typing. */
export function formatGuestPhoneDisplay(value: string): string {
  const digits = digitsOnly(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function buildGuestPhoneE164(countryCode: string, localDigits: string): string {
  const code = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  return `${code}${digitsOnly(localDigits)}`;
}

export function isValidGuestPhone(localDigits: string): boolean {
  const digits = digitsOnly(localDigits);
  return digits.length >= 10 && digits.length <= 11;
}

export function guestRecipientSummary(draft: GuestRecipientDraft): string {
  return `${draft.fullName.trim()} · ${buildGuestPhoneE164(draft.countryCode, draft.phone)}`;
}
