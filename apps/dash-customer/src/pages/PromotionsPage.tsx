import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AccountSubHeader } from '@/components/account/AccountSubHeader';
import { ACTIVE_PROMOS, EXPIRED_PROMOS } from '@/lib/accountSubContent';
import { saveCheckoutPreferences } from '@/lib/checkoutStorage';
import { PROMO_CODES } from '@/lib/orderPricing';

type Props = {
  onNavigate: (page: string) => void;
};

export default function PromotionsPage({ onNavigate }: Props) {
  const [promoCode, setPromoCode] = useState('');
  const [message, setMessage] = useState('');

  const handleApply = () => {
    const code = promoCode.trim().toUpperCase();
    if (PROMO_CODES[code]) {
      saveCheckoutPreferences({ appliedPromoCode: code });
      setMessage(`${code} applied successfully`);
    } else {
      setMessage('Invalid promo code');
    }
  };

  return (
    <div className="bg-surface text-on-surface antialiased pb-24 min-h-screen">
      <AccountSubHeader />

      <main className="max-w-[1200px] mx-auto px-4 pt-6 flex flex-col gap-6">
        <div>
          <h2 className="text-headline-lg-mobile font-bold mb-1">Promotions</h2>
          <p className="text-body-md text-on-surface-variant">Manage your rewards and promo codes.</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <label htmlFor="promo-code" className="block text-label-md font-semibold mb-2">
            Enter promo code
          </label>
          <div className="flex gap-2">
            <input
              id="promo-code"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value)}
              placeholder="e.g. ROAM50"
              className="flex-1 bg-surface-container-high border-none rounded-lg px-4 py-3 text-body-md focus:ring-2 focus:ring-primary focus:bg-surface-container-lowest transition-colors"
            />
            <button
              type="button"
              onClick={handleApply}
              className="bg-primary text-on-primary font-semibold text-label-md px-6 py-3 rounded-lg"
            >
              Apply
            </button>
          </div>
          {message && <p className="text-body-sm text-primary mt-2">{message}</p>}
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-variant">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-headline-sm font-semibold flex items-center gap-1">
                <MaterialIcon name="stars" className="text-primary" filled />
                Roam Rewards
              </h3>
              <p className="text-body-sm text-on-surface-variant mt-1">Free delivery after 5 orders</p>
            </div>
            <span className="bg-primary-container text-on-primary-container text-label-sm px-3 py-1 rounded-full">
              Level 1
            </span>
          </div>
          <div className="mb-2">
            <span className="text-xs font-semibold text-primary">3 / 5 Orders</span>
          </div>
          <div className="overflow-hidden h-2 mb-4 rounded-full bg-surface-container-high">
            <div className="h-full bg-gradient-to-r from-primary to-primary-fixed-dim rounded-full" style={{ width: '60%' }} />
          </div>
          <div className="flex justify-between text-label-sm text-outline">
            <span>Order 1</span>
            <span>Order 3</span>
            <span className="text-on-surface font-semibold">Free Delivery!</span>
          </div>
        </div>

        <div>
          <h3 className="text-headline-sm font-semibold mb-4">Active Promos</h3>
          <div className="flex flex-col gap-4">
            {ACTIVE_PROMOS.map(promo => (
              <div
                key={promo.code}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
                <div className="flex items-center gap-4 pl-2">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary shrink-0">
                    <MaterialIcon name={promo.icon} className="text-2xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-headline-sm font-semibold">{promo.code}</h4>
                    <p className="text-body-md text-primary font-medium mt-1">{promo.title}</p>
                    <p className="text-body-sm text-outline mt-1 flex items-center gap-1">
                      <MaterialIcon name="schedule" className="text-[16px]" />
                      {promo.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      saveCheckoutPreferences({ appliedPromoCode: promo.code });
                      onNavigate('home');
                    }}
                    className="text-primary font-semibold text-label-md px-4 py-2 rounded-lg border border-primary shrink-0"
                  >
                    Use Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 border-t border-surface-variant pt-6">
          <details className="group">
            <summary className="flex items-center justify-between text-headline-sm font-semibold cursor-pointer list-none">
              Past &amp; Expired Promos
              <MaterialIcon name="expand_more" className="text-outline group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-4 flex flex-col gap-2 opacity-60">
              {EXPIRED_PROMOS.map(promo => (
                <div key={promo.code} className="bg-surface-container rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className={`text-headline-sm font-semibold ${promo.status === 'Expired' ? 'line-through' : ''}`}>
                      {promo.code}
                    </p>
                    <p className="text-body-sm text-outline mt-1">{promo.detail}</p>
                  </div>
                  <span className="text-label-sm bg-surface-variant text-on-surface-variant px-3 py-1 rounded-full">
                    {promo.status}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
