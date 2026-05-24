import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase/client';
import type { DriverOfferWithRide, RideRequestRow } from '@roam/types/rides';
import {
  ridesDriverAcceptOffer,
  ridesDriverDeclineOffer,
  ridesDriverGetRequest,
  ridesDriverPendingOffers,
  ridesDriverPresence,
  ridesDriverTransition,
} from '../services/ridesDriverEdge';
import { slugFromBodyLabel } from '../components/rides/rideDispatchUtils';

const OFFER_POLL_MS = 4000;
const OFFER_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const DEFAULT_BODY_TYPE_SLUG = 'standard';

export function useRideDispatch() {
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferWithRide[]>([]);
  const [activeRide, setActiveRide] = useState<RideRequestRow | null>(null);
  const [bodyTypeSlug, setBodyTypeSlug] = useState<string | null>(null);
  const [vehicleReady, setVehicleReady] = useState(false);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const knownOfferIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  }, [online]);

  const pollActiveRide = useCallback(async (id: string) => {
    try {
      const { ride } = await ridesDriverGetRequest(id);
      setActiveRide(ride);
      if (ride.status === 'completed' || ride.status === 'cancelled') return false;
      return true;
    } catch {
      return false;
    }
  }, []);

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
    const t = window.setInterval(async () => {
      const keep = await pollActiveRide(activeRide.id);
      if (!keep) window.clearInterval(t);
    }, OFFER_POLL_MS);
    return () => clearInterval(t);
  }, [activeRide?.id, pollActiveRide]);

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

  const goOnline = useCallback(() => {
    if (!vehicleReady) {
      toast.message('Loading your profile… try again in a moment.');
      return;
    }
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device.');
      return;
    }
    setPresenceError(null);
    setOnline(true);
  }, [vehicleReady]);

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
      goOnline();
    }
  }, [online, goOffline, goOnline]);

  const accept = useCallback(
    async (offer: DriverOfferWithRide) => {
      try {
        const { ride } = await ridesDriverAcceptOffer(offer.id);
        setActiveRide(ride);
        toast.success('Ride assigned — head to pickup');
        await refreshOffers();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not accept');
      }
    },
    [refreshOffers],
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

  const advance = useCallback(async (status: RideRequestRow['status']) => {
    if (!activeRide) return;
    try {
      const { ride } = await ridesDriverTransition(activeRide.id, { status });
      setActiveRide(ride);
      toast.success('Updated');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    }
  }, [activeRide]);

  return {
    online,
    offers,
    activeRide,
    bodyTypeSlug: effectiveBodyTypeSlug,
    vehicleReady,
    presenceError,
    goOnline,
    goOffline,
    toggleOnline,
    accept,
    decline,
    advance,
    refreshOffers,
  };
}
