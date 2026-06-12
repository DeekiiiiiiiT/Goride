import React from 'react';
import { Banknote, Receipt } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  computeOutcomeFromRide,
  getCashPaymentCardMode,
  resolveLockedFareMinor,
} from '@roam/types/cashSettlementDisplay';

interface CashPaymentCardProps {
  ride: RideRequestRow;
  /** Settlement screen: show overpay change credit after driver confirms */
  variant?: 'default' | 'settlement_result';
}

export function CashPaymentCard({ ride, variant = 'default' }: CashPaymentCardProps) {
  const mode = getCashPaymentCardMode(ride);
  if (mode === 'hidden') return null;

  const currency = ride.currency ?? 'JMD';
  const lockedMinor = resolveLockedFareMinor(ride);
  const computed = computeOutcomeFromRide(ride);
  const actualTollsMinor = Number(ride.actual_tolls_minor ?? 0);
  const baseFareMinor = Number(ride.fare_estimate_minor ?? 0);
  const hasExtras = actualTollsMinor > 0 && lockedMinor != null;

  if (variant === 'settlement_result' && ride.cash_settlement_outcome) {
    const outcome = ride.cash_settlement_outcome;
    if (outcome === 'exact') {
      return (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-lg font-bold text-emerald-800">Payment confirmed</p>
          <p className="mt-1 text-sm text-emerald-700">Thanks for riding with Roam</p>
        </div>
      );
    }
    if (outcome === 'overpay' && computed) {
      return (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-center space-y-2">
          <p className="text-lg font-bold text-emerald-800">Change credited</p>
          <p className="text-3xl font-bold tabular-nums text-emerald-900">
            {formatMoneyMinor(computed.change_credit_minor, currency)}
          </p>
          <p className="text-sm text-emerald-700">Added to your Roam wallet</p>
        </div>
      );
    }
    return null;
  }

  const title =
    mode === 'awaiting_payment'
      ? 'Pay your driver'
      : mode === 'summary_arrears'
        ? 'Cash payment'
        : 'Amount paid';

  const amountMinor =
    mode === 'summary_paid' || mode === 'summary_arrears'
      ? Number(ride.cash_received_minor ?? lockedMinor ?? 0)
      : lockedMinor;

  if (amountMinor == null || !Number.isFinite(amountMinor)) return null;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          {mode === 'summary_arrears' ? (
            <Receipt className="w-5 h-5 text-amber-600" />
          ) : (
            <Banknote className="w-5 h-5 text-emerald-600" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Cash Payment
          </p>
          <p className="text-xs text-zinc-500">{title}</p>
        </div>
      </div>

      <div className="text-center py-3">
        <p className="text-4xl font-bold tabular-nums text-zinc-900">
          {formatMoneyMinor(amountMinor, currency)}
        </p>
        {mode === 'awaiting_payment' && lockedMinor != null && (
          <p className="mt-1 text-xs text-zinc-500">Fare due at drop-off</p>
        )}
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

      {mode === 'awaiting_payment' && (
        <p className="text-xs text-center font-medium text-emerald-700">
          Hand this amount to your driver now
        </p>
      )}
    </div>
  );
}
