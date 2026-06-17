import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import { CashCollectionCard } from './CashCollectionCard';
import {
  clearCashSettlementPending,
  readCashSettlementPending,
  writeCashSettlementPending,
} from '../../utils/cashSettlementPendingStorage';

type Props = {
  ride: RideRequestRow;
  submitting: boolean;
  onSubmit: (cashReceivedMinor: number, idempotencyKey: string) => Promise<void>;
};

function parseAmountInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const major = Number.parseFloat(cleaned);
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

export function CashSettlementScreen({ ride, submitting, onSubmit }: Props) {
  const owedMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);

  const [input, setInput] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const pending = readCashSettlementPending();
    if (pending?.rideId === ride.id) {
      const major = (pending.cashReceivedMinor / 100).toFixed(2);
      setInput(major);
    }
  }, [ride.id]);

  const parsedMinor = useMemo(() => parseAmountInput(input), [input]);

  const handleSubmit = async () => {
    if (parsedMinor == null) {
      toast.error('Enter a valid cash amount');
      return;
    }
    writeCashSettlementPending({
      rideId: ride.id,
      idempotencyKey,
      cashReceivedMinor: parsedMinor,
      attemptedAt: new Date().toISOString(),
    });
    try {
      await onSubmit(parsedMinor, idempotencyKey);
      clearCashSettlementPending();
    } catch {
      // pending kept for retry
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Collect cash</h1>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <CashCollectionCard ride={{ ...ride, status: 'awaiting_cash_settlement' }} />

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total cash received from rider
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. amount on the bill they gave you"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-2xl font-bold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            disabled={submitting}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => setInput((owedMinor / 100).toFixed(2))}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            Full fare received
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setInput('0')}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            No cash received
          </button>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-800">
        <button
          type="button"
          disabled={submitting || parsedMinor == null}
          onClick={() => void handleSubmit()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Confirming payment…
            </>
          ) : (
            'Confirm payment'
          )}
        </button>
      </div>
    </div>
  );
}
