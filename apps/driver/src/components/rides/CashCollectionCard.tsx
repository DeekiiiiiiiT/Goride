import React from 'react';
import { Banknote } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { resolveLockedFareMinor } from '@roam/types/cashSettlementDisplay';

interface CashCollectionCardProps {
  ride: RideRequestRow;
  compact?: boolean;
}

export function CashCollectionCard({ ride, compact = false }: CashCollectionCardProps) {
  if (ride.payment_method !== 'cash') return null;
  if (
    ride.status !== 'completed' &&
    ride.status !== 'on_trip' &&
    ride.status !== 'awaiting_cash_settlement'
  ) {
    return null;
  }

  const currency = ride.currency ?? 'JMD';
  const lockedMinor = resolveLockedFareMinor(ride);
  const showAmount = ride.status === 'awaiting_cash_settlement' || ride.status === 'completed';
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);
  const hasExtras = actualTollsMinor > 0 && showAmount;

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
            {ride.status === 'completed'
              ? 'Cash Collected'
              : ride.status === 'awaiting_cash_settlement'
                ? 'Cash to Collect'
                : 'Cash trip'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {ride.status === 'on_trip' ? 'Amount shown at drop-off' : 'From rider'}
          </p>
        </div>
      </div>

      {showAmount && lockedMinor != null ? (
        <div className="text-center py-2">
          <p className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatMoneyMinor(lockedMinor, currency)}
          </p>
        </div>
      ) : ride.status === 'on_trip' ? (
        <p className="text-center text-sm text-slate-600 dark:text-slate-300 py-2">
          Fare is locked when you tap Collect payment at drop-off.
        </p>
      ) : null}

      {hasExtras && lockedMinor != null && (
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

      {ride.status === 'awaiting_cash_settlement' && (
        <p className="text-xs text-center text-emerald-700 dark:text-emerald-400 font-medium pt-1">
          Enter the amount you received below
        </p>
      )}
    </section>
  );
}
