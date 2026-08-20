import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { readDeviceSession } from './store-tablet-session';
import { readShift, resolveShiftSurface } from './station-shift-session';

const FETCH_TIMEOUT_MS = 15_000;

export interface MerchantOpsAuthConfig {
  getSupabase: () => SupabaseClient;
  refreshSessionIfNeeded: () => Promise<Session>;
  isKioskContext: () => boolean;
  fetchImpl?: typeof fetch;
}

let authConfig: MerchantOpsAuthConfig | null = null;

export function configureMerchantOpsAuth(config: MerchantOpsAuthConfig) {
  authConfig = config;
}

function requireAuthConfig(): MerchantOpsAuthConfig {
  if (!authConfig) {
    throw new Error('Merchant ops auth not configured — call configureMerchantOpsAuth() first');
  }
  return authConfig;
}

function getFetch(): typeof fetch {
  return authConfig?.fetchImpl ?? fetch;
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await getFetch()(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getAuthHeaders(contentType = 'application/json') {
  const { refreshSessionIfNeeded } = requireAuthConfig();
  const session = await refreshSessionIfNeeded();
  const extra: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  if (contentType) extra['Content-Type'] = contentType;
  return supabaseAnonFunctionHeaders(extra);
}

export async function getStationAuthHeaders(contentType = 'application/json') {
  const { isKioskContext } = requireAuthConfig();
  const device = isKioskContext() ? readDeviceSession() : null;
  if (device?.deviceToken) {
    return supabaseAnonFunctionHeaders({
      'X-Station-Device-Token': device.deviceToken,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    });
  }
  const authHeaders = await getAuthHeaders(contentType);
  return {
    ...supabaseAnonFunctionHeaders(),
    ...authHeaders,
  };
}

async function parseErrorBody(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({} as { error?: string }));
  return body.error || `Request failed: ${res.status}`;
}

export async function deliveryFetch(path: string, init?: RequestInit) {
  const { refreshSessionIfNeeded } = requireAuthConfig();

  const request = async () => {
    const headers = await getAuthHeaders();
    return fetchWithTimeout(`${API_ENDPOINTS.delivery}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers || {}),
      },
    });
  };

  let res = await request();
  if (res.status === 401) {
    await refreshSessionIfNeeded();
    res = await request();
  }

  if (!res.ok) {
    throw new Error(await parseErrorBody(res));
  }
  return res.json();
}

export async function deliveryFetchStation(path: string, init?: RequestInit) {
  const headers = await getStationAuthHeaders();
  const res = await fetchWithTimeout(`${API_ENDPOINTS.delivery}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(await parseErrorBody(res));
  }
  return res.json();
}

export async function deliveryFetchWithShift(
  merchantId: string,
  path: string,
  init?: RequestInit,
  shiftToken?: string | null,
) {
  const headers = await getStationAuthHeaders();
  const token =
    shiftToken ?? readShift(merchantId, resolveShiftSurface())?.token ?? null;
  const merged: Record<string, string> = {
    ...headers,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) merged['X-Staff-Shift-Token'] = token;

  const res = await fetchWithTimeout(`${API_ENDPOINTS.delivery}${path}`, {
    ...init,
    headers: merged,
  });
  if (!res.ok) {
    throw new Error(await parseErrorBody(res));
  }
  return res.json();
}
