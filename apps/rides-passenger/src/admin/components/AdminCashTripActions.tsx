import React from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { isCashRide } from '@roam/types/cashSettlementDisplay';

type Props = {
  ride: RideRequestRow;
  busy: boolean;
  onRelease: (ride: RideRequestRow) => void;
  onSettle: (ride: RideRequestRow) => void;
  onCompleteCard: (ride: RideRequestRow) => void;
};

export function AdminCashTripActions({
  ride,
  busy,
  onRelease,
  onSettle,
  onCompleteCard,
}: Props) {
  const cash = isCashRide(ride);

  if (cash && ride.status === 'on_trip') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onRelease(ride);
        }}
        className="rounded-md border border-amber-700/60 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
      >
        Release to cash settlement
      </button>
    );
  }

  if (cash && ride.status === 'awaiting_cash_settlement') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onSettle(ride);
        }}
        className="rounded-md border border-emerald-700/60 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
      >
        Settle & complete
      </button>
    );
  }

  if (!cash && ride.status === 'on_trip') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onCompleteCard(ride);
        }}
        className="rounded-md border border-emerald-700/60 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
      >
        Complete
      </button>
    );
  }

  return null;
}
