import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, X } from 'lucide-react';
import type { WalletTransactionDto } from '@roam/types/rides';
import { formatMoneyMinorPlain } from '@roam/types/rides';
import { ridesGetRequest } from '@/services/ridesEdge';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SECONDARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  transaction: WalletTransactionDto | null;
  onClose: () => void;
  onViewTrip?: (rideId: string) => void;
};

function formatDetailDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function txIsCredit(tx: WalletTransactionDto): boolean {
  if (tx.kind === 'journal') return tx.is_credit === true;
  if (tx.kind === 'topup') return true;
  return false;
}

function detailDescription(tx: WalletTransactionDto): string {
  if (tx.breakdown && tx.breakdown.length > 1) {
    return 'This trip was paid using multiple methods.';
  }
  if (tx.entry_type === 'cash_trip_arrears') {
    return 'Outstanding balance from a cash trip where the full fare was not paid.';
  }
  if (tx.entry_type === 'card_shortfall_payment') {
    return 'Payment applied to clear an outstanding balance.';
  }
  if (tx.entry_type === 'change_paid_from_digital') {
    return 'Change from a cash trip was credited to your wallet.';
  }
  if (tx.entry_type === 'cash_change_credit') {
    return 'Overpayment from a cash trip was added to your wallet.';
  }
  if (tx.entry_type === 'wallet_topup') {
    return 'Funds added to your wallet.';
  }
  if (tx.ride_id) {
    return 'Payment for a completed trip.';
  }
  return 'Wallet activity on your account.';
}

export function WalletTransactionDetailSheet({ transaction, onClose, onViewTrip }: Props) {
  const open = transaction != null;
  const positive = transaction ? txIsCredit(transaction) : false;
  const amountMinor = transaction ? Number(transaction.amount_minor) : 0;

  const { data: rideResponse, isLoading: rideLoading } = useQuery({
    queryKey: ['wallet-tx-ride', transaction?.ride_id],
    queryFn: () => ridesGetRequest(transaction!.ride_id!),
    enabled: open && Boolean(transaction?.ride_id),
    staleTime: 60_000,
  });

  const ride = rideResponse?.ride;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !transaction) return null;

  const amountLabel = positive
    ? `+${formatMoneyMinorPlain(amountMinor)}`
    : `-${formatMoneyMinorPlain(amountMinor)}`;

  const pickup = ride?.pickup_address?.trim();
  const dropoff = ride?.dropoff_address?.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close transaction details"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-2xl bg-white px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] safe-x max-h-[min(85dvh,640px)] overflow-y-auto animate-in slide-in-from-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-tx-detail-title"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 id="wallet-tx-detail-title" className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
            Transaction
          </h3>
          <button
            type="button"
            className="-mr-2 p-2 transition-colors"
            style={{ color: ON_SURFACE_VARIANT }}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 text-center">
          <p
            className="text-3xl font-bold tabular-nums tracking-tight"
            style={{ color: positive ? PRIMARY : ON_SURFACE }}
          >
            {amountLabel}
          </p>
          <p className="mt-2 text-base font-semibold" style={{ color: ON_SURFACE }}>
            {transaction.title}
          </p>
          <p className="mt-1 text-sm" style={{ color: SECONDARY }}>
            {formatDetailDate(transaction.date)}
          </p>
        </div>

        <div
          className="mb-4 rounded-2xl p-4 text-sm"
          style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE_VARIANT }}
        >
          {detailDescription(transaction)}
        </div>

        {transaction.breakdown && transaction.breakdown.length > 1 ? (
          <div className="mb-4 overflow-hidden rounded-2xl" style={{ border: `1px solid ${OUTLINE_VARIANT}33` }}>
            <p className="px-4 pt-4 text-xs font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
              Payment breakdown
            </p>
            {transaction.breakdown.map((line) => (
              <div
                key={`${line.label}-${line.amount_minor}-${line.entry_type ?? ''}`}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: `1px solid ${OUTLINE_VARIANT}1a` }}
              >
                <span className="font-medium" style={{ color: ON_SURFACE }}>
                  {line.label}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
                  {formatMoneyMinorPlain(line.amount_minor)}
                </span>
              </div>
            ))}
            <div
              className="flex items-center justify-between px-4 py-3 font-semibold"
              style={{ borderTop: `1px solid ${OUTLINE_VARIANT}33`, backgroundColor: SURFACE_LOWEST }}
            >
              <span style={{ color: ON_SURFACE }}>Total</span>
              <span className="tabular-nums" style={{ color: ON_SURFACE }}>
                {formatMoneyMinorPlain(amountMinor)}
              </span>
            </div>
          </div>
        ) : null}

        {transaction.ride_id ? (
          <div className="mb-4 overflow-hidden rounded-2xl" style={{ border: `1px solid ${OUTLINE_VARIANT}33` }}>
            {rideLoading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading trip…
              </div>
            ) : ride ? (
              <div className="space-y-3 p-4 text-sm">
                {pickup ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
                      Pickup
                    </p>
                    <p className="mt-0.5 font-medium" style={{ color: ON_SURFACE }}>
                      {pickup}
                    </p>
                  </div>
                ) : null}
                {dropoff ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
                      Dropoff
                    </p>
                    <p className="mt-0.5 font-medium" style={{ color: ON_SURFACE }}>
                      {dropoff}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (!transaction.ride_id) return;
                onClose();
                onViewTrip?.(transaction.ride_id);
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors passenger-row-hover"
              style={{ borderTop: `1px solid ${OUTLINE_VARIANT}1a` }}
            >
              <span className="font-semibold" style={{ color: PRIMARY }}>
                View trip
              </span>
              <ChevronRight className="h-5 w-5" style={{ color: PRIMARY }} aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="rounded-2xl px-4 py-3 text-xs" style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE_VARIANT }}>
          <p>
            <span className="font-semibold" style={{ color: ON_SURFACE }}>Currency:</span>{' '}
            {transaction.currency}
          </p>
          {transaction.entry_type ? (
            <p className="mt-1">
              <span className="font-semibold" style={{ color: ON_SURFACE }}>Type:</span>{' '}
              {transaction.entry_type.replace(/_/g, ' ')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
