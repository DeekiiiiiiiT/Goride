import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';

export function isResumePaymentEligible(
  paymentStatus: string | undefined,
  paymentMethod: string | undefined,
): boolean {
  return (
    !!paymentStatus &&
    paymentStatus !== 'paid' &&
    !!paymentMethod &&
    ['wipay', 'paypal'].includes(paymentMethod)
  );
}

export async function resumeOrderPayment(
  orderId: string,
  provider: string,
  accessToken: string,
): Promise<void> {
  const paymentRes = await fetch(`${API_ENDPOINTS.payments}/intents`, {
    method: 'POST',
    headers: supabaseAnonFunctionHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    }),
    body: JSON.stringify({
      orderId,
      provider,
      returnOrigin: window.location.origin,
    }),
  });

  if (!paymentRes.ok) {
    const paymentError = await paymentRes.json().catch(() => ({}));
    throw new Error(
      (paymentError as { error?: string }).error || 'Failed to resume payment',
    );
  }

  const { clientSecret } = await paymentRes.json();
  window.location.href = clientSecret;
}
