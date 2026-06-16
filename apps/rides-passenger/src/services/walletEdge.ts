import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type { PayArrearsResultDto, WalletBalanceResponse } from '@roam/types/rides';

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
    if (body.error === 'feature_disabled') {
      message = 'Paying your balance online is not available yet.';
    } else if (body.error === 'no_arrears') {
      message = 'You have no outstanding balance to pay.';
    } else if (body.error === 'invalid_payment_method') {
      message = 'This payment method cannot be used to settle your balance.';
    } else if (body.error === 'payment_method_id_required') {
      message = 'Select a payment method.';
    } else if (body.error === 'idempotency_key_required') {
      message = 'Could not process payment. Please try again.';
    } else {
      message = body.message ?? body.error ?? message;
    }
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

export async function walletPayArrears(
  paymentMethodId: string,
  idempotencyKey: string,
  currency = 'JMD',
): Promise<PayArrearsResultDto> {
  const res = await fetch(`${base}/v1/wallet/pay-arrears`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      payment_method_id: paymentMethodId,
      idempotency_key: idempotencyKey,
      currency,
    }),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}
