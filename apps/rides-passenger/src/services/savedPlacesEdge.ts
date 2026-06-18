import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreatePassengerSavedPlaceBody,
  PassengerSavedPlaceRow,
  PassengerSavedPlacesListResponse,
  UpdatePassengerSavedPlaceBody,
} from '@roam/types/passengerSavedPlaces';
import { passengerApiErrorMessage } from '@/lib/passengerApiErrors';

const base = API_ENDPOINTS.rides;

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

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    const code = body.error ?? '';
    message = passengerApiErrorMessage(code, body.message ?? (code || message));
  } catch {
    /* use raw */
  }
  throw new Error(message);
}

export async function savedPlacesList(): Promise<PassengerSavedPlacesListResponse> {
  const res = await fetch(`${base}/v1/saved-places`, { headers: await headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function savedPlaceCreate(
  body: CreatePassengerSavedPlaceBody,
): Promise<{ place: PassengerSavedPlaceRow }> {
  const res = await fetch(`${base}/v1/saved-places`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function savedPlaceUpdate(
  id: string,
  body: UpdatePassengerSavedPlaceBody,
): Promise<{ place: PassengerSavedPlaceRow }> {
  const res = await fetch(`${base}/v1/saved-places/${id}`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function savedPlaceDelete(id: string): Promise<void> {
  const res = await fetch(`${base}/v1/saved-places/${id}`, {
    method: 'DELETE',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
}
