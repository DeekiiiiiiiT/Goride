import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Clock, AlertCircle } from 'lucide-react';
import type { RideRequestStatus, RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@roam/ui';
import { supabase } from '@roam/auth-client';
import { LiveRideMap } from '@/components/LiveRideMap';
import { ridesCancelRequest, ridesGetLive, ridesGetRequest } from '@/services/ridesEdge';

function statusLabel(s: RideRequestStatus): string {
  switch (s) {
    case 'matching':
      return 'Finding a nearby driver…';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'driver_en_route_pickup':
      return 'Driver is on the way';
    case 'driver_arrived_pickup':
      return 'Driver has arrived';
    case 'on_trip':
      return 'On trip';
    case 'completed':
      return 'Trip completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return s;
  }
}

const CANCELLABLE_STATUSES: RideRequestStatus[] = [
  'matching',
  'driver_assigned',
  'driver_en_route_pickup',
];

const LIVE_MAP_STATUSES: RideRequestStatus[] = [
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
];

function isCancellable(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && CANCELLABLE_STATUSES.includes(status));
}

function showLiveMap(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && LIVE_MAP_STATUSES.includes(status));
}

const RIDE_SYNC_MS = 5_000;
const RIDE_ARRIVED_SYNC_MS = 2_000;

function normalizeRiderPin(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return /^\d{4}$/.test(s) ? s : null;
}

interface WaitTimeInfo {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
  wait_time_current_fee_minor?: number;
  wait_time_billable_minutes?: number;
  wait_time_rate_per_min_minor?: number;
}

function formatSeconds(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.round(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

const RIDER_PIN_STATUSES: RideRequestRow['status'][] = [
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
];

function RiderPinDisplay({ pin }: { pin: string }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900 border border-emerald-200 dark:border-emerald-800 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
          <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Your trip PIN
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Tell your driver this code to start the trip
          </p>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {pin.split('').map((digit, i) => (
          <span
            key={i}
            className="w-12 h-14 flex items-center justify-center text-2xl font-bold text-zinc-900 dark:text-white bg-white dark:bg-slate-800 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 shadow-sm"
          >
            {digit}
          </span>
        ))}
      </div>
      <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
        The driver will ask for this code before starting your trip
      </p>
    </div>
  );
}

function RiderWaitTimeDisplay({ waitTime }: { waitTime: WaitTimeInfo }) {
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
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-800 font-medium">Wait time fee active</p>
          <p className="text-xs text-amber-700">
            Please meet your driver promptly. Current fee: {formatMoneyMinor(waitTime.wait_time_current_fee_minor ?? 0, 'JMD')}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200">
      <Clock className="w-5 h-5 text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-700 font-medium">Driver waiting</p>
        <p className="text-xs text-zinc-500">
          Grace period: {formatSeconds(remainingSecs)} remaining
        </p>
      </div>
    </div>
  );
}

