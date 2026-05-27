import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '../utils/supabase/client';
import type { AppPermissionPolicyRow } from '@roam/types';

async function headers(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
  };
}

export async function fetchAppPermissionPolicy(
  surface: 'rider' | 'driver',
): Promise<AppPermissionPolicyRow[]> {
  const res = await fetch(
    `${API_ENDPOINTS.rides}/v1/app-permission-policy?surface=${encodeURIComponent(surface)}`,
    { headers: await headers() },
  );
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as { permissions: AppPermissionPolicyRow[] };
  return body.permissions ?? [];
}
