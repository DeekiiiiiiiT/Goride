import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreatePickupLocationRequestBody,
  PickupLocationRequestDto,
  PickupLocationRequestPreviewDto,
  SharePickupLocationBody,
} from '@roam/types/pickupLocationRequest';

const base = API_ENDPOINTS.rides;

async function headers(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    /* raw */
  }
  throw new Error(message);
}

export async function createPickupLocationRequest(
  body: CreatePickupLocationRequestBody,
): Promise<{ request: PickupLocationRequestDto; sms_sent: boolean }> {
  const res = await fetch(`${base}/v1/pickup-location-requests`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getPickupLocationRequest(
  id: string,
): Promise<{ request: PickupLocationRequestDto }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/${id}`, {
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function cancelPickupLocationRequest(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/${id}`, {
    method: 'DELETE',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function consumePickupLocationRequest(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/${id}/consume`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getPickupLocationRequestPreview(
  token: string,
): Promise<{ preview: PickupLocationRequestPreviewDto & { phone_masked?: string } }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/token/${encodeURIComponent(token)}`, {
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function sharePickupLocation(
  token: string,
  body: SharePickupLocationBody,
): Promise<{ request: PickupLocationRequestDto }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/${encodeURIComponent(token)}/share`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function declinePickupLocation(token: string): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(`${base}/v1/pickup-location-requests/${encodeURIComponent(token)}/decline`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}
