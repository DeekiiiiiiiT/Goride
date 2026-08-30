import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';

const ALLOWED_PAY_HOST_SUFFIXES = [
  'wipayfinancial.com',
  'roamrush.app',
  'localhost',
];

export function isResumePaymentEligible(
  paymentStatus: string | undefined,
  paymentMethod: string | undefined,
): boolean {
  return (
    !!paymentStatus &&
    paymentStatus !== 'paid' &&
    !!paymentMethod &&
    paymentMethod === 'wipay'
  );
}

export function isAllowedPaymentRedirectUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_PAY_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export async function resumeOrderPayment(
  orderId: string,
  provider: string,
  accessToken: string,
): Promise<void> {
  if (provider !== 'wipay') {
    throw new Error('Unsupported payment provider');
  }

  const paymentRes = await fetch(`${API_ENDPOINTS.payments}/intents`, {
    method: 'POST',
    headers: supabaseAnonFunctionHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    }),
    body: JSON.stringify({
      orderId,
      provider: 'wipay',
      returnOrigin: window.location.origin,
    }),
  });

  if (!paymentRes.ok) {
    const paymentError = await paymentRes.json().catch(() => ({}));
    throw new Error(
      (paymentError as { error?: string }).error || 'Failed to resume payment',
    );
  }

  const data = (await paymentRes.json()) as {
    paymentRedirectUrl?: string;
    clientSecret?: string;
    demoPaid?: boolean;
    orderId?: string;
  };
  if (data.demoPaid) {
    const paidOrderId = data.orderId || orderId;
    window.location.assign(
      `${window.location.origin}/?orderPaid=${encodeURIComponent(paidOrderId)}`,
    );
    return;
  }
  // paymentRedirectUrl is the hosted checkout URL (legacy field was misnamed clientSecret)
  const redirectUrl = data.paymentRedirectUrl ?? data.clientSecret;
  if (!isAllowedPaymentRedirectUrl(redirectUrl)) {
    throw new Error('Invalid payment redirect URL');
  }
  window.location.href = redirectUrl;
}
