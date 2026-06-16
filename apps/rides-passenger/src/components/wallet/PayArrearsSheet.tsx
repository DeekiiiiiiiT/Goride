import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoneyMinor } from '@roam/types/rides';
import { TripPaymentMethodIcon } from '@/components/TripPaymentMethodIcon';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import {
  listArrearsEligibleSavedMethods,
  SAVED_PAYMENT_METHODS_CHANGED_EVENT,
  type SavedPaymentMethod,
} from '@/lib/savedPaymentMethods';
import { walletPayArrears } from '@/services/walletEdge';
import { AddArrearsPaymentMethodSheet } from './AddArrearsPaymentMethodSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  arrearsMinor: number;
  currency?: string;
  onSuccess?: (result: { amount_paid_minor: number; new_arrears_minor: number }) => void;
};

export function PayArrearsSheet({
  open,
  onClose,
  arrearsMinor,
  currency = 'JMD',
  onSuccess,
}: Props) {
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [paying, setPaying] = useState(false);
  const [addMode, setAddMode] = useState<'card' | 'lynk' | null>(null);

  const reloadMethods = useCallback(() => {
    setMethods(listArrearsEligibleSavedMethods());
  }, []);

  useEffect(() => {
    if (!open) return;
    reloadMethods();
    const onChanged = () => reloadMethods();
    window.addEventListener(SAVED_PAYMENT_METHODS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SAVED_PAYMENT_METHODS_CHANGED_EVENT, onChanged);
  }, [open, reloadMethods]);

  if (!open) return null;

  const handlePay = async (methodId: string) => {
    if (paying || arrearsMinor <= 0) return;
    setPaying(true);
    try {
      const result = await walletPayArrears(methodId, createIdempotencyKey(), currency);
      if (result.success) {
        toast.success(
          `Paid ${formatMoneyMinor(result.amount_paid_minor, currency)} — balance cleared`,
        );
        onSuccess?.({
          amount_paid_minor: result.amount_paid_minor,
          new_arrears_minor: result.new_arrears_minor,
        });
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not process payment');
    } finally {
      setPaying(false);
    }
  };

  const handleAdded = (method: SavedPaymentMethod) => {
    reloadMethods();
    void handlePay(method.id);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
        <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 animate-in slide-in-from-bottom">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Pay outstanding balance</h3>
            <button
              type="button"
              className="p-2 -mr-2 text-slate-400 hover:text-slate-600"
              onClick={onClose}
              aria-label="Close"
              disabled={paying}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mb-4 text-sm text-slate-600">
            Select a payment method to pay{' '}
            <span className="font-semibold tabular-nums">
              {formatMoneyMinor(arrearsMinor, currency)}
            </span>
            .
          </p>

          {methods.length > 0 ? (
            <div className="space-y-2">
              {methods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => void handlePay(method.id)}
                  disabled={paying}
                >
                  <TripPaymentMethodIcon icon={method.icon} className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{method.barLabel}</p>
                    {method.subtitle ? (
                      <p className="text-xs text-slate-500 truncate">{method.subtitle}</p>
                    ) : null}
                  </div>
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
              Add a debit/credit card or Lynk account to pay your balance.
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setAddMode('card')}
              disabled={paying}
            >
              <CreditCard className="h-4 w-4" />
              Add card
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setAddMode('lynk')}
              disabled={paying}
            >
              <Smartphone className="h-4 w-4" />
              Link Lynk
            </button>
          </div>

          {methods.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500 text-center">
              Cash cannot be used to settle an outstanding balance online.
            </p>
          ) : null}
        </div>
      </div>

      {addMode ? (
        <AddArrearsPaymentMethodSheet
          open
          mode={addMode}
          onClose={() => setAddMode(null)}
          onAdded={handleAdded}
        />
      ) : null}
    </>
  );
}
