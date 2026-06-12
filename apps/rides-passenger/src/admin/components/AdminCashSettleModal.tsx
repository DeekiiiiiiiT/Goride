import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { resolveLockedFareMinor } from '@roam/types/cashSettlementDisplay';

type Props = {
  ride: RideRequestRow | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (cashReceivedMinor: number) => void;
};

function parseAmountInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const major = Number.parseFloat(cleaned);
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

export function AdminCashSettleModal({ ride, open, submitting, onClose, onConfirm }: Props) {
  const currency = ride?.currency ?? 'JMD';
  const owedMinor = useMemo(
    () => (ride ? resolveLockedFareMinor(ride) : null),
    [ride],
  );
  const owedLabel = owedMinor != null ? formatMoneyMinor(owedMinor, currency) : '—';

  const [input, setInput] = useState('');

  useEffect(() => {
    if (!open || !ride) return;
    if (owedMinor != null) {
      setInput((owedMinor / 100).toFixed(2));
    } else {
      setInput('');
    }
  }, [open, ride?.id, owedMinor]);

  if (!open || !ride) return null;

  const parsedMinor = parseAmountInput(input);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        role="dialog"
        aria-labelledby="admin-settle-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="admin-settle-title" className="text-lg font-semibold text-white">
              Settle cash trip
            </h3>
            <p className="mt-1 text-xs text-slate-400 font-mono">{ride.id.slice(0, 8)}…</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-300">
          Enter the cash amount the driver received. Locked fare:{' '}
          <span className="font-semibold tabular-nums text-emerald-300">{owedLabel}</span>
        </p>

        <label className="mt-4 block space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cash received
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-lg font-bold tabular-nums text-white"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || parsedMinor == null}
            onClick={() => parsedMinor != null && onConfirm(parsedMinor)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Settling…
              </>
            ) : (
              'Settle & complete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
