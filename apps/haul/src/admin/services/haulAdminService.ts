import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';

const ADMIN_BASES = [API_ENDPOINTS.haul, API_ENDPOINTS.rides];

async function adminFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publicAnonKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
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

async function adminGet(accessToken: string, route: string): Promise<Response> {
  let last: Response | null = null;
  for (const base of ADMIN_BASES) {
    const res = await adminFetch(accessToken, `${base}/admin${route}`);
    if (res.ok) return res;
    last = res;
  }
  return last ?? new Response('unavailable', { status: 503 });
}

async function adminPut(accessToken: string, route: string, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (const base of ADMIN_BASES) {
    const res = await adminFetch(accessToken, `${base}/admin${route}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    last = res;
  }
  return last ?? new Response('unavailable', { status: 503 });
}

export async function listHaulageAdminItems(accessToken: string): Promise<{ items: unknown[] }> {
  const res = await adminGet(accessToken, '/haulage/items');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateHaulageVariant(
  accessToken: string,
  itemId: string,
  variantId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await adminPut(
    accessToken,
    `/haulage/items/${encodeURIComponent(itemId)}/variants/${encodeURIComponent(variantId)}`,
    patch,
  );
  if (!res.ok) throw new Error(await parseError(res));
}
