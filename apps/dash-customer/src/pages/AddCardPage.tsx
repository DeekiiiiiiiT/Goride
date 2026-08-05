import { useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

type Props = {
  returnTo?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

/**
 * Card vault UI — requires a processor `providerToken` (WiPay tokenization).
 * No raw PAN fields are accepted or stored.
 */
export default function AddCardPage({ returnTo = 'payment-methods', onNavigate }: Props) {
  const [providerToken, setProviderToken] = useState('');
  const [last4, setLast4] = useState('');
  const [brand, setBrand] = useState('visa');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!providerToken.trim()) {
      toast.error('A WiPay provider token is required — card numbers cannot be saved directly');
      return;
    }
    if (!/^\d{4}$/.test(last4)) {
      toast.error('Enter the last 4 digits from your tokenized card');
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in');
        onNavigate('login');
        return;
      }

      const res = await fetch(`${API_ENDPOINTS.payments}/methods`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerToken: providerToken.trim(),
          last4,
          brand,
          expMonth: Number(expMonth),
          expYear: Number(expYear),
          provider: 'wipay',
          type: 'card',
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Could not save card');
      }

      toast.success('Card saved');
      onNavigate(returnTo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-background min-h-dvh flex flex-col items-center">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-50 flex justify-between items-center px-4 min-h-16 pt-safe bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => onNavigate(returnTo)}
          className="p-2 rounded-full text-on-surface"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary absolute left-1/2 -translate-x-1/2">Add Card</h1>
        <div className="w-10" />
      </header>

      <main className="w-full max-w-lg mt-[calc(4rem+env(safe-area-inset-top,0px)+1.5rem)] px-4 flex-1 pb-28">
        <div className="bg-surface-container-lowest rounded-[24px] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] mb-4">
          <MaterialIcon name="credit_card_off" className="text-4xl text-on-surface-variant mb-3" />
          <h2 className="text-headline-sm font-bold mb-2">Tokenized cards only</h2>
          <p className="text-body-md text-on-surface-variant mb-4">
            We never store card numbers. Paste a WiPay <span className="font-semibold">provider token</span> after
            tokenization. Without it, use WiPay or PayPal at checkout.
          </p>

          <label className="block text-label-md font-semibold mb-1">Provider token</label>
          <input
            value={providerToken}
            onChange={(e) => setProviderToken(e.target.value)}
            placeholder="WiPay tokenization token"
            className="w-full mb-3 bg-surface-container rounded-lg px-4 py-3 text-body-md"
            autoComplete="off"
          />

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-label-md font-semibold mb-1">Last 4</label>
              <input
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4242"
                inputMode="numeric"
                className="w-full bg-surface-container rounded-lg px-4 py-3 text-body-md"
              />
            </div>
            <div>
              <label className="block text-label-md font-semibold mb-1">Brand</label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-surface-container rounded-lg px-4 py-3 text-body-md"
              >
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">Amex</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label className="block text-label-md font-semibold mb-1">Exp month</label>
              <input
                value={expMonth}
                onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="12"
                inputMode="numeric"
                className="w-full bg-surface-container rounded-lg px-4 py-3 text-body-md"
              />
            </div>
            <div>
              <label className="block text-label-md font-semibold mb-1">Exp year</label>
              <input
                value={expYear}
                onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2028"
                inputMode="numeric"
                className="w-full bg-surface-container rounded-lg px-4 py-3 text-body-md"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={saving || !providerToken.trim()}
            onClick={() => void handleSave()}
            className="w-full bg-primary text-on-primary font-semibold py-4 rounded-xl disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save tokenized card'}
          </button>
          {!providerToken.trim() && (
            <p className="text-body-sm text-on-surface-variant text-center mt-3">
              Card saving coming soon without a processor token — pay with WiPay or PayPal at checkout.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
