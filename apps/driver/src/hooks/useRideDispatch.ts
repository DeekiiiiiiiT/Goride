import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase/client';
import type { DriverOfferWithRide, DriverTransitionBody, RideRequestRow } from '@roam/types/rides';
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
import { CASH_SETTLEMENT_ENABLED } from '../lib/cashSettlementFlags';
import {
  clearCashSettlementPending,
  readCashSettlementPending,
} from '../utils/cashSettlementPendingStorage';
import { slugFromBodyLabel } from '../components/rides/rideDispatchUtils';
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
  openRoamDriverAppSettings,
  promptDriverLocationAccess,
} from '../utils/nativeLocationAccess';

const OFFER_POLL_MS = 4000;
const RIDE_SYNC_MS = 30_000;
const RIDE_WAIT_SYNC_MS = 2_000;
const OFFER_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const DEFAULT_BODY_TYPE_SLUG = 'sedan';

export function useRideDispatch() {
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferWithRide[]>([]);
  const [activeRide, setActiveRide] = useState<RideRequestRow | null>(null);
  const [activeRideWaitTime, setActiveRideWaitTime] = useState<DriverWaitTimeInfo | null>(null);
  const [bodyTypeSlug, setBodyTypeSlug] = useState<string | null>(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [rideLocationLive, setRideLocationLive] = useState<DriverRideLocationLive | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const watchId = useRef<string | number | null>(null);
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const knownOfferIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingGoOnlineAfterSettings = useRef(false);

  const {
    activeRide: recoveredRide,
    recoveryLoaded,
    setActiveRide: setRecoveredRide,
    refreshActiveRide,
  } = useActiveRideRecovery();

  const syncActiveRide = useCallback(
    (ride: RideRequestRow | null) => {
      if (!ride || !isDriverActiveRideStatus(ride.status)) {
        setActiveRide(null);
        setActiveRideWaitTime(null);
        setRideLocationLive(null);
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
    [setRecoveredRide],
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
      suppressActiveTripUi();
      syncActiveRide(null);
      dispatchResetErrorBoundary();
    };
    window.addEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
    return () => window.removeEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
  }, [syncActiveRide]);

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
        setBodyTypeSlug(DEFAULT_BODY_TYPE_SLUG);
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
      setBodyTypeSlug(label ? slugFromBodyLabel(label) || DEFAULT_BODY_TYPE_SLUG : DEFAULT_BODY_TYPE_SLUG);
      setVehicleReady(true);
    })();
  }, []);

  const effectiveBodyTypeSlug = bodyTypeSlug ?? DEFAULT_BODY_TYPE_SLUG;

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
      });
    } catch (e: unknown) {
      console.warn('offline presence failed', e);
    }
  }, [effectiveBodyTypeSlug]);

  const refreshOffers = useCallback(async () => {
    try {
      const { offers: nextOffers } = await ridesDriverPendingOffers();
      const nextIds = new Set(nextOffers.map((o) => o.id));
      const hasNew = nextOffers.some((o) => !knownOfferIds.current.has(o.id));
      knownOfferIds.current = nextIds;
      setOffers(nextOffers);
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

  const { trackingError, gpsAccuracyM, isTracking } = useActiveRideTracking(
    activeRide,
    syncActiveRide,
    setRideLocationLive,
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
    async (lat: number, lng: number, heading?: number | null) => {
      lastCoords.current = { lat, lng };
      try {
        await ridesDriverPresence({
          lat,
          lng,
          heading_degrees: heading ?? undefined,
          available_for_rides: true,
          body_type_slug: effectiveBodyTypeSlug,
        });
        setPresenceError(null);
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
        if (message.includes('fleet_not_eligible')) {
          toast.error('Fleet drivers cannot go online for Roam dispatch during beta.');
        } else if (message.includes('driver_not_active')) {
          toast.error('Your driver account is not active yet. Contact support.');
        } else if (message.includes('no_driver_profile')) {
          toast.error('No driver profile found for this login.');
        } else {
          toast.error('Could not register your location. Check permissions and try again.');
        }
        setOnline(false);
        console.warn('presence failed', e);
      }
    },
    [effectiveBodyTypeSlug],
  );

  useEffect(() => {
    if (!online) return;

    let cancelled = false;

    const handleLocationFailure = () => {
      if (cancelled) return;
      toast.error('Location permission needed for ride matching');
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
          if (!isDriverActiveRideStatus(row.status)) {
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
  }, [activeRide?.id, syncActiveRide]);

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

    const access = await promptDriverLocationAccess();
    if (access === 'denied_needs_settings') {
      pendingGoOnlineAfterSettings.current = true;
      toast.message('Enable location for Roam Driver (Allow all the time), then return and tap go online.');
      setLocationGoOnlineBlocked(true);
      return;
    }
    if (access === 'gps_off') {
      pendingGoOnlineAfterSettings.current = true;
      toast.message('Turn on GPS on your phone, then return and tap go online.');
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
    setOnline(true);
  }, [vehicleReady, activeRide?.status]);

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
          toast.success('Trip completed');
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
        } else {
          toast.success('Updated');
        }
      }
    } catch (e: unknown) {
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
      if (!activeRide) return;
      const result = await ridesDriverCashSettlement(activeRide.id, {
        cash_received_minor: cashReceivedMinor,
        idempotency_key: idempotencyKey,
      });
      syncActiveRide(null);
      clearCashSettlementPending();
      window.dispatchEvent(new Event('roam-driver-trip-completed'));
      toast.success(
        result.outcome === 'exact'
          ? 'Payment confirmed'
          : `Payment recorded (${result.outcome})`,
      );
    },
    [activeRide, syncActiveRide],
  );

  useEffect(() => {
    if (!CASH_SETTLEMENT_ENABLED || !activeRide) return;
    if (activeRide.status !== 'awaiting_cash_settlement') return;
    const pending = readCashSettlementPending();
    if (!pending || pending.rideId !== activeRide.id) return;
    void submitCashSettlement(pending.cashReceivedMinor, pending.idempotencyKey).catch(() => {
      // user can retry manually
    });
  }, [activeRide?.id, activeRide?.status, submitCashSettlement]);

  return {
    online,
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
    goOnline,
    goOffline,
    toggleOnline,
    accept,
    decline,
    advance,
    submitCashSettlement,
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
