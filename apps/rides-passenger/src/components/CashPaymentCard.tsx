import React from 'react';
import { Banknote, Receipt } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  computeOutcomeFromRide,
  getCashPaymentCardMode,
  resolveLockedFareMinor,
} from '@roam/types/cashSettlementDisplay';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
} from '@/lib/passengerTheme';

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
        <div
          className="cash-settlement-glass rounded-[1.5rem] p-8 text-center"
          style={{ borderColor: 'color-mix(in srgb, var(--passenger-primary-container) 20%, transparent)' }}
        >
          <p className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            Payment confirmed
          </p>
          <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Thanks for riding with Roam
          </p>
        </div>
      );
    }
    if (outcome === 'overpay' && computed) {
      return (
        <div
          className="cash-settlement-glass space-y-2 rounded-[1.5rem] p-8 text-center"
          style={{ borderColor: 'color-mix(in srgb, var(--passenger-primary-container) 20%, transparent)' }}
        >
          <p className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            Change credited
          </p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
            {formatMoneyMinor(computed.change_credit_minor, currency)}
          </p>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Added to your Roam wallet
          </p>
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
    <div
      className="space-y-4 rounded-3xl border p-5"
      style={{
        background: `linear-gradient(to bottom right, color-mix(in srgb, var(--passenger-primary-fixed) 35%, var(--passenger-surface)), var(--passenger-surface))`,
        borderColor: 'color-mix(in srgb, var(--passenger-primary-container) 20%, transparent)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: PRIMARY_FIXED }}
        >
          {mode === 'summary_arrears' ? (
            <Receipt className="h-5 w-5" style={{ color: PRIMARY_CONTAINER }} />
          ) : (
            <Banknote className="h-5 w-5" style={{ color: PRIMARY }} />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: PRIMARY }}>
            Cash Payment
          </p>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {title}
          </p>
        </div>
      </div>

      <div className="py-3 text-center">
        <p className="text-4xl font-bold tabular-nums" style={{ color: ON_SURFACE }}>
          {formatMoneyMinor(amountMinor, currency)}
        </p>
        {mode === 'awaiting_payment' && lockedMinor != null && (
          <p className="mt-1 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            Fare due at drop-off
          </p>
        )}
      </div>

      {hasExtras && (
        <div
          className="space-y-2 border-t pt-3"
          style={{ borderColor: OUTLINE_VARIANT }}
        >
          <div className="flex justify-between text-sm">
            <span style={{ color: ON_SURFACE_VARIANT }}>Trip fare</span>
            <span className="tabular-nums" style={{ color: ON_SURFACE }}>
              {formatMoneyMinor(baseFareMinor, currency)}
            </span>
          </div>
          {actualTollsMinor > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: ON_SURFACE_VARIANT }}>Tolls</span>
              <span className="tabular-nums" style={{ color: ON_SURFACE }}>
                +{formatMoneyMinor(actualTollsMinor, currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {mode === 'awaiting_payment' && (
        <p className="text-center text-xs font-medium" style={{ color: PRIMARY }}>
          Hand this amount to your driver now
        </p>
      )}
    </div>
  );
}
