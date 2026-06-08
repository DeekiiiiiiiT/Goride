import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { PassengerProfileDto, UpdatePassengerProfileBody } from '@roam/types/passengerProfile';

async function profileHeaders(): Promise<HeadersInit> {
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
    message = body.error ?? body.message ?? message;
  } catch {
    /* use raw */
  }
  throw new Error(message);
}

export async function getMyPassengerProfile(): Promise<{ profile: PassengerProfileDto }> {
  const res = await fetch(`${base}/v1/profile/me`, { headers: await profileHeaders() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function ensurePassengerProfile(): Promise<{ profile: PassengerProfileDto }> {
  const res = await fetch(`${base}/v1/profile/ensure`, {
    method: 'POST',
    headers: await profileHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function updateMyPassengerProfile(
  body: UpdatePassengerProfileBody,
): Promise<{ profile: PassengerProfileDto }> {
  const res = await fetch(`${base}/v1/profile/me`, {
    method: 'PATCH',
    headers: await profileHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export function needsPassengerPhoneOnboarding(profile: PassengerProfileDto | null | undefined): boolean {
  return !profile?.phone_on_file;
}
