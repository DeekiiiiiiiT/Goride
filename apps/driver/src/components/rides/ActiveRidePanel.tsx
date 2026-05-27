import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { openExternalNavigation } from '../../utils/rideNavigation';
import { statusTitle } from './rideDispatchUtils';
import { SwipeToStart } from './SwipeToStart';
import { DriverGpsBadge } from './DriverGpsBadge';

interface ActiveRidePanelProps {
  ride: RideRequestRow;
  onAdvance: (status: RideRequestRow['status'], reason?: string) => void;
  compact?: boolean;
  trackingError?: string | null;
  gpsAccuracyM?: number | null;
  isTracking?: boolean;
}

const CANCEL_REASONS = [
  { value: 'rider_no_show', label: 'Rider no-show' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'vehicle_issue', label: 'Vehicle issue' },
  { value: 'other', label: 'Other' },
];

function navTargetForStatus(ride: RideRequestRow): { lat: number; lng: number; address?: string | null } | null {
  if (ride.status === 'on_trip' || ride.status === 'driver_arrived_pickup') {
    return {
      lat: ride.dropoff_lat,
      lng: ride.dropoff_lng,
      address: ride.dropoff_address,
    };
  }
  if (
    ride.status === 'driver_assigned' ||
    ride.status === 'driver_en_route_pickup'
  ) {
    return {
      lat: ride.pickup_lat,
      lng: ride.pickup_lng,
      address: ride.pickup_address,
    };
  }
  return null;
}

export function ActiveRidePanel({
  ride,
  onAdvance,
  compact = false,
  trackingError,
  gpsAccuracyM,
  isTracking,
}: ActiveRidePanelProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0].value);
  const [advancing, setAdvancing] = useState(false);

  const navTarget = navTargetForStatus(ride);
  const completeSuggested = Boolean(ride.complete_suggested_at);

  const runAdvance = async (status: RideRequestRow['status'], reason?: string) => {
    setAdvancing(true);
    try {
      await onAdvance(status, reason);
    } finally {
      setAdvancing(false);
      setCancelOpen(false);
    }
  };

  return (
    <section
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          className={`font-semibold uppercase tracking-wide text-slate-500 ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          Active ride
        </h2>
        <DriverGpsBadge accuracyMeters={gpsAccuracyM ?? null} />
      </div>

      <p className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{statusTitle(ride)}</p>

      {trackingError && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-1.5">
          {trackingError}
        </p>
      )}

      {isTracking && !trackingError && ride.status !== 'driver_assigned' && (
        <p className="text-[11px] text-slate-500">Live GPS active — keep this app open during the trip.</p>
      )}

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

      <div className="flex flex-col gap-2 pt-1">
        {ride.status === 'driver_en_route_pickup' && (
          <>
            <p className="text-[11px] text-slate-500">Arrival detected automatically when you reach pickup.</p>
            <button
              type="button"
              disabled={advancing}
              className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium"
              onClick={() => void runAdvance('driver_arrived_pickup')}
            >
              {advancing ? 'Updating…' : "Manual: I've arrived"}
            </button>
          </>
        )}

        {ride.status === 'driver_arrived_pickup' && (
          <SwipeToStart
            label="Swipe to start trip"
            disabled={advancing}
            onComplete={() => void runAdvance('on_trip')}
          />
        )}

        {ride.status === 'on_trip' && (
          <>
            {completeSuggested && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                You&apos;re at the drop-off — confirm to complete.
              </p>
            )}
            <button
              type="button"
              disabled={advancing}
              className="rounded-xl bg-emerald-600 text-white px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
              onClick={() => void runAdvance('completed')}
            >
              {advancing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {completeSuggested ? 'Complete trip' : 'Complete trip'}
            </button>
          </>
        )}

        {navTarget && (
          <button
            type="button"
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium inline-flex items-center justify-center gap-1.5"
            onClick={() => openExternalNavigation(navTarget)}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            Open in Maps
          </button>
        )}

        {!['completed', 'cancelled', 'matching'].includes(ride.status) && (
          <>
            {!cancelOpen ? (
              <button
                type="button"
                className="text-[11px] text-red-600 dark:text-red-400 font-medium py-1"
                onClick={() => setCancelOpen(true)}
              >
                Cancel ride
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 p-2.5 space-y-2">
                <p className="text-[11px] font-medium text-red-700 dark:text-red-400">Cancel this ride?</p>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-xs"
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 text-xs"
                    onClick={() => setCancelOpen(false)}
                  >
                    Keep ride
                  </button>
                  <button
                    type="button"
                    disabled={advancing}
                    className="flex-1 rounded-lg bg-red-600 text-white py-1.5 text-xs font-medium"
                    onClick={() => void runAdvance('cancelled', cancelReason)}
                  >
                    Confirm cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
