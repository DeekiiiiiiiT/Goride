import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import type { CourierRoamTagDto, WorkforceInviteMineDto } from '@roam/types';

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

const BASE = API_ENDPOINTS.admin;

export async function loadCourierRoamTag(): Promise<CourierRoamTagDto | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier-roam-tag/me`, { headers });
  if (!res.ok) return null;
  return (await res.json()) as CourierRoamTagDto;
}

export async function claimCourierRoamTag(customTagName: string): Promise<
  | { ok: true; tag: CourierRoamTagDto }
  | { ok: false; error: string }
> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/courier-roam-tag/me`, {
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
  return { ok: true, tag: data as CourierRoamTagDto };
}

export async function loadMyFleetInvites(): Promise<WorkforceInviteMineDto[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const res = await fetch(`${BASE}/workforce/invites/mine`, { headers });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.invites) ? data.invites : [];
}

export async function acceptFleetInviteById(inviteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/workforce/invites/${inviteId}/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not accept invite' };
  return { ok: true };
}

export async function declineFleetInviteById(inviteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/workforce/invites/${inviteId}/decline`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not decline invite' };
  return { ok: true };
}
