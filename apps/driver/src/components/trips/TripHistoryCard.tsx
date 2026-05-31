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
  return status.replace(/_/g, ' ');
}

export function TripHistoryCard({ trip, faded = false, onClick }: Props) {
  const isCompleted = trip.status === 'completed';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900',
        'hover:bg-slate-50 dark:hover:bg-slate-800/80',
        faded && 'opacity-80',
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col items-start">
          <span
            className={cn(
              'mb-2 inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold',
              isCompleted
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {statusLabel(trip.status)}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {format(tripWhen(trip), 'MMM d, yyyy • h:mm a')}
          </span>
        </div>
        <span className="text-lg font-bold tabular-nums text-[#004ac6] dark:text-blue-400">
          {formatMoneyMinor(trip.fare_final_minor ?? trip.fare_estimate_minor, trip.currency)}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col items-center pt-1">
          <div
            className={cn(
              'h-4 w-4 rounded-full border-2 bg-white dark:bg-slate-900',
              isCompleted ? 'border-blue-600 dark:border-blue-400' : 'border-slate-300',
            )}
            aria-hidden
          />
          <div className="my-0.5 h-6 w-0.5 bg-slate-200 dark:bg-slate-600" aria-hidden />
          <div
            className={cn(
              'h-4 w-4 rounded-sm',
              isCompleted ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300',
            )}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pickup</p>
            <p className="text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
              {trip.pickup_address ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Drop-off</p>
            <p className="text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
              {trip.dropoff_address ?? '—'}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
