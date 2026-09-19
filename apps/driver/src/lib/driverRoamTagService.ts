import { publicAnonKey } from '../utils/supabase/info';
import { supabase } from '../utils/supabase/client';
import { API_ENDPOINTS } from '../services/apiConfig';
import type { DriverRoamTagDto, WorkforceInviteMineDto } from '@roam/types';

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
  };
}

const BASE = API_ENDPOINTS.fleetCore;

export async function loadDriverRoamTag(): Promise<DriverRoamTagDto | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/driver-roam-tag/me`, { headers });
  if (!res.ok) return null;
  return (await res.json()) as DriverRoamTagDto;
}

export async function claimDriverRoamTag(customTagName: string): Promise<
  | { ok: true; tag: DriverRoamTagDto }
  | { ok: false; error: string }
> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/driver-roam-tag/me`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ custom_tag_name: customTagName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof data.error === 'string' ? data.error : 'save_failed';
    const messages: Record<string, string> = {
      tag_length: 'Pick something between 3 and 24 characters.',
      tag_format: 'Use letters, numbers, and underscores only — no spaces.',
      tag_reserved: 'That name isn’t available. Try a different @tag.',
      tag_taken: 'That @tag is already taken. Try another one.',
      tag_locked: 'Your Roam Tag is set and can’t be changed.',
    };
    return {
      ok: false,
      error: messages[code] || data.message || 'Try a different Roam Tag and save again.',
    };
  }
  return { ok: true, tag: data as DriverRoamTagDto };
}

export async function loadMyFleetInvites(): Promise<WorkforceInviteMineDto[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${BASE}/workforce/invites/mine`, { headers });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const invites = Array.isArray(data.invites) ? (data.invites as WorkforceInviteMineDto[]) : [];
  return invites.filter((i) => i.service_line === 'rideshare');
}

export async function acceptFleetInviteById(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/workforce/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not accept invite' };
  return { ok: true };
}

export async function declineFleetInviteById(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/workforce/invites/${encodeURIComponent(inviteId)}/decline`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not decline invite' };
  return { ok: true };
}