export default function RidePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const prevStatusRef = useRef<RideRequestStatus | null>(null);

  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ['ride', id],
    enabled: Boolean(id),
    queryFn: () => ridesGetRequest(id!),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const st = q.state.data?.ride.status;
      if (!st || st === 'completed' || st === 'cancelled') return false;
      if (st === 'driver_arrived_pickup') return RIDE_ARRIVED_SYNC_MS;
      return RIDE_SYNC_MS;
    },
  });

  const ride = data?.ride;
  const waitTime = data?.wait_time as WaitTimeInfo | null | undefined;
  const [displayPin, setDisplayPin] = useState<string | null>(null);

  useEffect(() => {
    if (!ride) return;
    if (ride.status === 'on_trip' || ride.status === 'completed' || ride.pin_verified_at) {
      setDisplayPin(null);
      return;
    }
    if (!RIDER_PIN_STATUSES.includes(ride.status)) return;
    const pin = normalizeRiderPin(data?.rider_pin ?? ride.verification_pin);
    if (pin) setDisplayPin(pin);
  }, [data?.rider_pin, ride?.verification_pin, ride?.status, ride?.pin_verified_at, ride]);

  const { data: liveData } = useQuery({
    queryKey: ['ride-live', id],
    enabled: Boolean(id && ride && showLiveMap(ride.status)),
    queryFn: () => ridesGetLive(id!),
    refetchInterval: RIDE_SYNC_MS,
  });

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'Failed to load ride');
  }, [error]);

  useEffect(() => {
    if (!ride) return;
    if (
      ride.status === 'driver_arrived_pickup' &&
      prevStatusRef.current !== 'driver_arrived_pickup'
    ) {
      toast.success('Your driver has arrived', {
        description: displayPin || ride.verification_pin
          ? 'Share your 4-digit PIN when they ask for it.'
          : undefined,
      });
    }
    prevStatusRef.current = ride.status;
  }, [ride?.status, ride?.verification_pin, displayPin]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`rider-ride-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'rides',
          table: 'ride_requests',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as RideRequestRow;
          if (row?.id) {
            queryClient.setQueryData(
              ['ride', id],
              (prev: { ride: RideRequestRow; offers: unknown[] } | undefined) => {
                if (!prev) return prev;
                const mergedRide = { ...prev.ride, ...row };
                const mergedPin = normalizeRiderPin(row.verification_pin ?? prev.ride.verification_pin);
                if (mergedPin) mergedRide.verification_pin = mergedPin;
                return { ...prev, ride: mergedRide };
              },
            );
          }
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ['ride-live', id] });
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [id, refetch, queryClient]);

  const driverLocation = useMemo(() => {
    const fromLive = liveData?.driver_location;
    if (fromLive?.lat != null && fromLive?.lng != null) {
      return { lat: fromLive.lat, lng: fromLive.lng };
    }
    if (ride?.last_driver_lat != null && ride?.last_driver_lng != null) {
      return { lat: ride.last_driver_lat, lng: ride.last_driver_lng };
    }
    return null;
  }, [liveData, ride?.last_driver_lat, ride?.last_driver_lng]);

  const performCancel = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await ridesCancelRequest(id, 'rider_changed_plans');
      toast.success('Ride cancelled');
      setCancelDialogOpen(false);
      setLeaveDialogOpen(false);
      navigate('/', { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const handleBack = () => {
    if (!ride || !isCancellable(ride.status)) {
      navigate('/');
      return;
    }
    setLeaveDialogOpen(true);
  };

  if (!id) return null;

  const cancelCopy =
    ride?.status === 'driver_en_route_pickup'
      ? 'Your driver is already on the way. Cancelling now may affect their earnings.'
      : ride?.status === 'matching'
        ? 'Your driver search will stop and this booking will be marked as cancelled.'
        : 'This ride will be cancelled. You can book again from home.';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/90 backdrop-blur-md safe-t">
        <div className="max-w-lg mx-auto safe-x px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="btn-touch inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 hover:bg-zinc-50 touch-manipulation active:scale-[0.98]"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-800" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-900 truncate">Live ride</p>
            <p className="text-xs text-zinc-500 truncate">Live updates when driver is assigned</p>
          </div>
          {isFetching && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Syncing
            </span>
          )}
        </div>
      </header>

      {ride && showLiveMap(ride.status) && (
        <LiveRideMap
          pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
          dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
          encodedPolyline={ride.route_polyline_encoded}
          driverLocation={driverLocation}
          driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
          statusLabel={statusLabel(ride.status)}
        />
      )}

      <main className="flex-1 max-w-lg mx-auto w-full safe-x safe-b px-4 py-6 space-y-5">
        {!ride ? (
          <div className="rounded-3xl bg-white ring-1 ring-zinc-200/90 p-10 flex flex-col items-center gap-4 shadow-lg shadow-zinc-900/5">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" aria-hidden />
            <p className="text-zinc-600 text-base font-medium">Loading your ride…</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-white border border-zinc-200/90 p-5 sm:p-6 shadow-xl shadow-zinc-900/6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </span>
                {(ride.status === 'matching' || ride.status === 'driver_en_route_pickup') && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                )}
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-zinc-900 leading-snug">
                {statusLabel(ride.status)}
              </p>
              <div className="space-y-3 pt-1 border-t border-zinc-100">
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Pickup</p>
                  <p className="text-base text-zinc-700 leading-relaxed">{ride.pickup_address ?? 'Pickup'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Drop-off</p>
                  <p className="text-base text-zinc-700 leading-relaxed">{ride.dropoff_address ?? 'Drop-off'}</p>
                </div>
              </div>
            </div>

            {RIDER_PIN_STATUSES.includes(ride.status) && !ride.pin_verified_at && (
              displayPin ? (
                <RiderPinDisplay pin={displayPin} />
              ) : ride.status === 'driver_arrived_pickup' ? (
                <div className="rounded-3xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" aria-hidden />
                  <p className="text-sm font-medium text-emerald-900">Preparing your trip PIN…</p>
                  <p className="text-xs text-emerald-700">Share this code with your driver when it appears</p>
                </div>
              ) : null
            )}

            {ride.status === 'driver_arrived_pickup' && waitTime && (
              <RiderWaitTimeDisplay waitTime={waitTime} />
            )}

            {isCancellable(ride.status) && (
              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                disabled={cancelling}
                className="btn-touch w-full rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 touch-manipulation active:scale-[0.99] disabled:opacity-60"
              >
                {ride.status === 'matching' ? 'Cancel search' : 'Cancel ride'}
              </button>
            )}

            {ride.status === 'on_trip' && (
              <p className="text-sm text-zinc-500 text-center px-2">
                Need to stop the trip? Contact Roam support — in-trip cancellation is disabled for safety.
              </p>
            )}

            {ride.status === 'completed' && (
              <div className="rounded-3xl bg-white border border-emerald-100 p-5 sm:p-6 shadow-xl shadow-emerald-900/10 space-y-4 bg-gradient-to-b from-emerald-50/50 to-white">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Receipt
                </div>
                <div className="flex justify-between items-baseline gap-4">
                  <span className="text-base text-zinc-600">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-zinc-900">
                    {formatMoneyMinor(
                      ride.fare_final_minor ?? ride.fare_estimate_minor,
                      ride.currency ?? 'JMD',
                    )}
                  </span>
                </div>
                <Link
                  to="/"
                  className="btn-touch flex items-center justify-center w-full rounded-2xl bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Book another ride
                </Link>
              </div>
            )}

            {ride.status === 'cancelled' && (
              <div className="rounded-3xl bg-white border border-zinc-200 p-6 text-center space-y-4 shadow-lg shadow-zinc-900/5">
                <p className="text-zinc-700 text-base leading-relaxed">
                  This ride was cancelled
                  {ride.cancel_reason ? `: ${ride.cancel_reason}` : '.'}
                </p>
                <Link
                  to="/"
                  className="btn-touch inline-flex items-center justify-center w-full rounded-2xl bg-zinc-900 text-white text-base font-semibold hover:bg-zinc-800"
                >
                  Back to home
                </Link>
              </div>
            )}
          </>
        )}
      </main>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="rounded-3xl border-zinc-200 max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ride?</AlertDialogTitle>
            <AlertDialogDescription>{cancelCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel disabled={cancelling} className="rounded-2xl mt-0">
              Keep waiting
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void performCancel();
              }}
              className="rounded-2xl bg-zinc-900 hover:bg-zinc-800"
            >
              {cancelling ? 'Cancelling…' : 'Yes, cancel ride'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent className="rounded-3xl border-zinc-200 max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel before leaving?</AlertDialogTitle>
            <AlertDialogDescription>
              This ride is still active. Going home without cancelling keeps it open for your driver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel disabled={cancelling} className="rounded-2xl mt-0">
              Keep ride
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void performCancel();
              }}
              className="rounded-2xl bg-zinc-900 hover:bg-zinc-800"
            >
              {cancelling ? 'Cancelling…' : 'Cancel ride & go home'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
