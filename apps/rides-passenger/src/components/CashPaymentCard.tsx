import React from 'react';
import { Banknote, Receipt } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

interface CashPaymentCardProps {
  ride: RideRequestRow;
}

export function CashPaymentCard({ ride }: CashPaymentCardProps) {
  if (ride.payment_method !== 'cash') return null;
  if (!['on_trip', 'awaiting_cash_settlement', 'completed'].includes(ride.status)) return null;

  const currency = ride.currency ?? 'JMD';
  const totalMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);
  const isSettlement = ride.status === 'awaiting_cash_settlement';
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);

  const hasExtras = actualTollsMinor > 0;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <Banknote className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Cash Payment
          </p>
          <p className="text-xs text-zinc-500">
            {ride.status === 'completed'
              ? 'Amount paid'
              : isSettlement
                ? 'Pay your driver'
                : 'Amount to pay driver'}
          </p>
        </div>
      </div>

      <div className="text-center py-3">
        <p className="text-4xl font-bold tabular-nums text-zinc-900">
          {formatMoneyMinor(totalMinor, currency)}
        </p>
      </div>

      {hasExtras && (
        <div className="space-y-2 pt-3 border-t border-emerald-100">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Trip fare</span>
            <span className="text-zinc-700 tabular-nums">
              {formatMoneyMinor(baseFareMinor, currency)}
            </span>
          </div>
          {actualTollsMinor > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Tolls</span>
              <span className="text-zinc-700 tabular-nums">
                +{formatMoneyMinor(actualTollsMinor, currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {isSettlement && (
        <p className="text-xs text-center font-medium text-emerald-700">
          Hand this amount to your driver now
        </p>
      )}

      {ride.status === 'on_trip' && (
        <p className="text-xs text-center text-emerald-700 font-medium">
          Please have this amount ready when you arrive
        </p>
      )}
    </div>
  );
}
