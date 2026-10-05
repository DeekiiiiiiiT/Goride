import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface PaymentCallbackPageProps {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
  provider: 'wipay';
}

const POLL_ATTEMPTS = 5;
const POLL_MS = 1000;

export default function PaymentCallbackPage({ onNavigate, session, provider }: PaymentCallbackPageProps) {
  const [status, setStatus] = useState<'processing' | 'success' | 'failed' | 'pending_confirmation'>('processing');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isRushPass, setIsRushPass] = useState(false);
  const [isWalletDebt, setIsWalletDebt] = useState(false);

  useEffect(() => {
    if (provider !== 'wipay') {
      setStatus('failed');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get('order_id') || params.get('orderId') || '';
    const transactionId = params.get('transaction_id') || params.get('transactionId') || '';
    const purpose = params.get('purpose') || '';
    const rushPass = purpose === 'rush_pass';
    const walletDebt = purpose === 'wallet_debt';
    setIsRushPass(rushPass);
    setIsWalletDebt(walletDebt);

    if (!session) {
      setStatus('failed');
      return;
    }

    if (rushPass) {
      const intentId = params.get('intent_id') || params.get('intentId') ||
        params.get('order_id') || params.get('orderId') || '';
      void (async () => {
        setStatus('pending_confirmation');
        try {
          if (!intentId) {
            setStatus('failed');
            return;
          }
          for (let i = 0; i < POLL_ATTEMPTS; i++) {
            const res = await fetch(`${API_ENDPOINTS.delivery}/customer/rush-pass/confirm`, {
              method: 'POST',
              headers: supabaseAnonFunctionHeaders({
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              }),
              body: JSON.stringify({ intentId }),
            });
            if (res.ok) {
              setStatus('success');
              return;
            }
            const data = (await res.json().catch(() => ({}))) as { status?: string };
            // Payment not completed in DB yet — wait for webhook
            if (res.status === 400 && String(data.status || '').toLowerCase() !== 'failed') {
              await new Promise((r) => setTimeout(r, POLL_MS));
              continue;
            }
            setStatus('failed');
            return;
          }
          setStatus('failed');
        } catch {
          setStatus('failed');
        }
      })();
      return;
    }

    if (walletDebt) {
      const intentId = params.get('intent_id') || params.get('intentId') || '';
      void (async () => {
        setStatus('pending_confirmation');
        if (!intentId) {
          setStatus('failed');
          return;
        }
        try {
          for (let i = 0; i < POLL_ATTEMPTS; i++) {
            const res = await fetch(`${API_ENDPOINTS.payments}/wipay/complete`, {
              method: 'POST',
              headers: supabaseAnonFunctionHeaders({
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              }),
              body: JSON.stringify({ intentId }),
            });
            const data = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string };
            if (res.ok && data.success) {
              setStatus('success');
              return;
            }
            if (res.status === 202 || data.code === 'pending_confirmation') {
              await new Promise((r) => setTimeout(r, POLL_MS));
              continue;
            }
            setStatus('failed');
            return;
          }
          setStatus('failed');
        } catch {
          setStatus('failed');
        }
      })();
      return;
    }

    if (!orderIdParam && !transactionId) {
      setStatus('failed');
      return;
    }

    void pollOrderPayment(orderIdParam, transactionId);
  }, [provider, session]);

  const pollOrderPayment = async (orderIdParam: string, transactionId: string) => {
    setStatus('pending_confirmation');
    try {
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        const res = await fetch(`${API_ENDPOINTS.payments}/wipay/complete`, {
          method: 'POST',
          headers: supabaseAnonFunctionHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session!.access_token}`,
          }),
          body: JSON.stringify({
            orderId: orderIdParam,
            transactionId: transactionId || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          orderId?: string;
          code?: string;
          success?: boolean;
        };
        if (res.ok && data.success) {
          setOrderId(data.orderId || orderIdParam);
          setStatus('success');
          return;
        }
        if (res.status === 202 || data.code === 'pending_confirmation') {
          await new Promise((r) => setTimeout(r, POLL_MS));
          continue;
        }
        setStatus('failed');
        return;
      }
      // Exhausted polls — still pending webhook
      setStatus('failed');
    } catch {
      setStatus('failed');
    }
  };

  if (status === 'processing' || status === 'pending_confirmation') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mb-4" />
        <h1 className="text-xl font-semibold text-gray-900">
          We're confirming your payment — don't pay again
        </h1>
        <p className="text-gray-500 mt-2">This page only checks the result. It cannot charge you a second time.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <CheckCircle className="w-20 h-20 text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-8">
          {isRushPass ? 'Your Rush Pass is activating' : isWalletDebt ? 'Your balance is paid. You can order again.' : 'Your order has been confirmed'}
        </p>
        <button
          type="button"
          onClick={() =>
            onNavigate(
              isRushPass ? 'rush-pass' : isWalletDebt ? 'checkout' : orderId ? 'tracking' : 'orders',
              !isRushPass && !isWalletDebt && orderId ? { orderId } : undefined,
            )
          }
          className="px-8 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
        >
          {isRushPass ? 'View Rush Pass' : isWalletDebt ? 'Back to checkout' : 'Track Your Order'}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <XCircle className="w-20 h-20 text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">We're still confirming</h1>
      <p className="text-gray-500 mb-8">
        Don't pay again. If this window expired and nothing was charged, start a new order. If you were charged, the refund starts on its own.
      </p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => onNavigate(isRushPass ? 'rush-pass' : 'cart')}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => onNavigate(isRushPass ? 'home' : 'orders')}
          className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
        >
          {isRushPass ? 'Go Home' : 'View Orders'}
        </button>
      </div>
    </div>
  );
}
