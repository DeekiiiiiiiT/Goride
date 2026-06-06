import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  BatchImportContactsBody,
  BatchImportContactsResponse,
  ClaimPassengerInviteResponse,
  CreateBookingRequestBody,
  CreateBookingRequestResponse,
  CreateRiderContactBody,
  CreateRiderContactGroupBody,
  CreateRiderContactPlaceBody,
  PassengerInviteDto,
  RiderContactGroupsListResponse,
  RiderContactRow,
  RiderContactsListResponse,
  UpdateRiderContactBody,
  UpdateRiderContactGroupBody,
  UpdateRiderContactPlaceBody,
} from '@roam/types/riderContacts';

async function contactsHeaders(): Promise<HeadersInit> {
  const { data: { user } } = await supabase.auth.getUser();
  let token = user ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
  }
  return {
    Authorization: `Bearer ${token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const base = API_ENDPOINTS.rides;

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    /* use raw */
  }
  throw new Error(message);
}

export async function contactsList(opts?: {
  q?: string;
  trusted_for_safety?: boolean;
}): Promise<RiderContactsListResponse> {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.trusted_for_safety) params.set('trusted_for_safety', 'true');
  const qs = params.toString();
  const res = await fetch(`${base}/v1/contacts${qs ? `?${qs}` : ''}`, {
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactsGet(id: string): Promise<{ contact: RiderContactRow }> {
  const res = await fetch(`${base}/v1/contacts/${id}`, { headers: await contactsHeaders() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactsCreate(body: CreateRiderContactBody): Promise<{ contact: RiderContactRow }> {
  const res = await fetch(`${base}/v1/contacts`, {
    method: 'POST',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactsUpdate(
  id: string,
  body: UpdateRiderContactBody,
): Promise<{ contact: RiderContactRow }> {
  const res = await fetch(`${base}/v1/contacts/${id}`, {
    method: 'PATCH',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactsDelete(id: string): Promise<void> {
  const res = await fetch(`${base}/v1/contacts/${id}`, {
    method: 'DELETE',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
}

export async function contactsBatchImport(
  body: BatchImportContactsBody,
): Promise<BatchImportContactsResponse> {
  const res = await fetch(`${base}/v1/contacts/batch-import`, {
    method: 'POST',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactGroupsList(): Promise<RiderContactGroupsListResponse> {
  const res = await fetch(`${base}/v1/contact-groups`, { headers: await contactsHeaders() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactGroupCreate(
  body: CreateRiderContactGroupBody,
): Promise<{ group: RiderContactGroupsListResponse['groups'][number] }> {
  const res = await fetch(`${base}/v1/contact-groups`, {
    method: 'POST',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactGroupUpdate(
  id: string,
  body: UpdateRiderContactGroupBody,
): Promise<{ group: RiderContactGroupsListResponse['groups'][number] }> {
  const res = await fetch(`${base}/v1/contact-groups/${id}`, {
    method: 'PATCH',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactGroupDelete(id: string): Promise<void> {
  const res = await fetch(`${base}/v1/contact-groups/${id}`, {
    method: 'DELETE',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
}

export async function contactPlaceCreate(
  contactId: string,
  body: CreateRiderContactPlaceBody,
): Promise<{ place: RiderContactRow['places'] extends (infer P)[] | undefined ? P : never }> {
  const res = await fetch(`${base}/v1/contacts/${contactId}/places`, {
    method: 'POST',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactPlaceUpdate(
  contactId: string,
  placeId: string,
  body: UpdateRiderContactPlaceBody,
): Promise<{ place: NonNullable<RiderContactRow['places']>[number] }> {
  const res = await fetch(`${base}/v1/contacts/${contactId}/places/${placeId}`, {
    method: 'PATCH',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactPlaceDelete(contactId: string, placeId: string): Promise<void> {
  const res = await fetch(`${base}/v1/contacts/${contactId}/places/${placeId}`, {
    method: 'DELETE',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
}

export async function createPassengerInvite(rideId: string): Promise<{ invite: PassengerInviteDto }> {
  const res = await fetch(`${base}/v1/requests/${rideId}/passenger-invite`, {
    method: 'POST',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getPassengerInvitePreview(token: string): Promise<{
  invite: {
    token: string;
    expires_at: string;
    guest_name: string | null;
    pickup_address: string | null;
    dropoff_address: string | null;
    phone_masked: string;
  };
}> {
  const res = await fetch(`${base}/v1/passenger-invites/${token}`, {
    headers: { apikey: publicAnonKey },
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function claimPassengerInvite(token: string): Promise<ClaimPassengerInviteResponse> {
  const res = await fetch(`${base}/v1/passenger-invites/${token}/claim`, {
    method: 'POST',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function createBookingRequest(
  body: CreateBookingRequestBody,
): Promise<CreateBookingRequestResponse> {
  const res = await fetch(`${base}/v1/booking-requests`, {
    method: 'POST',
    headers: await contactsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getBookingRequestPreview(token: string): Promise<{ booking_request: import('@roam/types/riderContacts').BookingRequestRow }> {
  const res = await fetch(`${base}/v1/booking-requests/${token}`, {
    headers: { apikey: publicAnonKey },
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function claimBookingRequest(token: string): Promise<{ booking_request: import('@roam/types/riderContacts').BookingRequestRow }> {
  const res = await fetch(`${base}/v1/booking-requests/${token}/claim`, {
    method: 'POST',
    headers: await contactsHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}
