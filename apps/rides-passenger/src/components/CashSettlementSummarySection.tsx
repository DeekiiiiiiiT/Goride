import React from 'react';
import { Link } from 'react-router-dom';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  computeOutcomeFromRide,
  isCashRide,
  resolveLockedFareMinor,
} from '@roam/types/cashSettlementDisplay';
import { CashPaymentCard } from '@/components/CashPaymentCard';

type Props = {
  ride: RideRequestRow;
};

export function CashSettlementSummarySection({ ride }: Props) {
  if (!isCashRide(ride) || !ride.cash_settlement_outcome) return null;

  const currency = ride.currency ?? 'JMD';
  const computed = computeOutcomeFromRide(ride);
  const owed = resolveLockedFareMinor(ride);
  const received = Number(ride.cash_received_minor ?? 0);
  const outcome = ride.cash_settlement_outcome;

  if (outcome === 'exact') {
    return (
      <div className="px-4">
        <p className="mb-2 text-center text-sm text-emerald-700 font-medium">Paid in cash</p>
        <CashPaymentCard ride={ride} />
      </div>
    );
  }

  if (outcome === 'overpay') {
    const changeMinor = computed?.change_credit_minor ?? Math.max(0, received - (owed ?? 0));
    return (
      <div className="px-4">
        <CashPaymentCard ride={ride} />
        {changeMinor > 0 ? (
          <p className="mt-2 text-center text-sm font-semibold text-emerald-700">
            {formatMoneyMinor(changeMinor, currency)} credited to your Roam wallet
          </p>
        ) : (
          <p className="mt-2 text-center text-sm text-emerald-700">
            Any change due is in your Roam wallet.
          </p>
        )}
      </div>
    );
  }

  const arrears = computed?.arrears_minor ?? 0;

  return (
    <div className="mx-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-900">
        {outcome === 'unpaid' ? 'Trip unpaid' : 'Partial cash payment'}
      </p>
      {owed != null && (
        <div className="flex justify-between text-sm text-amber-900/90">
          <span>Fare owed</span>
          <span className="tabular-nums font-medium">{formatMoneyMinor(owed, currency)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm text-amber-900/90">
        <span>Cash received</span>
        <span className="tabular-nums font-medium">{formatMoneyMinor(received, currency)}</span>
      </div>
      {arrears > 0 && (
        <div className="flex justify-between text-sm font-bold text-amber-950 border-t border-amber-200/80 pt-2">
          <span>Outstanding balance</span>
          <span className="tabular-nums">{formatMoneyMinor(arrears, currency)}</span>
        </div>
      )}
      <p className="text-xs text-amber-800 leading-relaxed">
        This amount has been added to your wallet balance.{' '}
        <Link to="/wallet" className="font-semibold underline">
          Open Wallet
        </Link>{' '}
        to settle before your next cash trip.
      </p>
    </div>
  );
}
