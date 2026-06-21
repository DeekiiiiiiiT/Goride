import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { getPaymentAltPrefs, savePaymentAltPrefs } from '@/lib/accountSubContent';
import {
  getCheckoutPreferences,
  PAYMENT_OPTIONS,
  saveCheckoutPreferences,
  type PaymentMethodId,
  type SavedCard,
} from '@/lib/checkoutStorage';

type Props = {
  returnTo?: string;
  mode?: 'manage' | 'select';
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

function isSavedCard(option: (typeof PAYMENT_OPTIONS)[number]): option is SavedCard {
  return 'brand' in option;
}

function CardBrand({ brand }: { brand: string }) {
  if (brand === 'VISA') {
    return <span className="text-headline-sm font-bold italic tracking-tighter text-primary">VISA</span>;
  }
  return (
    <div className="flex">
      <div className="w-4 h-4 rounded-full bg-[#EB001B] opacity-80 mix-blend-multiply" />
      <div className="w-4 h-4 rounded-full bg-[#F79E1B] opacity-80 mix-blend-multiply -ml-2" />
    </div>
  );
}

export default function PaymentMethodsPage({ returnTo = 'account', mode = 'manage', onNavigate }: Props) {
  const prefs = getCheckoutPreferences();
  const [defaultCard, setDefaultCard] = useState<PaymentMethodId>(prefs.paymentMethodId);
  const [altPrefs, setAltPrefs] = useState(getPaymentAltPrefs);
  const savedCards = PAYMENT_OPTIONS.filter(isSavedCard);
  const isSelectMode = mode === 'select';

  const handleBack = () => onNavigate(returnTo);

  const handleConfirm = () => {
    saveCheckoutPreferences({ paymentMethodId: defaultCard });
    onNavigate(returnTo);
  };

  const setAlt = (key: keyof typeof altPrefs, value: boolean) => {
    const next = { ...altPrefs, [key]: value };
    setAltPrefs(next);
    savePaymentAltPrefs(next);
  };

  return (
    <div className="bg-background text-on-background min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-surface w-full shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto h-16">
          <button type="button" onClick={handleBack} className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant">
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold text-primary">Payment Methods</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-4 flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">Saved Cards</h2>
          <div className="flex flex-col gap-2">
            {savedCards.map(card => (
              <div
                key={card.id}
                className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-variant relative overflow-hidden"
              >
                {defaultCard === card.id && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary-container opacity-5 rounded-bl-full pointer-events-none" />
                )}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-8 bg-surface-container rounded flex items-center justify-center border border-surface-variant">
                      <CardBrand brand={card.brand} />
                    </div>
                    <div>
                      <span className="text-body-md font-medium block">•••• {card.last4}</span>
                      <span className="text-label-sm text-on-surface-variant">Expires {card.expires}</span>
                    </div>
                  </div>
                  {defaultCard === card.id && (
                    <span className="bg-primary-container text-on-primary-container text-label-sm px-2 py-1 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex justify-end gap-4 mt-2 pt-2 border-t border-surface-variant">
                  {isSelectMode ? (
                    <button
                      type="button"
                      onClick={() => setDefaultCard(card.id)}
                      className="text-label-md font-semibold text-primary"
                    >
                      {defaultCard === card.id ? 'Selected' : 'Select'}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="text-label-md font-semibold text-on-surface-variant flex items-center gap-1">
                        <MaterialIcon name="edit" className="text-[18px]" />
                        Edit
                      </button>
                      <button type="button" className="text-label-md font-semibold text-error flex items-center gap-1">
                        <MaterialIcon name="delete" className="text-[18px]" />
                        Remove
                      </button>
                      {defaultCard !== card.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setDefaultCard(card.id);
                            saveCheckoutPreferences({ paymentMethodId: card.id });
                          }}
                          className="text-label-md font-semibold text-primary"
                        >
                          Set default
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('add-card', { returnTo: 'payment-methods' })}
            className="w-full bg-primary text-on-primary font-semibold text-label-md py-4 rounded-lg shadow-sm flex items-center justify-center gap-2 mt-1"
          >
            <MaterialIcon name="add_circle" />
            Add New Card
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">Alternative Methods</h2>
          <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-surface-variant">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary">
                  <MaterialIcon name="payments" filled />
                </div>
                <div>
                  <span className="text-body-md font-medium block">Cash on Delivery</span>
                  <span className="text-body-sm text-on-surface-variant">Pay when you receive</span>
                </div>
              </div>
              <ToggleSwitch checked={altPrefs.cashOnDelivery} onChange={v => setAlt('cashOnDelivery', v)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary">
                  <MaterialIcon name="account_balance_wallet" filled />
                </div>
                <div>
                  <span className="text-body-md font-medium block">Digital Wallets</span>
                  <span className="text-body-sm text-on-surface-variant">Apple Pay, Google Pay</span>
                </div>
              </div>
              <ToggleSwitch checked={altPrefs.digitalWallets} onChange={v => setAlt('digitalWallets', v)} />
            </div>
          </div>
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
