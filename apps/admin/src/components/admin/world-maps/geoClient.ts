import { API_ENDPOINTS } from '../../../services/apiConfig';

export async function geoFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_ENDPOINTS.catalog}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: { message?: string; error?: string; [key: string]: unknown } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body.message || (typeof body.error === 'string' ? body.error : '') || 'Could not load the map.');
  }
  return body;
}
