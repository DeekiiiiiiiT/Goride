import React from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { statusTitle } from './rideDispatchUtils';

interface ActiveRidePanelProps {
  ride: RideRequestRow;
  onAdvance: (status: RideRequestRow['status']) => void;
  compact?: boolean;
}

export function ActiveRidePanel({ ride, onAdvance, compact = false }: ActiveRidePanelProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <h2
        className={`font-semibold uppercase tracking-wide text-slate-500 ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        Active ride
      </h2>
      <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{statusTitle(ride)}</p>
      <p className={`text-slate-600 dark:text-slate-300 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {ride.pickup_address ?? 'Pickup'}
      </p>
      <p className={`text-slate-600 dark:text-slate-300 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {ride.dropoff_address ?? 'Drop-off'}
      </p>
      <p
        className={`font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        Fare: {formatMoneyMinor(ride.fare_estimate_minor, ride.currency ?? 'JMD')}
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {ride.status === 'driver_assigned' && (
          <button
            type="button"
            className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
            onClick={() => onAdvance('driver_en_route_pickup')}
          >
            Start navigation
          </button>
        )}
        {ride.status === 'driver_en_route_pickup' && (
          <button
            type="button"
            className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
            onClick={() => onAdvance('driver_arrived_pickup')}
          >
            Arrived at pickup
          </button>
        )}
        {ride.status === 'driver_arrived_pickup' && (
          <button
            type="button"
            className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
            onClick={() => onAdvance('on_trip')}
          >
            Start trip
          </button>
        )}
        {ride.status === 'on_trip' && (
          <button
            type="button"
            className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-medium"
            onClick={() => onAdvance('completed')}
          >
            Complete trip
          </button>
        )}
      </div>
    </section>
  );
}
