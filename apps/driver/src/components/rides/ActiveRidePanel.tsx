import React, { useState, useEffect } from 'react';
import { ExternalLink, Loader2, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { openExternalNavigation } from '../../utils/rideNavigation';
import { statusTitle } from './rideDispatchUtils';
import { SwipeToStart } from './SwipeToStart';
import { DriverGpsBadge } from './DriverGpsBadge';
import { PinEntryModal } from './PinEntryModal';

interface WaitTimeInfo {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
  wait_time_current_fee_minor?: number;
  wait_time_billable_minutes?: number;
  wait_time_rate_per_min_minor?: number;
}

interface ActiveRidePanelProps {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
  compact?: boolean;
  trackingError?: string | null;
  gpsAccuracyM?: number | null;
  isTracking?: boolean;
  waitTimeInfo?: WaitTimeInfo | null;
}

const CANCEL_REASONS = [
  { value: 'rider_no_show', label: 'Rider no-show' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'vehicle_issue', label: 'Vehicle issue' },
  { value: 'other', label: 'Other' },
];

function formatSeconds(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.round(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

function WaitTimeDisplay({ waitTime }: { waitTime: WaitTimeInfo }) {
  const [remainingSecs, setRemainingSecs] = useState(waitTime.wait_time_grace_remaining_seconds ?? 0);
  
  useEffect(() => {
    setRemainingSecs(waitTime.wait_time_grace_remaining_seconds ?? 0);
  }, [waitTime.wait_time_grace_remaining_seconds]);
  
  useEffect(() => {
    if (remainingSecs <= 0) return;
    const interval = setInterval(() => {
      setRemainingSecs(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSecs > 0]);
  
  if (!waitTime.wait_time_charge_enabled) return null;
  
  if (waitTime.wait_time_grace_expired) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">Wait time fee active</p>
          <p className="text-xs text-amber-800 dark:text-amber-200 font-semibold tabular-nums">
            +{formatMoneyMinor(waitTime.wait_time_current_fee_minor ?? 0, 'JMD')}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
      <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Grace period remaining</p>
        <p className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {formatSeconds(remainingSecs)}
        </p>
      </div>
    </div>
  );
}

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
  waitTimeInfo,
}: ActiveRidePanelProps) {
  const pinVerificationRequired = Boolean(ride.pin_verification_pending);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0].value);
  const [advancing, setAdvancing] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const navTarget = navTargetForStatus(ride);
  const completeSuggested = Boolean(ride.complete_suggested_at);

  const runAdvance = async (status: RideRequestRow['status'], reason?: string, pin?: string) => {
    setAdvancing(true);
    try {
      await onAdvance(status, reason, pin);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transition failed';
      if (status === 'on_trip' && msg.toLowerCase().includes('pin')) {
        setPinModalOpen(true);
        setPinError(msg);
      }
      throw e;
    } finally {
      setAdvancing(false);
      setCancelOpen(false);
    }
  };

  const handleStartTrip = () => {
    if (pinVerificationRequired && !ride.pin_verified_at) {
      setPinModalOpen(true);
      setPinError(null);
    } else {
      void runAdvance('on_trip');
    }
  };

  const handlePinSubmit = async (pin: string) => {
    setPinError(null);
    try {
      await onAdvance('on_trip', undefined, pin);
      setPinModalOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'PIN verification failed';
      if (msg.includes('mismatch')) {
        setPinError('Incorrect PIN. Please try again.');
      } else {
        setPinError(msg);
      }
      throw e;
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
            {waitTimeInfo && <WaitTimeDisplay waitTime={waitTimeInfo} />}
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
          <>
            {waitTimeInfo && <WaitTimeDisplay waitTime={waitTimeInfo} />}
            {pinVerificationRequired && !ride.pin_verified_at ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  PIN verification required to start trip
                </p>
              </div>
            ) : null}
            <SwipeToStart
              label={pinVerificationRequired && !ride.pin_verified_at ? "Swipe to verify PIN" : "Swipe to start trip"}
              disabled={advancing}
              onComplete={handleStartTrip}
            />
          </>
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

      <PinEntryModal
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={handlePinSubmit}
        error={pinError}
      />
    </section>
  );
}
