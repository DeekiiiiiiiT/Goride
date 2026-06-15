import React from 'react';
import { CheckCircle2, CreditCard } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

type Props = {
  ride: RideRequestRow;
  onDone: () => void;
};

export function DriverDigitalTripCompleteView({ ride, onDone }: Props) {
  const currency = ride.currency ?? 'JMD';
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Trip complete</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Digital payment</p>
          </div>
        </div>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Digital payment summary"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CreditCard className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment settled in-app</p>
          </div>

          <div className="mb-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip earnings</p>
            <p className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
              {formatMoneyMinor(fareMinor, currency)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Added to your total earnings — no cash to collect.
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
              <span>Payment method</span>
              <span className="font-semibold">Card / digital</span>
            </div>
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-800">
        <button
          type="button"
          onClick={onDone}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
