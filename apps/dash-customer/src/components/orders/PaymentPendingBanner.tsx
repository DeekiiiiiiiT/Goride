import { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { isResumePaymentEligible, resumeOrderPayment } from '@/lib/resumePayment';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type Props = {
  orderId: string;
  paymentStatus?: string;
  paymentMethod?: string;
  onNavigate: (page: string) => void;
  className?: string;
};

export function PaymentPendingBanner({
  orderId,
  paymentStatus,
  paymentMethod,
  onNavigate,
  className = '',
}: Props) {
  const [pending, setPending] = useState(false);

  const handleResume = useCallback(async () => {
    const provider = paymentMethod;
    if (!provider || !isResumePaymentEligible(paymentStatus, provider)) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast.error('Please sign in to complete payment');
      onNavigate('login');
      return;
    }

    try {
      setPending(true);
      await resumeOrderPayment(orderId, provider, accessToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to resume payment';
      toast.error(message);
    } finally {
      setPending(false);
    }
  }, [orderId, paymentMethod, paymentStatus, onNavigate]);

  if (!isResumePaymentEligible(paymentStatus, paymentMethod)) {
    return null;
  }

  return (
    <div className={className}>
      <p className="text-label-md font-semibold text-primary flex items-center gap-1 mb-2">
        <MaterialIcon name="schedule" className="text-[14px]" />
        Payment pending
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void handleResume()}
        className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg text-label-md disabled:opacity-50"
      >
        {pending ? 'Opening checkout…' : 'Complete payment'}
      </button>
    </div>
  );
}
