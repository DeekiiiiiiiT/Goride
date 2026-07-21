import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase/client';
import type { DriverOfferWithRide, DriverTransitionBody, RideRequestRow, CashSettlementResponse } from '@roam/types/rides';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import {
  ridesDriverAcceptOffer,
  ridesDriverDeclineOffer,
  ridesDriverGetRequest,
  ridesDriverPendingOffers,
  ridesDriverPresence,
  ridesDriverCashSettlement,
  ridesDriverTransition,
  type DriverWaitTimeInfo,
  type DriverRideLocationLive,
} from '../services/ridesDriverEdge';
import { isAwaitingCashSettlement, isCashRide, shouldCollectCashAtDropoff } from '../lib/cashSettlementUi';
import {
  clearCashSettlementPending,
  readCashSettlementPending,
} from '../utils/cashSettlementPendingStorage';
import { slugFromBodyLabel, useDispatchConfig } from '@roam/hauler-dispatch';
import { useActiveRideTracking } from './useActiveRideTracking';
import { openExternalNavigation } from '../utils/rideNavigation';
import { useDriverPermissionPolicy } from './usePermissionPolicy';
import { useActiveRideRecovery } from '../contexts/ActiveRideRecoveryContext';
import {
  clearSuppressActiveTripUi,
  persistActiveRideId,
  persistActiveRideSnapshot,
  suppressActiveTripUi,
} from '../utils/driverActiveRideSession';
import {
  dispatchResetErrorBoundary,
  ROAM_EXIT_TRIP_UI_EVENT,
  ROAM_RECONNECTED_EVENT,
} from '../utils/networkReconnect';
import { mergeDriverActiveRide, normalizeDriverRide } from '../utils/mergeActiveRide';
import {
  checkGeolocationGranted,
  isBlockedByPolicy,
  isNativeCapacitorPlatform,
  isWebApplicable,
  permissionKeyToGrantChecker,
  readOnboardingDismissed,
  shouldShowOnboardingPrompt,
} from '@roam/types';
import { hasAcceptedDriverBackgroundLocationDisclosure } from '../utils/driverLocationDisclosure';
import {
  ensureDriverLocationAccess,
  openRoamDriverAppSettings,
  readCurrentDriverPosition,
} from '../utils/nativeLocationAccess';

function isFatalPresenceError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('forbidden') ||
    m.includes('driver_not_active') ||
    m.includes('fleet_not_eligible') ||
    m.includes('fleet_vehicle_not_assigned') ||
    m.includes('no_driver_profile') ||
    m.includes('not_eligible_for_dispatch')
  );
}

const OFFER_POLL_MS = 4000;
const RIDE_SYNC_MS = 30_000;
const RIDE_WAIT_SYNC_MS = 2_000;
const OFFER_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

function buildExactCashSettlementResult(ride: RideRequestRow): CashSettlementResponse {
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);
  return {
    ride,
    outcome: 'exact',
    owed_minor: fareMinor,
    cash_received_minor: fareMinor,
    arrears_minor: 0,
    change_credit_minor: 0,
  };
}

