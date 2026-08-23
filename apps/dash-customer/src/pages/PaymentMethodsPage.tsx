import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  PAYMENT_OPTIONS,
  getCheckoutPreferences,
  isSelectablePaymentMethod,
  type PaymentMethodId,
} from '@/lib/checkoutStorage';
import { persistPreferredPaymentMethod } from '@/lib/paymentPreference';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type VaultMethod = {
  id: string;
  type: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean | null;
};

type Props = {
  returnTo?: string;
  mode?: 'manage' | 'select';
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function PaymentMethodsPage({ returnTo = 'account', mode = 'manage', onNavigate }: Props) {
  const prefs = getCheckoutPreferences();
  const [selected, setSelected] = useState<PaymentMethodId>(prefs.paymentMethodId);
  const [vaultMethods, setVaultMethods] = useState<VaultMethod[]>([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const isSelectMode = mode === 'select';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setVaultMethods([]);
          return;
        }
        const res = await fetch(`${API_ENDPOINTS.payments}/methods`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setVaultMethods([]);
          return;
        }
        const data = (await res.json()) as { methods?: VaultMethod[] };
        if (!cancelled) setVaultMethods(data.methods || []);
      } catch {
        if (!cancelled) setVaultMethods([]);
      } finally {
        if (!cancelled) setVaultLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = () => onNavigate(returnTo);

  const handleConfirm = () => {
    void persistPreferredPaymentMethod(selected).catch(() => {
      toast.error('Could not save this payment method');
    });
    onNavigate(returnTo);
  };

  return (
    <div className="bg-background text-on-background min-h-dvh pb-24">
      <header className="sticky top-0 z-40 bg-surface w-full shadow-sm safe-t">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto min-h-16">
          <button type="button" onClick={handleBack} className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant">
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold text-primary">Payment Methods</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-4 flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
            Checkout options
          </h2>
          <div className="flex flex-col gap-2">
            {PAYMENT_OPTIONS.map((option) => {
              const disabled = option.comingSoon === true || !isSelectablePaymentMethod(option.id);
              return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setSelected(option.id);
                  if (!isSelectMode) {
                    void persistPreferredPaymentMethod(option.id).catch(() => {
                      toast.error('Could not save this payment method');
                    });
                  }
                }}
                className={`bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border text-left flex items-center gap-3 ${
                  disabled
                    ? 'border-surface-variant opacity-60 cursor-not-allowed'
                    : selected === option.id
                      ? 'border-primary'
                      : 'border-surface-variant'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary">
                  <MaterialIcon name={option.icon} filled />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-body-md font-medium block">{option.label}</span>
                  <span className="text-body-sm text-on-surface-variant">{option.description}</span>
                </div>
                {option.comingSoon && (
                  <span className="text-label-sm font-medium text-on-surface-variant bg-surface-container px-2 py-1 rounded-full shrink-0">
                    Coming soon
                  </span>
                )}
                {!disabled && selected === option.id && (
                  <MaterialIcon name="check_circle" className="text-primary" filled />
                )}
              </button>
            );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
            Saved cards
          </h2>
          {vaultLoading ? (
            <p className="text-body-sm text-on-surface-variant">Checking vault…</p>
          ) : vaultMethods.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-dashed border-surface-variant">
              <p className="text-body-md text-on-surface-variant">
                Cards are saved securely during checkout through WiPay or PayPal (hosted payment). There is no separate Add Card step in the app.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {vaultMethods.map((m) => (
                <div
                  key={m.id}
                  className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex items-center gap-3"
                >
                  <MaterialIcon name="credit_card" className="text-primary" />
                  <div className="flex-1">
                    <p className="text-body-md font-medium">
                      {(m.brand || 'Card').toUpperCase()} •••• {m.last4}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                      Exp {m.exp_month}/{m.exp_year}
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-body-sm text-on-surface-variant px-1">
                New cards are added automatically when you pay with WiPay or PayPal at checkout.
              </p>
            </div>
          )}
        </section>
      </main>

      {isSelectMode && (
        <div className="fixed bottom-0 left-0 w-full p-4 bg-surface-container-lowest border-t border-surface-variant pb-safe z-50">
          <div className="max-w-[1200px] mx-auto">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full bg-primary text-on-primary font-semibold text-label-md py-4 rounded-lg"
            >
              Use this payment method
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
