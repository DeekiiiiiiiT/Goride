import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  CreateTripIntentBody,
  FulfillTripIntentResponse,
  TripIntentBookerViewDto,
  TripIntentLookupResponse,
  TripIntentRow,
  UpdateTripIntentBody,
} from '@roam/types/riderContacts';

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
  if (res.status === 404) {
    if (message === 'trip_intent_v2_disabled') {
      throw new Error('Book for me is not enabled on the server yet. Set TRIP_INTENT_V2=1 on the rides function.');
    }
    if (message === 'not_editable' || message === 'not_found') {
      throw new Error('That trip request is no longer available. Withdraw any old trip and try again.');
    }
    if (/not found/i.test(message)) {
      throw new Error(
        'Book for me API is not available yet. Deploy the database migration and rides edge function, then try again.',
      );
    }
  }
  if (res.status === 409 && message === 'not_draft') {
    throw new Error('You already have a live trip on your tag. Withdraw it first, then publish again.');
  }
  if (message === 'insert_failed') {
    try {
      const body = JSON.parse(text) as { hint?: string; message?: string };
      throw new Error(
        body.hint ??
          body.message ??
          'Could not save your trip request. Run the database migration (supabase db push), then try again.',
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes('migration')) throw e;
      throw new Error(
        'Could not save your trip request. Run the database migration (supabase db push), then try again.',
      );
    }
  }
  throw new Error(message);
}

export async function tripIntentCreate(body: CreateTripIntentBody): Promise<{ trip_intent: TripIntentRow }> {
  const res = await fetch(`${base}/v1/trip-intents`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentUpdate(
  id: string,
  body: UpdateTripIntentBody,
): Promise<{ trip_intent: TripIntentRow }> {
  const res = await fetch(`${base}/v1/trip-intents/${id}`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentQuote(id: string): Promise<{
  quote_token: string;
  fare_estimate_minor: string;
  currency: string;
}> {
  const res = await fetch(`${base}/v1/trip-intents/${id}/quote`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentPublish(id: string): Promise<{ trip_intent: TripIntentRow }> {
  const res = await fetch(`${base}/v1/trip-intents/${id}/publish`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentGetMyActive(): Promise<{ trip_intent: TripIntentRow | null }> {
  const res = await fetch(`${base}/v1/trip-intents/me/active`, { headers: await headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentWithdraw(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base}/v1/trip-intents/${id}`, {
    method: 'DELETE',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function roamTagLookupIntent(name: string): Promise<TripIntentLookupResponse> {
  const res = await fetch(`${base}/v1/roam-tag/${encodeURIComponent(name)}/intent`, {
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function contactLookupIntent(contactId: string): Promise<{ intent: TripIntentBookerViewDto | null }> {
  const res = await fetch(`${base}/v1/contacts/${contactId}/intent`, { headers: await headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentClaim(id: string): Promise<{ trip_intent: TripIntentBookerViewDto }> {
  const res = await fetch(`${base}/v1/trip-intents/${id}/claim`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function tripIntentFulfill(id: string): Promise<FulfillTripIntentResponse> {
  const res = await fetch(`${base}/v1/trip-intents/${id}/fulfill`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ payment_method: 'card' }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function walletGetTransactions(): Promise<import('@roam/types/rides').WalletTransactionsResponse> {
  const res = await fetch(`${base}/v1/wallet/transactions`, { headers: await headers() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export function formatFareMinor(minor: string | null | undefined, currency = 'JMD'): string {
  if (!minor) return '—';
  const n = Number(minor);
  if (Number.isNaN(n)) return minor;
  return new Intl.NumberFormat('en-JM', { style: 'currency', currency }).format(n / 100);
}