export function useRideDispatch() {
  const dispatchConfig = useDispatchConfig();
  const defaultBodyTypeSlug = dispatchConfig.defaultBodyTypeSlug;

  const [online, setOnline] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferWithRide[]>([]);
  const [activeRide, setActiveRide] = useState<RideRequestRow | null>(null);
  const [activeRideWaitTime, setActiveRideWaitTime] = useState<DriverWaitTimeInfo | null>(null);
  const [bodyTypeSlug, setBodyTypeSlug] = useState<string | null>(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [rideLocationLive, setRideLocationLive] = useState<DriverRideLocationLive | null>(null);
  const [driverTollToast, setDriverTollToast] = useState<{
    plazaName: string;
    amountMinor: number;
    tripTotalMinor: number;
  } | null>(null);
  const seenTollKeysRef = useRef<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [cashSettlementResult, setCashSettlementResult] = useState<CashSettlementResponse | null>(null);
  const [digitalTripComplete, setDigitalTripComplete] = useState<RideRequestRow | null>(null);

  const watchId = useRef<string | number | null>(null);
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const knownOfferIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingGoOnlineAfterSettings = useRef(false);
  const bodyTypeSlugRef = useRef(defaultBodyTypeSlug);
  const lastPresenceSuccessAt = useRef(0);
  const locationFailureStreak = useRef(0);

  const {
    activeRide: recoveredRide,
    recoveryLoaded,
    setActiveRide: setRecoveredRide,
    refreshActiveRide,
  } = useActiveRideRecovery();

  const isActiveDriverRide = useCallback((status: RideRequestRow['status']) => {
    return isDriverActiveRideStatus(status) || status === 'awaiting_cash_settlement';
  }, []);

  const syncActiveRide = useCallback(
    (ride: RideRequestRow | null) => {
      if (!ride || !isActiveDriverRide(ride.status)) {
        setActiveRide(null);
        setActiveRideWaitTime(null);
        setRideLocationLive(null);
        setDriverTollToast(null);
        seenTollKeysRef.current = new Set();
        setRecoveredRide(null);
        persistActiveRideId(null);
        persistActiveRideSnapshot(null);
        clearSuppressActiveTripUi();
        return;
      }
      clearSuppressActiveTripUi();
      setActiveRide((prev) => {
        const next = mergeDriverActiveRide(prev, ride);
        setRecoveredRide(next);
        persistActiveRideId(next.id);
        persistActiveRideSnapshot(next);
        return next;
      });
    },
    [setRecoveredRide, isActiveDriverRide],
  );

  const { permissions } = useDriverPermissionPolicy();
  const [permissionOnboardingOpen, setPermissionOnboardingOpen] = useState(false);
  const [locationDisclosureOpen, setLocationDisclosureOpen] = useState(false);
  const [locationGoOnlineBlocked, setLocationGoOnlineBlocked] = useState(false);

  useEffect(() => {
    if (!permissions.length) return;
    void (async () => {
      for (const row of permissions) {
        if (!row.enabled || !row.prompt_onboarding || !isWebApplicable(row.platform)) continue;
        const grant = await permissionKeyToGrantChecker(row.key)();
        if (shouldShowOnboardingPrompt(row, grant, readOnboardingDismissed('driver', row.key))) {
          setPermissionOnboardingOpen(true);
          return;
        }
      }
    })();
  }, [permissions]);

  useEffect(() => {
    void (async () => {
      if (!permissions.length) return;
      const geo = await checkGeolocationGranted();
      setLocationGoOnlineBlocked(
        isBlockedByPolicy(permissions, 'location_precise_while_using', geo),
      );
    })();
  }, [permissions]);

  useEffect(() => {
    if (!recoveryLoaded || !recoveredRide || activeRide) return;
    setActiveRide(recoveredRide);
    setOnline(true);
  }, [recoveryLoaded, recoveredRide, activeRide]);

  useEffect(() => {
    const onExitTripUi = () => {
      if (activeRide?.status === 'awaiting_cash_settlement') return;
      suppressActiveTripUi();
      syncActiveRide(null);
      dispatchResetErrorBoundary();
    };
    window.addEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
    return () => window.removeEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
  }, [syncActiveRide, activeRide?.status]);

  useEffect(() => {
    audioRef.current = new Audio(OFFER_SOUND_URL);
    audioRef.current.volume = 0.5;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile?.id) {
        setBodyTypeSlug(defaultBodyTypeSlug);
        setVehicleReady(true);
        return;
      }

      const { data: vehicle, error: vehicleError } = await supabase
        .from('driver_vehicles')
        .select('body_type')
        .eq('driver_profile_id', profile.id)
        .eq('status', 'active')
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vehicleError) {
        console.warn('driver_vehicles lookup failed', vehicleError.message);
      }

      const label = (vehicle as { body_type?: string | null } | null)?.body_type?.trim();
      setBodyTypeSlug(label ? slugFromBodyLabel(label) || defaultBodyTypeSlug : defaultBodyTypeSlug);
      setVehicleReady(true);
    })();
  }, []);

  const effectiveBodyTypeSlug = bodyTypeSlug ?? defaultBodyTypeSlug;
  bodyTypeSlugRef.current = effectiveBodyTypeSlug;

  const clearGeoWatch = useCallback(() => {
    if (watchId.current == null) return;
    const id = watchId.current;
    watchId.current = null;
    if (isNativeCapacitorPlatform()) {
      void import('@capacitor/geolocation').then(({ Geolocation }) =>
        Geolocation.clearWatch({ id: String(id) }),
      );
      return;
    }
    navigator.geolocation.clearWatch(id as number);
  }, []);

  const postOfflinePresence = useCallback(async () => {
    const coords = lastCoords.current;
    if (!coords) return;
    try {
      await ridesDriverPresence({
        lat: coords.lat,
        lng: coords.lng,
        available_for_rides: false,
        body_type_slug: effectiveBodyTypeSlug,
        dispatch_mode: dispatchConfig.dispatchMode,
      });
    } catch (e: unknown) {
      console.warn('offline presence failed', e);
    }
  }, [effectiveBodyTypeSlug, dispatchConfig.dispatchMode]);

  const refreshOffers = useCallback(async () => {
    try {
      const { offers: nextOffers } = await ridesDriverPendingOffers();
      const filtered = nextOffers.filter(dispatchConfig.filterOffer);
      const nextIds = new Set(filtered.map((o) => o.id));
      const hasNew = filtered.some((o) => !knownOfferIds.current.has(o.id));
      knownOfferIds.current = nextIds;
      setOffers(filtered);
      if (hasNew && online && audioRef.current) {
        audioRef.current.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate(200);
      }
    } catch {
      /* offline / unauthorized handled elsewhere */
    }
  }, [online, activeRide?.id, activeRide?.status]);

  type PollResult = 'active' | 'terminal' | 'error';

  const pollActiveRide = useCallback(async (id: string): Promise<PollResult> => {
    try {
      const { ride, wait_time } = await ridesDriverGetRequest(id);
      setActiveRideWaitTime(wait_time ?? null);
      if (ride.status === 'completed' || ride.status === 'cancelled') {
        syncActiveRide(null);
        setActiveRideWaitTime(null);
        if (ride.status === 'cancelled') {
          toast.message('Ride cancelled');
        }
        return 'terminal';
      }
      syncActiveRide(ride);
      return 'active';
    } catch {
      return 'error';
    }
  }, [syncActiveRide]);

  const refreshActiveRideFromServer = useCallback(async () => {
    if (!activeRide?.id) return;
    await pollActiveRide(activeRide.id);
  }, [activeRide?.id, pollActiveRide]);

  const handleRideLocationLive = useCallback((live: DriverRideLocationLive | null) => {
    setRideLocationLive(live);
    const crossed = live?.tolls_crossed;
    if (!crossed?.length) return;
    const latest = crossed[crossed.length - 1];
    const key = `${latest.toll_plaza_id}:${latest.toll_amount_minor}:${crossed.length}`;
    if (seenTollKeysRef.current.has(key)) return;
    seenTollKeysRef.current.add(key);
    setDriverTollToast({
      plazaName: latest.toll_plaza_name,
      amountMinor: latest.toll_amount_minor,
      tripTotalMinor: live?.actual_tolls_minor ?? latest.toll_amount_minor,
    });
  }, []);

  const dismissDriverTollToast = useCallback(() => {
    setDriverTollToast(null);
  }, []);

  const { trackingError, gpsAccuracyM, isTracking } = useActiveRideTracking(
    activeRide,
    syncActiveRide,
    handleRideLocationLive,
    undefined,
    refreshActiveRideFromServer,
  );

  useEffect(() => {
    const onReconnected = () => {
      if (activeRide?.id) {
        void pollActiveRide(activeRide.id);
      } else {
        void refreshActiveRide();
      }
    };
    window.addEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
    return () => window.removeEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
  }, [activeRide?.id, pollActiveRide, refreshActiveRide]);

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(refreshOffers, OFFER_POLL_MS);
    refreshOffers();
    return () => clearInterval(id);
  }, [online, refreshOffers]);

  useEffect(() => {
    if (!online || !userId) return;

    const channel = supabase
      .channel(`driver-offers-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'rides',
          table: 'driver_offers',
          filter: `driver_user_id=eq.${userId}`,
        },
        () => {
          void refreshOffers();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [online, userId, refreshOffers]);

  const postPresenceFromCoords = useCallback(
    async (
      lat: number,
      lng: number,
      heading?: number | null,
      opts?: { offlineOnFailure?: boolean },
    ): Promise<boolean> => {
      lastCoords.current = { lat, lng };
      try {
        await ridesDriverPresence({
          lat,
          lng,
          heading_degrees: heading ?? undefined,
          available_for_rides: true,
          body_type_slug: bodyTypeSlugRef.current,
          dispatch_mode: dispatchConfig.dispatchMode,
        });
        setPresenceError(null);
        lastPresenceSuccessAt.current = Date.now();
        locationFailureStreak.current = 0;
        return true;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Could not go online';
        let display = message;
        try {
          const parsed = JSON.parse(message) as { error?: string; message?: string };
          if (parsed.error === 'presence_failed') {
            display = 'Could not save your location. Please try again.';
          } else if (parsed.error) {
            display = parsed.error.replace(/_/g, ' ');
          }
        } catch {
          /* use raw message */
        }
        setPresenceError(display);
        const fatal = isFatalPresenceError(message);
        if (message.includes('fleet_vehicle_not_assigned')) {
          toast.error('No vehicle assigned yet. Ask your fleet manager to assign you a vehicle before going online.');
        } else if (message.includes('fleet_not_eligible')) {
          toast.error('Fleet drivers cannot go online for Roam dispatch during beta.');
        } else if (message.includes('driver_not_active')) {
          toast.error('Your driver account is not active yet. Contact support.');
        } else if (message.includes('no_driver_profile')) {
          toast.error('No driver profile found for this login.');
        } else if (fatal) {
          toast.error(display);
        } else {
          toast.error('Could not register your location. Retrying…');
        }
        if (fatal || opts?.offlineOnFailure) {
          setOnline(false);
        }
        console.warn('presence failed', e);
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!online) return;

    let cancelled = false;

    const handleLocationFailure = () => {
      if (cancelled) return;
      locationFailureStreak.current += 1;
      const hadRecentPresence =
        lastPresenceSuccessAt.current > 0 &&
        Date.now() - lastPresenceSuccessAt.current < 60_000;
      if (locationFailureStreak.current < 4 && hadRecentPresence) return;
      if (locationFailureStreak.current < 6) return;
      toast.error('Location signal lost — check GPS and try again.');
      setOnline(false);
      setLocationGoOnlineBlocked(true);
    };

    if (isNativeCapacitorPlatform()) {
      void (async () => {
        const { Geolocation } = await import('@capacitor/geolocation');
        if (cancelled) return;
        watchId.current = await Geolocation.watchPosition(
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
          (position, err) => {
            if (cancelled) return;
            if (err || !position) {
              handleLocationFailure();
              return;
            }
            void postPresenceFromCoords(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.heading,
            );
          },
        );
      })();
      return () => {
        cancelled = true;
        clearGeoWatch();
      };
    }

    if (!navigator.geolocation) {
      handleLocationFailure();
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        void postPresenceFromCoords(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.heading,
        );
      },
      handleLocationFailure,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      cancelled = true;
      clearGeoWatch();
    };
  }, [online, postPresenceFromCoords, clearGeoWatch]);

  useEffect(() => {
    if (activeRide?.status === 'awaiting_cash_settlement' && activeRide.id) {
      void pollActiveRide(activeRide.id);
    }
  }, [activeRide?.id, activeRide?.status, pollActiveRide]);

  useEffect(() => {
    if (!activeRide?.id) return;
    const pollMs =
      activeRide.status === 'driver_arrived_pickup' ||
      activeRide.status === 'driver_en_route_pickup'
        ? RIDE_WAIT_SYNC_MS
        : RIDE_SYNC_MS;
    void pollActiveRide(activeRide.id);
    const t = window.setInterval(async () => {
      const result = await pollActiveRide(activeRide.id);
      if (result === 'terminal') window.clearInterval(t);
    }, pollMs);
    return () => clearInterval(t);
  }, [activeRide?.id, activeRide?.status, activeRide?.wait_time_started_at, pollActiveRide]);

  useEffect(() => {
    if (!activeRide?.id) return;

    const channel = supabase
      .channel(`driver-ride-${activeRide.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'rides',
          table: 'ride_requests',
          filter: `id=eq.${activeRide.id}`,
        },
        (payload) => {
          const row = payload.new as RideRequestRow;
          if (!row?.id) return;
          if (!isActiveDriverRide(row.status)) {
            syncActiveRide(null);
            return;
          }
          syncActiveRide(normalizeDriverRide(row));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeRide?.id, syncActiveRide, isActiveDriverRide]);

  useEffect(() => {
    const handleUnload = () => {
      if (!online) return;
      void postOfflinePresence();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [online, postOfflinePresence]);

  useEffect(() => {
    return () => {
      if (!online) return;
      clearGeoWatch();
      void postOfflinePresence();
    };
  }, [online, clearGeoWatch, postOfflinePresence]);

  const goOnline = useCallback(async () => {
    if (activeRide?.status === 'awaiting_cash_settlement') {
      toast.message('Complete cash settlement before going online');
      return;
    }
    if (!vehicleReady) {
      toast.message('Loading your profile… try again in a moment.');
      return;
    }
    if (!navigator.geolocation && !isNativeCapacitorPlatform()) {
      toast.error('Location is not available on this device.');
      return;
    }

    setGoingOnline(true);
    try {
      const access = await ensureDriverLocationAccess();
      if (access === 'denied_needs_settings') {
        pendingGoOnlineAfterSettings.current = true;
        toast.message('Enable location for Roam Driver, then slide to go online again.');
        setLocationGoOnlineBlocked(true);
        return;
      }
      if (access === 'gps_off') {
        pendingGoOnlineAfterSettings.current = true;
        toast.message('Turn on GPS on your phone, then slide to go online again.');
        setLocationGoOnlineBlocked(true);
        return;
      }
      if (access !== 'granted') {
        toast.error('Location is required to go online.');
        setLocationGoOnlineBlocked(true);
        return;
      }

      setLocationGoOnlineBlocked(false);
      setPresenceError(null);
      pendingGoOnlineAfterSettings.current = false;
      locationFailureStreak.current = 0;

      const coords = await readCurrentDriverPosition();
      if (coords) {
        const ok = await postPresenceFromCoords(coords.lat, coords.lng, coords.heading, {
          offlineOnFailure: true,
        });
        if (!ok) return;
      } else {
        toast.message('Waiting for GPS signal…');
      }

      setOnline(true);
    } finally {
      setGoingOnline(false);
    }
  }, [vehicleReady, activeRide?.status, postPresenceFromCoords]);

  useEffect(() => {
    if (!isNativeCapacitorPlatform()) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    void (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || cancelled) return;
        if (activeRide?.id) {
          void pollActiveRide(activeRide.id);
        }
        void (async () => {
          const geo = await checkGeolocationGranted();
          if (cancelled) return;
          setLocationGoOnlineBlocked(
            isBlockedByPolicy(permissions, 'location_precise_while_using', geo),
          );
          if (pendingGoOnlineAfterSettings.current && geo === 'granted') {
            pendingGoOnlineAfterSettings.current = false;
            await goOnline();
          }
        })();
      });
      removeListener = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [permissions, goOnline, activeRide?.id, pollActiveRide]);

  const goOffline = useCallback(async () => {
    setGoingOnline(false);
    clearGeoWatch();
    await postOfflinePresence();
    setOnline(false);
    setOffers([]);
    knownOfferIds.current.clear();
  }, [clearGeoWatch, postOfflinePresence]);

  const confirmLocationDisclosure = useCallback(() => {
    setLocationDisclosureOpen(false);
    void goOnline();
  }, [goOnline]);

  const openLocationSettings = useCallback(() => {
    void openRoamDriverAppSettings();
  }, []);

  const attemptGoOnline = useCallback(() => {
    if (!hasAcceptedDriverBackgroundLocationDisclosure()) {
      setLocationDisclosureOpen(true);
      return;
    }
    void goOnline();
  }, [goOnline]);

  const toggleOnline = useCallback(() => {
    if (online) {
      void goOffline();
    } else {
      attemptGoOnline();
    }
  }, [online, goOffline, attemptGoOnline]);

  const accept = useCallback(
    async (offer: DriverOfferWithRide) => {
      try {
        const { ride } = await ridesDriverAcceptOffer(offer.id);
        syncActiveRide(ride);
        setOffers([]);
        knownOfferIds.current.clear();
        toast.success('Ride assigned — head to pickup');
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not accept');
      }
    },
    [syncActiveRide],
  );

  const decline = useCallback(
    async (offer: DriverOfferWithRide) => {
      try {
        await ridesDriverDeclineOffer(offer.id);
        toast.message('Offer declined');
        await refreshOffers();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not decline');
      }
    },
    [refreshOffers],
  );

  const advance = useCallback(async (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => {
    if (!activeRide) return;
    try {
      const body: DriverTransitionBody = { status, reason };
      if (verificationPin) {
        body.verification_pin = verificationPin;
      }
      const { ride } = await ridesDriverTransition(activeRide.id, body);
      if (status === 'completed' || status === 'cancelled') {
        syncActiveRide(null);
        if (status === 'completed') {
          window.dispatchEvent(new Event('roam-driver-trip-completed'));
          if (isCashRide(ride)) {
            setCashSettlementResult(buildExactCashSettlementResult(ride));
          } else {
            setDigitalTripComplete(ride);
          }
        } else {
          toast.message('Ride cancelled');
        }
      } else {
        syncActiveRide(ride);
        if (status === 'on_trip') {
          toast.success('Trip started');
          openExternalNavigation({
            lat: ride.dropoff_lat,
            lng: ride.dropoff_lng,
            address: ride.dropoff_address,
          });
        } else if (status === 'awaiting_cash_settlement') {
          toast.message('Enter the cash amount received');
          window.setTimeout(() => {
            if (activeRide?.id) void pollActiveRide(activeRide.id);
          }, 1500);
        } else {
          toast.success('Updated');
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (
        status === 'completed' &&
        shouldCollectCashAtDropoff(activeRide) &&
        msg.toLowerCase().includes('cash_settlement')
      ) {
        try {
          const { ride } = await ridesDriverTransition(activeRide.id, { status: 'awaiting_cash_settlement' });
          syncActiveRide(ride);
          toast.message('Enter the cash amount received');
          return;
        } catch {
          // fall through
        }
      }
      if (activeRide?.id) {
        const result = await pollActiveRide(activeRide.id);
        if (result === 'terminal') return;
      }
      toast.error(e instanceof Error ? e.message : 'Transition failed');
      throw e;
    }
  }, [activeRide, syncActiveRide, pollActiveRide]);

  const submitCashSettlement = useCallback(
    async (cashReceivedMinor: number, idempotencyKey: string) => {
      if (!activeRide) return undefined;
      try {
        const result = await ridesDriverCashSettlement(activeRide.id, {
          cash_received_minor: cashReceivedMinor,
          idempotency_key: idempotencyKey,
        });
        clearCashSettlementPending();
        syncActiveRide(null);
        setCashSettlementResult(result);
        window.dispatchEvent(new Event('roam-driver-trip-completed'));
        return result;
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : '';
        const friendly =
          raw.includes('fare_not_locked')
            ? 'Fare not locked yet — pull to refresh or wait a moment.'
            : raw.includes('forbidden')
              ? 'You are not assigned to this trip.'
              : raw.includes('invalid_status')
                ? 'Trip is not awaiting cash settlement.'
                : raw || 'Could not confirm payment';
        toast.error(friendly);
        throw e;
      }
    },
    [activeRide, syncActiveRide],
  );

  useEffect(() => {
    if (!activeRide || !isAwaitingCashSettlement(activeRide)) return;
    const pending = readCashSettlementPending();
    if (!pending || pending.rideId !== activeRide.id) return;
    void submitCashSettlement(pending.cashReceivedMinor, pending.idempotencyKey).catch(() => {
      // user can retry manually
    });
  }, [activeRide?.id, activeRide?.status, submitCashSettlement]);

  const resumeCashSettlement = useCallback(
    async (rideId: string): Promise<boolean> => {
      try {
        const { ride } = await ridesDriverGetRequest(rideId);
        if (ride.status !== 'awaiting_cash_settlement') {
          toast.error('This trip is no longer awaiting cash settlement');
          return false;
        }
        clearSuppressActiveTripUi();
        syncActiveRide(ride);
        toast.message('Enter the cash amount received');
        return true;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not open cash settlement');
        return false;
      }
    },
    [syncActiveRide],
  );

  const dismissCashSettlementResult = useCallback(() => {
    setCashSettlementResult(null);
  }, []);

  const dismissDigitalTripComplete = useCallback(() => {
    setDigitalTripComplete(null);
  }, []);

  return {
    online,
    goingOnline,
    offers,
    activeRide,
    activeRideWaitTime,
    bodyTypeSlug: effectiveBodyTypeSlug,
    vehicleReady,
    presenceError,
    trackingError,
    gpsAccuracyM,
    isTracking,
    rideLocationLive,
    driverTollToast,
    dismissDriverTollToast,
    goOnline,
    goOffline,
    toggleOnline,
    accept,
    decline,
    advance,
    submitCashSettlement,
    dismissCashSettlementResult,
    cashSettlementResult,
    digitalTripComplete,
    dismissDigitalTripComplete,
    resumeCashSettlement,
    refreshOffers,
    permissions,
    permissionOnboardingOpen,
    setPermissionOnboardingOpen,
    locationDisclosureOpen,
    setLocationDisclosureOpen,
    confirmLocationDisclosure,
    locationGoOnlineBlocked,
    openLocationSettings,
  };
}
