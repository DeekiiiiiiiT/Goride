import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { PassengerProfileDto, UpdateSafetySharingBody } from '@roam/types/passengerProfile';
import type {
  BulkMarkTrustedBody,
  BulkMarkTrustedResponse,
  EmergencyAlertTrustedBody,
  EmergencyAlertTrustedResponse,
  ShareTripBody,
  ShareTripResponse,
  TestShareBody,
  TestShareResponse,
  TripSharePublicDto,
} from '@roam/types/tripShare';

async function headers(): Promise<HeadersInit> {
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

export async function updateSafetySharing(
  body: UpdateSafetySharingBody,
): Promise<{ profile: PassengerProfileDto }> {
  const res = await fetch(`${base}/v1/profile/me/safety-sharing`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function bulkMarkTrusted(
  body: BulkMarkTrustedBody,
): Promise<BulkMarkTrustedResponse> {
  const res = await fetch(`${base}/v1/contacts/trusted/bulk`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function testShareTrustedContacts(
  body: TestShareBody,
): Promise<TestShareResponse> {
  const res = await fetch(`${base}/v1/trusted-contacts/test-share`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function shareTripWithContacts(
  rideId: string,
  body: ShareTripBody,
): Promise<ShareTripResponse> {
  const res = await fetch(`${base}/v1/requests/${rideId}/share-trip`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function emergencyAlertTrusted(
  body: EmergencyAlertTrustedBody,
): Promise<EmergencyAlertTrustedResponse> {
  const res = await fetch(`${base}/v1/emergency/alert-trusted`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getTripSharePublic(token: string): Promise<{ share: TripSharePublicDto }> {
  const res = await fetch(`${base}/v1/trip-shares/${token}`, {
    headers: { apikey: publicAnonKey },
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export const MAX_TRUSTED_CONTACTS = 5;
