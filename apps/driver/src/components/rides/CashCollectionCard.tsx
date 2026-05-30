import React from 'react';
import { Banknote, Receipt } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

interface CashCollectionCardProps {
  ride: RideRequestRow;
  compact?: boolean;
}

export function CashCollectionCard({ ride, compact = false }: CashCollectionCardProps) {
  if (ride.payment_method !== 'cash') return null;
  if (ride.status !== 'completed' && ride.status !== 'on_trip') return null;

  const currency = ride.currency ?? 'JMD';
  const totalMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);

  const hasExtras = actualTollsMinor > 0;

  return (
    <section
      className={`rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900 space-y-3 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            {ride.status === 'completed' ? 'Cash Collected' : 'Cash to Collect'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            From rider
          </p>
        </div>
      </div>

      <div className="text-center py-2">
        <p className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {formatMoneyMinor(totalMinor, currency)}
        </p>
      </div>

      {hasExtras && (
        <div className="space-y-1.5 pt-2 border-t border-emerald-200 dark:border-emerald-800/50">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Base fare</span>
            <span className="text-slate-700 dark:text-slate-300 tabular-nums">
              {formatMoneyMinor(baseFareMinor, currency)}
            </span>
          </div>
          {actualTollsMinor > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Tolls</span>
              <span className="text-slate-700 dark:text-slate-300 tabular-nums">
                +{formatMoneyMinor(actualTollsMinor, currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {ride.status === 'on_trip' && (
        <p className="text-xs text-center text-emerald-700 dark:text-emerald-400 font-medium pt-1">
          Collect this amount when you arrive at drop-off
        </p>
      )}
    </section>
  );
}
