import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabaseDashAdmin as supabase } from '@roam/auth-client';

const DELIVERY_ADMIN_BASE = `${API_ENDPOINTS.delivery}/admin`;

export function dashAdminHeaders(accessToken: string, contentType?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
  if (contentType) h['Content-Type'] = contentType;
  return h;
}

export async function parseDashAdminError(res: Response): Promise<string> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    return 'Server returned HTML instead of JSON. Check delivery Edge function deployment.';
  }
  try {
    const body = trimmed ? (JSON.parse(trimmed) as { error?: string; message?: string }) : {};
    if (body.message) return body.message;
    if (body.error) return `${body.error} (HTTP ${res.status})`;
    return trimmed || `HTTP ${res.status}`;
  } catch {
    return trimmed ? `${trimmed.slice(0, 200)} (HTTP ${res.status})` : `HTTP ${res.status}`;
  }
}

export async function parseDashAdminJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error('Server returned HTML instead of JSON. Check delivery Edge function deployment.');
  }
  if (!trimmed) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {} as T;
  }
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON response from server');
  }
  if (!res.ok) {
    const err = body as { error?: string; message?: string };
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return body as T;
}

async function resolveAccessToken(accessToken: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const active = session?.access_token ?? accessToken;
  const expiresAt = session?.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (session && expiresAt - now < 90) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  }
  return active;
}

/** Fetch delivery edge `/admin/*` with session refresh on 401. */
export async function dashAdminFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${DELIVERY_ADMIN_BASE}${normalizedPath.replace(/^\/admin/, '')}`;
  const hasBody = init?.body != null;
  let token = await resolveAccessToken(accessToken);

  const buildHeaders = (t: string): HeadersInit => ({
    ...dashAdminHeaders(t, hasBody ? 'application/json' : undefined),
    ...(init?.headers as Record<string, string> | undefined),
  });

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      token = data.session.access_token;
      res = await fetch(url, { ...init, headers: buildHeaders(token) });
    }
  }
  return parseDashAdminJson<T>(res);
}

/** Raw fetch for play-store modules that need the Response object. */
export async function dashAdminFetchRaw(
  accessToken: string,
  path: string,
  init?: Omit<RequestInit, 'headers'>,
): Promise<Response> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = path.startsWith('http') ? path : `${DELIVERY_ADMIN_BASE}${normalizedPath.replace(/^\/admin/, '')}`;
  let token = await resolveAccessToken(accessToken);
  const headers = (t: string): HeadersInit => ({
    Authorization: `Bearer ${t}`,
    apikey: publicAnonKey,
    ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
  });
  let res = await fetch(url, { ...init, headers: headers(token) });
  if (res.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      token = data.session.access_token;
      res = await fetch(url, { ...init, headers: headers(token) });
    }
  }
  return res;
}
