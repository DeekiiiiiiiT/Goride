import { API_ENDPOINTS } from './apiConfig';
import { withProductLineHeaders } from '../config/productLine';
import { supabaseAnonFunctionHeaders } from '@roam/api-client';

async function authHeaders(sessionToken: string): Promise<HeadersInit> {
  return withProductLineHeaders(
    supabaseAnonFunctionHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    }),
  );
}

export async function fetchFleetOwnerStatus(accessToken: string): Promise<{
  provisioned: boolean;
  organizationId: string | null;
  canDrive: boolean;
}> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-owner/status`, {
    headers: await authHeaders(accessToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { provisioned: false, organizationId: null, canDrive: false };
  }
  return {
    provisioned: Boolean(data.provisioned),
    organizationId: data.organizationId ?? null,
    canDrive: Boolean(data.canDrive),
  };
}

export async function provisionFleetOwnerAccount(
  accessToken: string,
  opts: { name?: string; alsoDrive?: boolean } = {},
): Promise<{ success: boolean; organizationId?: string; error?: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-owner/provision`, {
    method: 'POST',
    headers: await authHeaders(accessToken),
    body: JSON.stringify({
      name: opts.name,
      alsoDrive: opts.alsoDrive !== false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data?.error || `Request failed (${res.status})` };
  }
  return { success: true, organizationId: data.organizationId };
}

export async function enableFleetOwnerDriver(accessToken: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_ENDPOINTS.admin}/fleet-owner/enable-driver`, {
    method: 'POST',
    headers: await authHeaders(accessToken),
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data?.error || `Request failed (${res.status})` };
  }
  return { success: true };
}
