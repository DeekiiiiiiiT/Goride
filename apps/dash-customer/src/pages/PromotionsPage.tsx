import { useEffect, useState } from 'react';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AccountSubHeader } from '@/components/account/AccountSubHeader';
import { saveCheckoutPreferences } from '@/lib/checkoutStorage';
import { cacheValidatedPromo } from '@/lib/orderPricing';
import { useCart } from '@/hooks/useCart';

type ApiPromo = {
  id: string;
  merchantId: string;
  merchantName: string | null;
  type: string;
  title: string;
  discountPercent: number | null;
  discountAmount: number | null;
  minOrder: number | null;
  promoCode: string;
  dateEnd: string | null;
};

type Props = {
  onNavigate: (page: string) => void;
  returnTo?: string;
};

export default function PromotionsPage({ onNavigate, returnTo = 'account' }: Props) {
  const { subtotal, merchantId } = useCart();
  const [promoCode, setPromoCode] = useState('');
  const [message, setMessage] = useState('');
  const [promotions, setPromotions] = useState<ApiPromo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
        const res = await fetch(`${API_ENDPOINTS.delivery}/promotions${qs}`, {
          headers: supabaseAnonFunctionHeaders(),
        });
        if (!res.ok) throw new Error('Failed to load promotions');
        const data = (await res.json()) as { promotions?: ApiPromo[] };
        if (!cancelled) setPromotions(data.promotions || []);
      } catch {
        if (!cancelled) setPromotions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const applyCode = async (codeRaw: string) => {
    const code = codeRaw.trim().toUpperCase();
    if (!code) {
      setMessage('Enter a promo code');
      return;
    }

    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/promotions/redeem`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          code,
          merchantId: merchantId || undefined,
          subtotal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        discount?: number;
        promo?: {
          code: string;
          title: string;
          type: string;
          discountPercent: number | null;
          discountAmount: number | null;
          minOrder: number | null;
        };
      };
      if (!res.ok || !data.promo) {
        setMessage(data.error || 'Invalid promo code');
        return;
      }

      const value =
        data.promo.discountPercent != null
          ? Number(data.promo.discountPercent)
          : Number(data.promo.discountAmount || 0);

      cacheValidatedPromo({
        code: data.promo.code,
        title: data.promo.title,
        type: data.promo.type as 'percent_off' | 'amount_off' | 'free_delivery',
        value,
        minOrder: Number(data.promo.minOrder || 0),
      });
      saveCheckoutPreferences({ appliedPromoCode: data.promo.code });
      setMessage(
        data.promo.type === 'free_delivery'
          ? `${data.promo.code} applied (free delivery)`
          : `${data.promo.code} applied (−J$${Number(data.discount || 0).toFixed(0)})`,
      );
    } catch {
      setMessage('Could not validate promo');
    }
  };

  return (
    <div className="bg-surface text-on-surface antialiased pb-24 min-h-dvh">
      <AccountSubHeader
        onBack={() => onNavigate(returnTo)}
        onNotifications={() => onNavigate('notification-settings')}
      />

      <main className="max-w-[1200px] mx-auto px-4 pt-6 flex flex-col gap-6">
        <div>
          <h2 className="text-headline-lg-mobile font-bold mb-1">Promotions</h2>
          <p className="text-body-md text-on-surface-variant">Redeem merchant promo codes at checkout.</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <label htmlFor="promo-code" className="block text-label-md font-semibold mb-2">
            Enter promo code
          </label>
          <div className="flex gap-2">
            <input
              id="promo-code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="e.g. SAVE50"
              className="flex-1 bg-surface-container-high border-none rounded-lg px-4 py-3 text-body-md focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-colors"
            />
            <button
              type="button"
              onClick={() => void applyCode(promoCode)}
              className="bg-primary text-on-primary font-semibold text-label-md px-6 py-3 rounded-lg"
            >
              Apply
            </button>
          </div>
          {message && <p className="text-body-sm text-primary mt-2">{message}</p>}
        </div>

        <div>
          <h3 className="text-headline-sm font-semibold mb-4">Active Promos</h3>
          {loading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : promotions.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No active promotions right now.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {promotions.map((promo) => (
                <div
                  key={promo.id}
                  className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
                  <div className="flex items-center gap-4 pl-2">
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary shrink-0">
                      <MaterialIcon name="local_offer" className="text-2xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-headline-sm font-semibold">{promo.promoCode}</h4>
                      <p className="text-body-md text-primary font-medium mt-1">{promo.title}</p>
                      <p className="text-body-sm text-outline mt-1">
                        {promo.merchantName || 'Merchant offer'}
                        {promo.dateEnd ? ` · Ends ${promo.dateEnd}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void applyCode(promo.promoCode).then(() => onNavigate('cart'))}
                      className="text-primary font-semibold text-label-md px-4 py-2 rounded-lg border border-primary shrink-0"
                    >
                      Use Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
