/**
 * Jamaica payment gateway adapter slot — WiPay primary, Amber/bank behind flags.
 */

export type PaymentGatewayProvider = 'wipay' | 'amber';

export interface CheckoutIntentRequest {
  amountJmd: number;
  currency?: string;
  reference: string;
  customerEmail: string;
  returnUrl: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutIntentResult {
  provider: PaymentGatewayProvider;
  paymentRedirectUrl?: string;
  providerTransactionId?: string;
  demoPaid?: boolean;
  error?: string;
}

export interface PaymentGatewayAdapter {
  provider: PaymentGatewayProvider;
  createCheckoutIntent(req: CheckoutIntentRequest): Promise<CheckoutIntentResult>;
}

/** WiPay is production; Amber stub until vendor API is confirmed. */
export function resolveFleetCheckoutProvider(
  preferred?: PaymentGatewayProvider,
): PaymentGatewayProvider {
  const flag = (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_FLEET_PAYMENT_PROVIDER?: string } }).env?.VITE_FLEET_PAYMENT_PROVIDER) ||
    undefined;
  const envProvider = flag?.trim().toLowerCase();
  if (envProvider === 'amber') return 'amber';
  if (preferred === 'amber') return 'amber';
  return 'wipay';
}

export function createAmberAdapterStub(): PaymentGatewayAdapter {
  return {
    provider: 'amber',
    async createCheckoutIntent(): Promise<CheckoutIntentResult> {
      return {
        provider: 'amber',
        error: 'Amber Connect checkout is not enabled in this environment',
      };
    },
  };
}
