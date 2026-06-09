import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Clock, Share2 } from 'lucide-react';
import type { RideRequestStatus, RideRequestRow } from '@roam/types/rides';
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
import { LiveRideView } from '@/components/LiveRideView';
import { BookerTrackingView } from '@/components/BookerTrackingView';
import { RideCancelledView } from '@/components/RideCancelledView';
import { TripInProgressView } from '@/components/TripInProgressView';
import { TripSummaryView } from '@/components/TripSummaryView';
import { ridesCancelRequest, ridesGetLive, ridesGetRequest } from '@/services/ridesEdge';
import { createPassengerInvite } from '@/services/contactsEdge';
import { RiderConnectionBanner } from '@/components/RiderConnectionBanner';
import { useRiderOnline } from '@/hooks/useRiderOnline';
import {
  clearRiderRideCache,
  persistRiderRideCache,
  readRiderRideCache,
} from '@/utils/riderActiveRideSession';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import { useBookerTrackingOptional } from '@/contexts/BookerTrackingContext';
import { persistMinimizedRide } from '@/lib/bookerTracking';

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

const PICKUP_LIVE_STATUSES: RideRequestStatus[] = [
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
];

const TRIP_IN_PROGRESS_STATUSES: RideRequestStatus[] = ['on_trip'];

const LIVE_TRACKING_STATUSES: RideRequestStatus[] = [
  ...PICKUP_LIVE_STATUSES,
  ...TRIP_IN_PROGRESS_STATUSES,
];

function isPickupLive(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && PICKUP_LIVE_STATUSES.includes(status));
}

function isTripInProgress(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && TRIP_IN_PROGRESS_STATUSES.includes(status));
}

function showLiveTracking(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && LIVE_TRACKING_STATUSES.includes(status));
}

function getCancelCopy(status: RideRequestStatus | undefined): string {
  if (status === 'driver_en_route_pickup') {
    return 'Your driver is already on the way. Cancelling now may affect their earnings.';
  }
  if (status === 'matching') {
    return 'Your driver search will stop and this booking will be marked as cancelled.';
  }
  return 'This ride will be cancelled. You can book again from home.';
}

const RIDE_SYNC_MS = 5_000;
const RIDE_ARRIVED_SYNC_MS = 2_000;

import {
  isRiderPinTripPhase,
  resolveRiderPinDisplay,
  shouldShowRiderPin,
} from '@/lib/riderPin';

interface WaitTimeInfo {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
}

