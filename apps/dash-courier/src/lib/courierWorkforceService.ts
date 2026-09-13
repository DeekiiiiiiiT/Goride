import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import type { CourierWorkforceMeDto } from '@roam/types';

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

export async function loadWorkforceMe(): Promise<CourierWorkforceMeDto | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(`${BASE}/courier/workforce/me`, { headers });
  if (!res.ok) return null;
  return (await res.json()) as CourierWorkforceMeDto;
}

export async function leaveFleet(): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Not signed in' };
  const res = await fetch(`${BASE}/courier/workforce/leave`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not leave fleet' };
  return { ok: true };
}
