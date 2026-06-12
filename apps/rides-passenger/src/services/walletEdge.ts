import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { WalletBalanceResponse } from '@roam/types/rides';

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
    /* use raw */
  }
  throw new Error(message);
}

export async function walletGetBalance(currency = 'JMD'): Promise<WalletBalanceResponse> {
  const res = await fetch(`${base}/v1/wallet?currency=${encodeURIComponent(currency)}`, {
    headers: await headers(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}