function formatSeconds(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.round(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

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
  if (waitTime.wait_time_grace_expired || remainingSecs <= 0) return null;

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
  const [sharingInvite, setSharingInvite] = useState(false);
  const prevStatusRef = useRef<RideRequestStatus | null>(null);
  const { isOnline, justReconnected } = useRiderOnline();
  const bookerTracking = useBookerTrackingOptional();
  const trackingMode = bookerTracking?.mode ?? 'full';
  const heavyTrackingEnabled = trackingMode === 'full';

  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ['ride', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await ridesGetRequest(id!);
      persistRiderRideCache(id!, res);
      return res;
    },
    placeholderData: () => (id ? readRiderRideCache(id) : undefined),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      if (!heavyTrackingEnabled) return false;
      const st = q.state.data?.ride.status;
      if (!st || st === 'completed' || st === 'cancelled') return false;
      if (st === 'driver_arrived_pickup' || st === 'on_trip') return RIDE_ARRIVED_SYNC_MS;
      if (st === 'driver_en_route_pickup') {
        const r = q.state.data?.ride;
        if (q.state.data?.wait_time || r?.wait_time_started_at) return RIDE_ARRIVED_SYNC_MS;
      }
      return RIDE_SYNC_MS;
    },
  });

  useEffect(() => {
    if (!data || !id) return;
    const shadowBooker =
      data.participant_role === 'booker' &&
      (data.booker_visibility === 'shadow' || data.roam_mode === 'shadow_roam');
    if (shadowBooker) {
      navigate(`/shadow-trip/${id}`, { replace: true });
    }
  }, [data, id, navigate]);

  const ride = data?.ride;
  const waitTime = data?.wait_time as WaitTimeInfo | null | undefined;
  const canChat = data?.can_chat === true;
  const canCancel = data?.can_cancel === true;
  const isDelegatedBooker = data?.participant_role === 'booker' && data?.is_delegated === true;
  const isBooker = data?.participant_role === 'booker';
  const assignedDriver = data?.assigned_driver ?? null;
  const canShareWithPassenger = false;

  const shareWithPassenger = async () => {
    if (!id || sharingInvite) return;
    setSharingInvite(true);
    try {
      const { invite } = await createPassengerInvite(id);
      const url = invite.url;
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Your Roam ride', url });
        toast.success('Invite shared');
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Invite link copied');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(e instanceof Error ? e.message : 'Could not create invite');
    } finally {
      setSharingInvite(false);
    }
  };

  const riderPin = useMemo(() => {
    if (!ride) return null;
    return resolveRiderPinDisplay(ride, data?.rider_pin);
  }, [data?.rider_pin, ride]);

  const pinEnabled = data?.pin_enabled === true || Boolean(riderPin);

  const pinAwaitingPickup =
    ride != null &&
    isRiderPinTripPhase(ride.status) &&
    !ride.pin_verified_at &&
    !shouldShowRiderPin(ride);

  const pinLoadingAtPickup =
    ride != null && shouldShowRiderPin(ride) && !riderPin && !ride.pin_verified_at;

  const { data: liveData } = useQuery({
    queryKey: ['ride-live', id],
    enabled: Boolean(id && ride && showLiveTracking(ride.status) && heavyTrackingEnabled),
    queryFn: () => ridesGetLive(id!),
    refetchInterval: heavyTrackingEnabled ? RIDE_SYNC_MS : false,
  });

  useEffect(() => {
    if (error && !data?.ride) {
      toast.error(error instanceof Error ? error.message : 'Failed to load ride');
    }
  }, [error, data?.ride]);

  useEffect(() => {
    if (!isOnline) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    void refetch();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isOnline, justReconnected, refetch]);

  useEffect(() => {
    if (!id || !ride) return;
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      clearRiderRideCache(id);
    }
  }, [id, ride?.status]);

  useEffect(() => {
    if (!ride) return;
    if (
      ride.status === 'driver_arrived_pickup' &&
      prevStatusRef.current !== 'driver_arrived_pickup'
    ) {
      if (isDelegatedBooker) {
        toast.success('Driver has arrived', {
          description: 'Pickup is in progress for your rider.',
        });
      } else if (data?.participant_role === 'passenger' || !data?.is_delegated) {
        toast.success('Your driver has arrived', {
          description: riderPin
            ? 'Share your 4-digit PIN when they ask for it.'
            : 'Your trip PIN will appear when they reach the pickup point.',
        });
      }
    }
    prevStatusRef.current = ride.status;
  }, [ride?.status, riderPin, isDelegatedBooker, data?.participant_role, data?.is_delegated]);

  useEffect(() => {
    if (!id || !heavyTrackingEnabled) return;

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
              (prev: { ride: RideRequestRow; offers: unknown[]; rider_pin?: string | null } | undefined) => {
                if (!prev) return prev;
                const mergedRide = { ...prev.ride, ...row };
                const mergedPin = resolveRiderPinDisplay(mergedRide, prev.rider_pin);
                return { ...prev, ride: mergedRide, rider_pin: mergedPin };
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
  }, [id, refetch, queryClient, heavyTrackingEnabled]);

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
      bookerTracking?.clear();
      navigate('/', { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const handleMinimize = (role: 'booker' | 'passenger') => {
    if (!id) return;
    if (bookerTracking) {
      bookerTracking.minimize(id, role);
      return;
    }
    persistMinimizedRide(id, role);
    navigate('/', { replace: true });
  };

  const handleBookerMinimize = () => handleMinimize('booker');
  const handlePassengerMinimize = () => handleMinimize('passenger');

  if (!id) return null;

  if (ride?.status === 'completed') {
    return <TripSummaryView ride={ride} />;
  }

  if (ride?.status === 'cancelled') {
    return <RideCancelledView ride={ride} />;
  }

  const connectionBanner = (
    <RiderConnectionBanner isOnline={isOnline} reconnecting={justReconnected} />
  );

  if (ride && isTripInProgress(ride.status)) {
    if (isDelegatedBooker) {
      return (
        <>
          {connectionBanner}
          <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
            <BookerTrackingView
              ride={ride}
              driverLocation={driverLocation}
              driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
              passengerName={ride.guest_passenger_name}
              assignedDriver={assignedDriver}
              isFetching={isFetching}
              onMinimize={handleBookerMinimize}
              onCancelTrip={() => setCancelDialogOpen(true)}
              cancelling={cancelling}
              canChat={canChat}
              canCancel={canCancel}
            />
          </div>
          <RidePageDialogs
            cancelDialogOpen={cancelDialogOpen}
            setCancelDialogOpen={setCancelDialogOpen}
            leaveDialogOpen={false}
            setLeaveDialogOpen={setLeaveDialogOpen}
            cancelling={cancelling}
            cancelCopy={getCancelCopy(ride.status)}
            onConfirmCancel={() => void performCancel()}
            showLeaveDialog={false}
          />
        </>
      );
    }
    return (
      <>
        {connectionBanner}
        <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
          <TripInProgressView
          ride={ride}
          driverLocation={driverLocation}
          driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
          onMinimize={handlePassengerMinimize}
          canChat={canChat}
          canCancel={canCancel}
          participantRole={data?.participant_role}
        />
        </div>
      </>
    );
  }

  if (ride && isPickupLive(ride.status)) {
    if (isDelegatedBooker) {
      return (
        <>
          {connectionBanner}
          <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
            <BookerTrackingView
              ride={ride}
              driverLocation={driverLocation}
              driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
              passengerName={ride.guest_passenger_name}
              assignedDriver={assignedDriver}
              isFetching={isFetching}
              onMinimize={handleBookerMinimize}
              onCancelTrip={() => setCancelDialogOpen(true)}
              cancelling={cancelling}
              canChat={canChat}
              canCancel={canCancel}
            />
          </div>
          <RidePageDialogs
            cancelDialogOpen={cancelDialogOpen}
            setCancelDialogOpen={setCancelDialogOpen}
            leaveDialogOpen={false}
            setLeaveDialogOpen={setLeaveDialogOpen}
            cancelling={cancelling}
            cancelCopy={getCancelCopy(ride.status)}
            onConfirmCancel={() => void performCancel()}
            showLeaveDialog={false}
          />
        </>
      );
    }
    return (
      <>
        {connectionBanner}
        <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
          <LiveRideView
          ride={ride}
          driverLocation={driverLocation}
          driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
          riderPin={riderPin}
          pinEnabled={pinEnabled}
          waitTime={waitTime}
          isFetching={isFetching}
          onMinimize={handlePassengerMinimize}
          onCancelTrip={() => setCancelDialogOpen(true)}
          onRetryPin={() => void refetch()}
          cancelling={cancelling}
          canChat={canChat}
          canCancel={canCancel}
          participantRole={data?.participant_role}
        />
        </div>
        <RidePageDialogs
          cancelDialogOpen={cancelDialogOpen}
          setCancelDialogOpen={setCancelDialogOpen}
          leaveDialogOpen={false}
          setLeaveDialogOpen={setLeaveDialogOpen}
          cancelling={cancelling}
          cancelCopy={getCancelCopy(ride.status)}
          onConfirmCancel={() => void performCancel()}
          showLeaveDialog={false}
        />
      </>
    );
  }

  if (ride && isDelegatedBooker && (ride.status === 'matching' || showLiveTracking(ride.status))) {
    return (
      <>
        {connectionBanner}
        <div className="h-[100dvh] max-h-[100dvh] overflow-hidden">
          <BookerTrackingView
            ride={ride}
            driverLocation={driverLocation}
            driverHeading={liveData?.driver_location?.heading ?? ride.last_driver_heading ?? null}
            passengerName={ride.guest_passenger_name}
            assignedDriver={assignedDriver}
            isFetching={isFetching}
            onMinimize={handleBookerMinimize}
            onCancelTrip={() => setCancelDialogOpen(true)}
            cancelling={cancelling}
            canChat={canChat}
            canCancel={canCancel}
          />
        </div>
        <RidePageDialogs
          cancelDialogOpen={cancelDialogOpen}
          setCancelDialogOpen={setCancelDialogOpen}
          leaveDialogOpen={false}
          setLeaveDialogOpen={setLeaveDialogOpen}
          cancelling={cancelling}
          cancelCopy={getCancelCopy(ride.status)}
          onConfirmCancel={() => void performCancel()}
          showLeaveDialog={false}
        />
      </>
    );
  }

  const cancelCopy = getCancelCopy(ride?.status);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/90 backdrop-blur-md safe-t">
        <div className="max-w-lg mx-auto safe-x px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePassengerMinimize}
            className="btn-touch inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 hover:bg-zinc-50 touch-manipulation active:scale-[0.98]"
            aria-label="Minimize tracker"
          >
            <ChevronDown className="w-5 h-5 text-zinc-800" />
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

            {riderPin && <RiderPinDisplay pin={riderPin} />}

            {pinAwaitingPickup && (
              <p className="text-sm text-center text-zinc-500 px-2 leading-relaxed">
                Your trip PIN will appear when your driver reaches the pickup location.
              </p>
            )}

            {pinLoadingAtPickup && (
              <div className="rounded-3xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto" aria-hidden />
                <p className="text-sm font-medium text-emerald-900">Loading your trip PIN…</p>
              </div>
            )}

            {(ride.status === 'driver_arrived_pickup' || ride.status === 'driver_en_route_pickup') &&
              waitTime && <RiderWaitTimeDisplay waitTime={waitTime} />}

            {canShareWithPassenger && (
              <button
                type="button"
                onClick={() => void shareWithPassenger()}
                disabled={sharingInvite}
                className="btn-touch flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 text-base font-semibold text-emerald-900 hover:bg-emerald-100 touch-manipulation active:scale-[0.99] disabled:opacity-60"
              >
                <Share2 className="h-5 w-5" aria-hidden />
                {sharingInvite ? 'Creating link…' : 'Share with passenger'}
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                disabled={cancelling}
                className="btn-touch w-full rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 touch-manipulation active:scale-[0.99] disabled:opacity-60"
              >
                {ride.status === 'matching' ? 'Cancel search' : 'Cancel ride'}
              </button>
            )}

          </>
        )}
      </main>

      <RidePageDialogs
        cancelDialogOpen={cancelDialogOpen}
        setCancelDialogOpen={setCancelDialogOpen}
        leaveDialogOpen={false}
        setLeaveDialogOpen={setLeaveDialogOpen}
        cancelling={cancelling}
        cancelCopy={cancelCopy}
        onConfirmCancel={() => void performCancel()}
        showLeaveDialog={false}
      />
    </div>
  );
}

