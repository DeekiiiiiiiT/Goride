/**
 * Driver Admin → Rides Edge for app permission policy (driver surface).
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabaseDriverAdmin as supabase } from '@roam/auth-client';
import type { AppPermissionPolicyRow } from '@roam/types';
import type { AppPermissionPolicyPatch } from '@roam/admin-core';

const RIDES_BASE = API_ENDPOINTS.rides;

async function adminFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${RIDES_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publicAnonKey,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    return body.message ?? body.error ?? text;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

export async function getDriverAppPermissionPolicy(
  accessToken: string,
): Promise<{ permissions: AppPermissionPolicyRow[] }> {
  const res = await adminFetch(
    accessToken,
    `/admin/app-permissions?surface=${encodeURIComponent('driver')}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateDriverAppPermissionPolicy(
  accessToken: string,
  permissions: AppPermissionPolicyPatch[],
): Promise<{ permissions: AppPermissionPolicyRow[] }> {
  const res = await adminFetch(
    accessToken,
    `/admin/app-permissions?surface=${encodeURIComponent('driver')}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

/** Resolve session token for driver admin (re-export helper). */
export async function getDriverAdminAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
