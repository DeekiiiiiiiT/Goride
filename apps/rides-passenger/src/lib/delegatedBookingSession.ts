const TAG_DRAFT_KEY = 'roam:booking-request-draft';

export type BookingRequestDraft = {
  bookingRequestId: string;
  token: string;
  requesterName: string;
  /** Full E.164 from claim response (not the masked preview phone). */
  requesterPhone: string;
  pickup?: { lat: number; lng: number; address: string };
  dropoff?: { lat: number; lng: number; address: string };
  vehicleOption?: string;
};

export function persistBookingRequestDraft(draft: BookingRequestDraft): void {
  try {
    sessionStorage.setItem(TAG_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readBookingRequestDraft(): BookingRequestDraft | null {
  try {
    const raw = sessionStorage.getItem(TAG_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BookingRequestDraft;
  } catch {
    return null;
  }
}

export function clearBookingRequestDraft(): void {
  try {
    sessionStorage.removeItem(TAG_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const INVITE_RETURN_KEY = 'roam:passenger-invite-token';

export function persistInviteReturnToken(token: string): void {
  try {
    sessionStorage.setItem(INVITE_RETURN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function readInviteReturnToken(): string | null {
  try {
    return sessionStorage.getItem(INVITE_RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearInviteReturnToken(): void {
  try {
    sessionStorage.removeItem(INVITE_RETURN_KEY);
  } catch {
    /* ignore */
  }
}
