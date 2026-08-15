import { useEffect } from 'react';
import { toast } from '@/lib/toast';

type Props = {
  returnTo?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

/**
 * Legacy Add Card route — vaulting happens via WiPay/PayPal hosted checkout.
 * Redirects so this is never a dead-end screen.
 */
export default function AddCardPage({ returnTo = 'payment-methods', onNavigate }: Props) {
  useEffect(() => {
    toast.info('Cards are saved during checkout with WiPay or PayPal.');
    onNavigate(returnTo || 'payment-methods');
  }, [onNavigate, returnTo]);

  return (
    <div className="bg-background min-h-dvh flex flex-col items-center justify-center px-4">
      <p className="text-body-md text-on-surface-variant text-center">
        Redirecting to payment methods…
      </p>
    </div>
  );
}
