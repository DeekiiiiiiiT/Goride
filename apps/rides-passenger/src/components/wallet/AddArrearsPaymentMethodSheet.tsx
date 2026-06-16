import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addSavedCard,
  addSavedLynk,
  type SavedPaymentMethod,
} from '@/lib/savedPaymentMethods';

type Mode = 'card' | 'lynk';

type Props = {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  onAdded: (method: SavedPaymentMethod) => void;
};

export function AddArrearsPaymentMethodSheet({ open, mode, onClose, onAdded }: Props) {
  const [brand, setBrand] = useState('Visa');
  const [last4, setLast4] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [lynkHandle, setLynkHandle] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setBrand('Visa');
    setLast4('');
    setExpiry('');
    setCardholderName('');
    setLynkHandle('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const method =
        mode === 'card'
          ? addSavedCard({ brand, last4, expiry, cardholderName })
          : addSavedLynk({ lynkHandle });
      toast.success(mode === 'card' ? 'Card added' : 'Lynk linked (demo)');
      onAdded(method);
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add payment method');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 animate-in slide-in-from-bottom max-h-[85vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {mode === 'card' ? 'Add debit or credit card' : 'Link Lynk'}
          </h3>
          <button
            type="button"
            className="p-2 -mr-2 text-slate-400 hover:text-slate-600"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {mode === 'card' ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm text-slate-600">
              Card must be in the account holder&apos;s name. Demo mode — no real charge until card
              processing is live.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Cardholder name</label>
              <input
                type="text"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="As shown on your card"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Last 4 digits</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="1212"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Expiry</label>
              <input
                type="text"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="MM/YY"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </span>
              ) : (
                'Save card'
              )}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <p className="text-sm text-slate-600">
              Demo — Lynk payment link coming soon. Enter your Lynk phone or username to use when live.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lynk phone or username</label>
              <input
                type="text"
                value={lynkHandle}
                onChange={(e) => setLynkHandle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="e.g. 8765551234"
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Linking…
                </span>
              ) : (
                'Link Lynk'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