function RidePageDialogs({
  cancelDialogOpen,
  setCancelDialogOpen,
  leaveDialogOpen,
  setLeaveDialogOpen,
  cancelling,
  cancelCopy,
  onConfirmCancel,
  showLeaveDialog = true,
}: {
  cancelDialogOpen: boolean;
  setCancelDialogOpen: (open: boolean) => void;
  leaveDialogOpen: boolean;
  setLeaveDialogOpen: (open: boolean) => void;
  cancelling: boolean;
  cancelCopy: string;
  onConfirmCancel: () => void;
  showLeaveDialog?: boolean;
}) {
  return (
    <>
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent
          overlayClassName="bg-zinc-900/80 backdrop-blur-md"
          className="rounded-3xl border border-zinc-200 bg-white shadow-2xl max-w-[calc(100%-2rem)] sm:max-w-md p-6"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold text-zinc-900">
              Cancel this ride?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-zinc-600 leading-relaxed">
              {cancelCopy}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-3 sm:flex-col">
            <AlertDialogCancel
              disabled={cancelling}
              className="btn-touch rounded-2xl mt-0 h-12 w-full border-2 border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Keep waiting
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                onConfirmCancel();
              }}
              className="btn-touch rounded-2xl h-12 w-full bg-red-600 text-base font-semibold text-white hover:bg-red-700 shadow-sm"
            >
              {cancelling ? 'Cancelling…' : 'Yes, cancel ride'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showLeaveDialog ? (
      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent
          overlayClassName="bg-zinc-900/80 backdrop-blur-md"
          className="rounded-3xl border border-zinc-200 bg-white shadow-2xl max-w-[calc(100%-2rem)] sm:max-w-md p-6"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold text-zinc-900">
              Cancel before leaving?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-zinc-600 leading-relaxed">
              This ride is still active. Going home without cancelling keeps it open for your driver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-3 sm:flex-col">
            <AlertDialogCancel
              disabled={cancelling}
              className="btn-touch rounded-2xl mt-0 h-12 w-full border-2 border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Keep ride
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                onConfirmCancel();
              }}
              className="btn-touch rounded-2xl h-12 w-full bg-red-600 text-base font-semibold text-white hover:bg-red-700 shadow-sm"
            >
              {cancelling ? 'Cancelling…' : 'Cancel ride & go home'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      ) : null}
    </>
  );
}
