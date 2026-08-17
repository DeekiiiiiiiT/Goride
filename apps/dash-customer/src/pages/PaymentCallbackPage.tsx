import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface PaymentCallbackPageProps {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
  provider: 'wipay' | 'paypal';
}

export default function PaymentCallbackPage({ onNavigate, session, provider }: PaymentCallbackPageProps) {
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (provider === 'paypal') {
      const paypalOrderId = params.get('token');
      const orderIdParam = params.get('orderId');
      const cancelled = params.get('cancelled');

      if (cancelled === 'true') {
        setStatus('failed');
        return;
      }

      if (paypalOrderId && orderIdParam && session) {
        void capturePayPalPayment(paypalOrderId, orderIdParam);
      } else if (!session) {
        return;
      } else {
        setStatus('failed');
      }
      return;
    }

    const wipayStatus = params.get('status') || params.get('payment_status') || '';
    const orderIdParam = params.get('order_id') || params.get('orderId') || '';
    const transactionId = params.get('transaction_id') || params.get('transactionId') || '';

    if (!session) {
      setStatus('failed');
      return;
    }

    if (!orderIdParam && !transactionId) {
      setStatus('failed');
      return;
    }

    void completeWipayPayment(orderIdParam, transactionId, wipayStatus);
  }, [provider, session]);

  const completeWipayPayment = async (
    orderIdParam: string,
    transactionId: string,
    wipayStatus: string,
  ) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.payments}/wipay/complete`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
        }),
        body: JSON.stringify({
          orderId: orderIdParam,
          transactionId: transactionId || undefined,
          status: wipayStatus || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { orderId?: string };
      if (res.ok) {
        setOrderId(data.orderId || orderIdParam);
        setStatus('success');
        return;
      }
      setStatus('failed');
    } catch {
      setStatus('failed');
    }
  };

  const capturePayPalPayment = async (paypalOrderId: string, orderIdParam: string) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.payments}/paypal/capture`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
        }),
        body: JSON.stringify({
          paypalOrderId,
          orderId: orderIdParam,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setOrderId(orderIdParam);
      } else {
        setStatus('failed');
      }
    } catch {
      setStatus('failed');
    }
  };

  if (status === 'processing') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mb-4" />
        <h1 className="text-xl font-semibold text-gray-900">Processing your payment...</h1>
        <p className="text-gray-500 mt-2">Please wait while we confirm your payment</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <CheckCircle className="w-20 h-20 text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-8">Your order has been confirmed</p>
        <button
          type="button"
          onClick={() => onNavigate(orderId ? 'tracking' : 'orders', orderId ? { orderId } : undefined)}
          className="px-8 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
        >
          Track Your Order
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <XCircle className="w-20 h-20 text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
      <p className="text-gray-500 mb-8">Something went wrong with your payment</p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => onNavigate('cart')}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}
