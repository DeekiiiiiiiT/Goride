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
  ridesDriverTransition,
  type DriverWaitTimeInfo,
} from '../services/ridesDriverEdge';
import { slugFromBodyLabel } from '../components/rides/rideDispatchUtils';
import { useActiveRideTracking } from './useActiveRideTracking';
import { openExternalNavigation } from '../utils/rideNavigation';
import { useDriverPermissionPolicy } from './usePermissionPolicy';
import { useActiveRideRecovery } from '../contexts/ActiveRideRecoveryContext';
import { persistActiveRideId } from '../utils/driverActiveRideSession';
import { mergeDriverActiveRide, normalizeDriverRide } from '../utils/mergeActiveRide';
import {
  checkGeolocationGranted,
  isBlockedByPolicy,
  isWebApplicable,
  permissionKeyToGrantChecker,
  readOnboardingDismissed,
  requestGeolocationPermission,
  shouldShowOnboardingPrompt,
} from '@roam/types';

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
  const [userId, setUserId] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const knownOfferIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { activeRide: recoveredRide, recoveryLoaded, setActiveRide: setRecoveredRide } =
    useActiveRideRecovery();

  const syncActiveRide = useCallback(
    (ride: RideRequestRow | null) => {
      if (!ride || !isDriverActiveRideStatus(ride.status)) {
        setActiveRide(null);
        setActiveRideWaitTime(null);
        setRecoveredRide(null);
        persistActiveRideId(null);
        return;
      }
      setActiveRide((prev) => {
        const next = mergeDriverActiveRide(prev, ride);
        setRecoveredRide(next);
        persistActiveRideId(next.id);
        return next;
      });
    },
    [setRecoveredRide],
  );

  const { trackingError, gpsAccuracyM, isTracking } = useActiveRideTracking(activeRide, syncActiveRide);
  const { permissions } = useDriverPermissionPolicy();
  const [permissionOnboardingOpen, setPermissionOnboardingOpen] = useState(false);
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
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
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
      // #region agent log
      fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'adf835'},body:JSON.stringify({sessionId:'adf835',hypothesisId:'C-F',location:'useRideDispatch.ts:refreshOffers',message:'driver polled offers',data:{count:nextOffers.length,online,hasActiveRide:Boolean(activeRide?.id),activeRideStatus:activeRide?.status??null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const nextIds = new Set(nextOffers.map((o) => o.id));
      const hasNew = nextOffers.some((o) => !knownOfferIds.current.has(o.id));
      knownOfferIds.current = nextIds;
      setOffers(nextOffers);
      if (hasNew && online && audioRef.current) {
        audioRef.current.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate(200);
      }
    } catch (e: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'adf835'},body:JSON.stringify({sessionId:'adf835',hypothesisId:'F',location:'useRideDispatch.ts:refreshOffers:catch',message:'offers poll failed',data:{error:e instanceof Error?e.message:'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      /* offline / unauthorized handled elsewhere */
    }
  }, [online, activeRide?.id, activeRide?.status]);

  const pollActiveRide = useCallback(async (id: string) => {
    try {
      const { ride, wait_time } = await ridesDriverGetRequest(id);
      syncActiveRide(ride);
      setActiveRideWaitTime(wait_time ?? null);
      if (ride.status === 'completed' || ride.status === 'cancelled') {
        syncActiveRide(null);
        setActiveRideWaitTime(null);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [syncActiveRide]);

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

  useEffect(() => {
    if (!online || !navigator.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        lastCoords.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        try {
          await ridesDriverPresence({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading_degrees: pos.coords.heading ?? undefined,
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
      () => {
        toast.error('Location permission needed for ride matching');
        setOnline(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => clearGeoWatch();
  }, [online, effectiveBodyTypeSlug, clearGeoWatch]);

  useEffect(() => {
    if (!activeRide?.id) return;
    const pollMs =
      activeRide.status === 'driver_arrived_pickup' ||
      (activeRide.status === 'driver_en_route_pickup' && activeRide.wait_time_started_at)
        ? RIDE_WAIT_SYNC_MS
        : RIDE_SYNC_MS;
    const t = window.setInterval(async () => {
      const keep = await pollActiveRide(activeRide.id);
      if (!keep) window.clearInterval(t);
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
    if (!vehicleReady) {
      toast.message('Loading your profile… try again in a moment.');
      return;
    }
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device.');
      return;
    }
    const geo = await checkGeolocationGranted();
    if (isBlockedByPolicy(permissions, 'location_precise_while_using', geo)) {
      toast.error('Enable location to go online for passenger rides.');
      const next = await requestGeolocationPermission();
      setLocationGoOnlineBlocked(
        isBlockedByPolicy(permissions, 'location_precise_while_using', next),
      );
      return;
    }
    setLocationGoOnlineBlocked(false);
    setPresenceError(null);
    setOnline(true);
  }, [vehicleReady, permissions]);

  const goOffline = useCallback(async () => {
    clearGeoWatch();
    await postOfflinePresence();
    setOnline(false);
    setOffers([]);
    knownOfferIds.current.clear();
  }, [clearGeoWatch, postOfflinePresence]);

  const toggleOnline = useCallback(() => {
    if (online) {
      void goOffline();
    } else {
      void goOnline();
    }
  }, [online, goOffline, goOnline]);

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
        } else {
          toast.success('Updated');
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
      throw e;
    }
  }, [activeRide, syncActiveRide]);

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
    goOnline,
    goOffline,
    toggleOnline,
    accept,
    decline,
    advance,
    refreshOffers,
    permissions,
    permissionOnboardingOpen,
    setPermissionOnboardingOpen,
    locationGoOnlineBlocked,
  };
}
