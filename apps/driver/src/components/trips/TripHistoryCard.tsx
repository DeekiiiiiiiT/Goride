import React from 'react';
import { format } from 'date-fns';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { cn } from '@roam/ui';

type Props = {
  trip: RideRequestRow;
  faded?: boolean;
  onClick?: () => void;
};

function tripWhen(trip: RideRequestRow): Date {
  return new Date(trip.completed_at ?? trip.created_at);
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'awaiting_cash_settlement') return 'Collect cash';
  return status.replace(/_/g, ' ');
}

function statusBadgeClass(status: string): string {
  if (status === 'completed') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300';
  }
  if (status === 'awaiting_cash_settlement') {
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300';
  }
  if (status === 'cancelled') {
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

function formatFare(minor: number | null | undefined, currency: string): string {
  return formatMoneyMinor(minor, currency).replace(/^[A-Z]{3}\s+/i, '').trim();
}

function fareSizeClass(amount: string): string {
  const len = amount.replace(/\s/g, '').length;
  if (len > 12) return 'text-xs';
  if (len > 9) return 'text-sm';
  return 'text-base';
}

export function TripHistoryCard({ trip, faded = false, onClick }: Props) {
  const isCompleted = trip.status === 'completed';
  const needsCash = trip.status === 'awaiting_cash_settlement';
  const fare = formatFare(trip.fare_final_minor ?? trip.fare_estimate_minor, trip.currency);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl border bg-white p-3.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all active:scale-[0.99] dark:bg-slate-900',
        needsCash
          ? 'border-amber-300 ring-1 ring-amber-200/80 dark:border-amber-800 dark:ring-amber-900/50'
          : 'border-slate-200 dark:border-slate-700',
        'hover:bg-slate-50 dark:hover:bg-slate-800/80',
        faded && !needsCash && 'opacity-80',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'mb-1 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
              statusBadgeClass(trip.status),
            )}
          >
            {statusLabel(trip.status)}
          </span>
          {needsCash ? (
            <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
              Tap to enter cash received
            </p>
          ) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {format(tripWhen(trip), 'MMM d, yyyy • h:mm a')}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 font-bold tabular-nums leading-tight text-[#004ac6] dark:text-blue-400',
            fareSizeClass(fare),
          )}
        >
          {fare}
        </span>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-0.5">
          <div
            className={cn(
              'h-3 w-3 rounded-full border-2 bg-white dark:bg-slate-900',
              isCompleted ? 'border-blue-600 dark:border-blue-400' : 'border-slate-300',
            )}
            aria-hidden
          />
          <div className="my-0.5 h-4 w-0.5 bg-slate-200 dark:bg-slate-600" aria-hidden />
          <div
            className={cn(
              'h-3 w-3 rounded-sm',
              isCompleted ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300',
            )}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pickup</p>
            <p className="text-xs leading-snug text-slate-900 line-clamp-1 dark:text-slate-100">
              {trip.pickup_address ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Drop-off</p>
            <p className="text-xs leading-snug text-slate-900 line-clamp-1 dark:text-slate-100">
              {trip.dropoff_address ?? '—'}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
