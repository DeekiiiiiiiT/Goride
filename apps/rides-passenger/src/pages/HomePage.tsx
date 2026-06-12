import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Package,
  Pencil,
  Tag,
  UserPlus,
  X,
} from 'lucide-react';
import { useHomeTripPicker } from '@/contexts/HomeTripPickerContext';
import { supabase } from '@roam/auth-client';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { DEFAULT_PROFILE_AVATAR_URL } from '@/lib/roamHomeAssets';
import type { FareQuoteResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { BookingHeroMap } from '@/components/BookingHeroMap';
import { PickupMapOverlay } from '@/components/PickupMapOverlay';
import { type PickupLocation } from '@/components/PickupMapSelector';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
  watchPosition,
  type GeoPositionWithAccuracy,
} from '@/services/locationService';
import { ridesCreateRequest, ridesQuote } from '@/services/ridesEdge';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import {
  TransportOptionPicker,
  type ServiceQuoteDisplay,
} from '@/components/TransportOptionPicker';
import { TripPaymentMethodBar } from '@/components/TripPaymentMethodBar';
import { TripPaymentMethodSheet } from '@/components/TripPaymentMethodSheet';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import { formatVehicleEtaLineCompact } from '@/utils/formatRideEta';
import { usePermissionPolicy } from '@/hooks/usePermissionPolicy';
import { PermissionOnboardingSheet } from '@/components/PermissionOnboardingSheet';
import {
  buildGuestPhoneE164,
  clearBookForSomeoneTrip,
  clearDelegatedBookingDrafts,
  clearGuestRecipientDraft,
  readBookForSomeoneTrip,
  readGuestRecipientDraft,
  type GuestRecipientDraft,
} from '@/lib/guestRecipientBooking';
import { PICKUP_LOCATION_REQUEST } from '@/lib/pickupLocationRequestFlags';
import { consumePickupLocationRequest } from '@/services/pickupLocationRequestEdge';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import { formatRoamTagDisplay } from '@/services/roamTagEdge';
import { withTimeout } from '@/lib/withTimeout';
import {
  checkGeolocationGranted,
  isBlockedByPolicy,
  isNativeCapacitorPlatform,
  isWebApplicable,
  permissionKeyToGrantChecker,
  readOnboardingDismissed,
  requestGeolocationPermission,
  shouldShowOnboardingPrompt,
} from '@roam/types';

const HOME_SUGGESTIONS =
  'home-suggestions overflow-y-auto rounded-2xl border py-1 shadow-lg';
const HOME_SUGGESTION_BTN =
  'home-suggestion-btn flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm disabled:opacity-50';

function truncateRouteLabel(text: string, maxLen = 44): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { setTripPickerActive } = useHomeTripPicker();
  const { keyboardInset, height: viewportHeight } = useVisualViewport();
  const keyboardOpen = keyboardInset > 48;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [guestRecipient, setGuestRecipient] = useState<GuestRecipientDraft | null>(() =>
    readGuestRecipientDraft(),
  );
  useEffect(() => {
    setGuestRecipient(readGuestRecipientDraft());
  }, []);

  useEffect(() => {
    const guest = readGuestRecipientDraft();
    let tripDraft = readBookForSomeoneTrip();
    if (tripDraft && !guest) {
      clearBookForSomeoneTrip();
      tripDraft = null;
    }

    if (tripDraft && guest) {
      setPickup({ lat: tripDraft.pickupLat, lng: tripDraft.pickupLng });
      setPickupAddress(tripDraft.pickupAddress);
      setDropoff({ lat: tripDraft.dropoffLat, lng: tripDraft.dropoffLng });
      setDropoffAddress(tripDraft.dropoffAddress);
      setDestinationChosen(true);
      setPickupSetByDevice(false);
    }

    const draft = guest;
    if (draft?.pickupPreset && !tripDraft) {
      setPickup({ lat: draft.pickupPreset.lat, lng: draft.pickupPreset.lng });
      setPickupAddress(draft.pickupPreset.address);
      setPickupSetByDevice(false);
    }
  }, []);

  useEffect(() => {
    if (keyboardOpen) {
      document.documentElement.dataset.keyboardOpen = 'true';
    } else {
      delete document.documentElement.dataset.keyboardOpen;
    }
    return () => {
      delete document.documentElement.dataset.keyboardOpen;
    };
  }, [keyboardOpen]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const url =
        (user?.user_metadata?.avatar_url as string | undefined) ||
        (user?.user_metadata?.picture as string | undefined) ||
        null;
      setAvatarUrl(url);
    });
  }, []);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAccuracy, setPickupAccuracy] = useState<number | null>(null);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [quickActionsHidden, setQuickActionsHidden] = useState(false);
  /** Full address fields vs compact trip summary when pickup + dropoff are set. */
  const [routeExpanded, setRouteExpanded] = useState(true);
  /** User picked a destination — show pickup field (stays while they edit destination text). */
  const [destinationChosen, setDestinationChosen] = useState(false);
  /** Pickup was filled from device GPS (grey field until user edits pickup). */
  const [pickupSetByDevice, setPickupSetByDevice] = useState(false);
  const { active: services } = useRidesVehicleTypes();
  const [vehicleOption, setVehicleOption] = useState<string>(DEFAULT_VEHICLE_OPTION);
  const serviceSlugs = useMemo(
    () => services.map((s) => s.slug).join(','),
    [services],
  );

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.slug === vehicleOption)) {
      setVehicleOption(services[0].slug);
    }
  }, [serviceSlugs, vehicleOption, services]);

  const [quotesLoading, setQuotesLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const { selectedId: selectedPaymentId, selectedMethod: selectedPayment, select: setSelectedPaymentId } =
    useDefaultPaymentMethod();
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  const [quotesBySlug, setQuotesBySlug] = useState<Record<string, FareQuoteResponse>>({});
  const { permissions } = usePermissionPolicy('rider');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [locationBlocked, setLocationBlocked] = useState(false);

  useEffect(() => {
    if (!permissions.length) return;
    void (async () => {
      for (const row of permissions) {
        if (!row.enabled || !row.prompt_onboarding || !isWebApplicable(row.platform)) continue;
        const grant = await permissionKeyToGrantChecker(row.key)();
        if (shouldShowOnboardingPrompt(row, grant, readOnboardingDismissed('rider', row.key))) {
          setOnboardingOpen(true);
          return;
        }
      }
    })();
  }, [permissions]);

  useEffect(() => {
    void (async () => {
      if (!permissions.length) return;
      const geo = await checkGeolocationGranted();
      setLocationBlocked(isBlockedByPolicy(permissions, 'location_precise_while_using', geo));
    })();
  }, [permissions]);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialGpsLoading, setInitialGpsLoading] = useState(true);

  const coordsReady = pickup && dropoff;
  const showCompactRoute = coordsReady && !routeExpanded;
  /** Pickup field hidden until destination is chosen (GPS still fills pickup in background). */
  const showPickupField = destinationChosen;

  useEffect(() => {
    if (coordsReady) setRouteExpanded(false);
    else setRouteExpanded(true);
  }, [coordsReady]);

  const showRouteMap = coordsReady;
  const hasSelectedService = services.some((s) => s.slug === vehicleOption);
  const showBookCta = coordsReady && hasSelectedService;

  useEffect(() => {
    setTripPickerActive(coordsReady);
    return () => setTripPickerActive(false);
  }, [coordsReady, setTripPickerActive]);

  const handleBackToHome = useCallback(() => {
    if (quoteDebounceRef.current) {
      clearTimeout(quoteDebounceRef.current);
      quoteDebounceRef.current = null;
    }
    clearBookForSomeoneTrip();
    setPickupAddress('');
    setPickup(null);
    setPickupAccuracy(null);
    setPickupSetByDevice(false);
    setDropoffAddress('');
    setDropoff(null);
    setDestinationChosen(false);
    setRouteExpanded(true);
    setQuickActionsHidden(false);
    setQuotesBySlug({});
    setQuotesLoading(false);
  }, []);

  const refreshPickupFromDevice = useCallback(async () => {
    setInitialGpsLoading(true);
    try {
      const position = await getCurrentPositionWithAccuracy();
      setPickup({ lat: position.lat, lng: position.lng });
      setPickupAccuracy(position.accuracyMeters);
      const address = await resolveAddressFromCoordinates(position.lat, position.lng);
      setPickupAddress(address);
      setPickupSetByDevice(true);
    } catch (e) {
      console.warn('GPS refresh failed:', e);
    } finally {
      setInitialGpsLoading(false);
    }
  }, []);

  const clearGuestRecipient = useCallback(() => {
    clearDelegatedBookingDrafts();
    setGuestRecipient(null);
    handleBackToHome();
    void refreshPickupFromDevice();
  }, [handleBackToHome, refreshPickupFromDevice]);

  const quote = vehicleOption ? quotesBySlug[vehicleOption] ?? null : null;
  const hasQuotes = Object.keys(quotesBySlug).length > 0;

  useEffect(() => {
    let cancelled = false;

    const tripDraft = readBookForSomeoneTrip();
    const guestDraft = readGuestRecipientDraft();
    const hasPresetPickup =
      (Boolean(tripDraft) && Boolean(guestDraft)) ||
      Boolean(guestDraft?.pickupPreset);

    if (hasPresetPickup) {
      setInitialGpsLoading(false);
      return;
    }

    void (async () => {
      let lat: number | null = null;
      let lng: number | null = null;

      try {
        const position: GeoPositionWithAccuracy = await getCurrentPositionWithAccuracy();
        if (cancelled) return;
        lat = position.lat;
        lng = position.lng;
        setPickup({ lat, lng });
        setPickupAccuracy(position.accuracyMeters);
      } catch (e) {
        console.warn('Initial GPS failed:', e);
      } finally {
        if (!cancelled) setInitialGpsLoading(false);
      }

      if (cancelled || lat == null || lng == null) return;

      try {
        const address = await resolveAddressFromCoordinates(lat, lng);
        if (!cancelled) {
          setPickupAddress(address);
          setPickupSetByDevice(true);
        }
      } catch {
        // Address label optional — coords already set for booking
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stopWatching = watchPosition(
      (position) => {
        setPickupAccuracy(position.accuracyMeters);
      },
      (error) => {
        console.warn('Position watch error:', error);
      },
    );

    return stopWatching;
  }, []);

  const handlePickupChange = useCallback((location: PickupLocation) => {
    setPickupSetByDevice(false);
    setPickupAddress(location.address);
    setPickup({ lat: location.lat, lng: location.lng });
    if (location.accuracyMeters != null) {
      setPickupAccuracy(location.accuracyMeters);
    }
  }, []);

  const fetchAllServiceQuotes = useCallback(async () => {
    if (!pickup || !dropoff || services.length === 0) return;
    setQuotesLoading(true);
    const coords = {
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
    };

    const results = await Promise.allSettled(
      services.map((s) =>
        ridesQuote({ ...coords, vehicle_option: s.slug }),
      ),
    );

    const next: Record<string, FareQuoteResponse> = {};
    let anySuccess = false;
    results.forEach((result, i) => {
      const slug = services[i].slug;
      if (result.status === 'fulfilled') {
        next[slug] = result.value;
        anySuccess = true;
      }
    });

    setQuotesBySlug(next);
    setQuotesLoading(false);

    if (!anySuccess) {
      const firstErr = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      toast.error(
        firstErr?.reason instanceof Error
          ? firstErr.reason.message
          : 'Could not get fares',
      );
    }
  }, [pickup, dropoff, serviceSlugs]);

  /** Stable key so quote fetch only runs when coords or service list actually change. */
  const quoteFetchKey = useMemo(() => {
    if (!pickup || !dropoff) return '';
    return [
      pickup.lat.toFixed(5),
      pickup.lng.toFixed(5),
      dropoff.lat.toFixed(5),
      dropoff.lng.toFixed(5),
      serviceSlugs,
    ].join('|');
  }, [pickup, dropoff, serviceSlugs]);

  useEffect(() => {
    if (!quoteFetchKey) {
      setQuotesBySlug({});
      return;
    }
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(() => {
      void fetchAllServiceQuotes();
    }, 400);
    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [quoteFetchKey, fetchAllServiceQuotes]);

  const clearQuotes = () => setQuotesBySlug({});

  const manualRouteReady = Boolean(pickup && dropoff);

  const locationOkForBooking = useCallback(
    (geo: Awaited<ReturnType<typeof checkGeolocationGranted>>) => {
      const blockedByLocation = isBlockedByPolicy(
        permissions,
        'location_precise_while_using',
        geo,
      );
      return !blockedByLocation || (isNativeCapacitorPlatform() && manualRouteReady);
    },
    [permissions, manualRouteReady],
  );

  const handleBook = async () => {
    setBookError(null);

    if (!pickup || !dropoff) {
      const msg = 'Choose pickup and drop-off from the search suggestions.';
      setBookError(msg);
      toast.error(msg);
      return;
    }

    if (initialGpsLoading && !manualRouteReady) {
      const msg = 'Still finding your location — wait a moment or set pickup on the map.';
      setBookError(msg);
      toast.error(msg);
      return;
    }

    if (!quote?.quote_token) {
      const msg = quotesLoading
        ? 'Loading fares…'
        : 'Could not get a fare — edit your trip and try again.';
      setBookError(msg);
      toast.error(msg);
      if (!quotesLoading) void fetchAllServiceQuotes();
      return;
    }

    setBookLoading(true);
    try {
      await withTimeout(
        (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            const msg = 'Sign in to book a ride.';
            setBookError(msg);
            toast.error(msg);
            navigate('/login');
            return;
          }

          if (!locationAllowsBooking) {
            const geo = await checkGeolocationGranted();
            if (!locationOkForBooking(geo)) {
              const msg = 'Enable location in your device settings to book a ride.';
              setBookError(msg);
              toast.error(msg);
              const next = await requestGeolocationPermission();
              setLocationBlocked(
                isBlockedByPolicy(permissions, 'location_precise_while_using', next),
              );
              return;
            }
          }

          if (guestRecipient && !guestRecipient.passengerUserId) {
            const msg = 'The passenger must authorize before you can book.';
            setBookError(msg);
            toast.error(msg);
            return;
          }

          const rideBodyBase = {
            pickup_lat: pickup.lat,
            pickup_lng: pickup.lng,
            dropoff_lat: dropoff.lat,
            dropoff_lng: dropoff.lng,
            pickup_address: pickupAddress,
            dropoff_address: dropoffAddress,
            vehicle_option: vehicleOption,
            idempotency_key: createIdempotencyKey(),
            payment_method: selectedPayment.ridePaymentMethod,
            ...(guestRecipient
              ? {
                  guest_passenger_name: guestRecipient.fullName.trim(),
                  guest_passenger_phone: buildGuestPhoneE164(
                    guestRecipient.countryCode,
                    guestRecipient.phone,
                  ),
                  ...(guestRecipient.contactId ? { rider_contact_id: guestRecipient.contactId } : {}),
                  ...(guestRecipient.passengerUserId
                    ? { passenger_user_id: guestRecipient.passengerUserId }
                    : {}),
                  ...(guestRecipient.passengerAuthorizationId
                    ? { passenger_authorization_id: guestRecipient.passengerAuthorizationId }
                    : {}),
                }
              : {}),
          };

          const submitRide = async (quoteToken: string, routePolyline?: string | null) =>
            ridesCreateRequest({
              ...rideBodyBase,
              quote_token: quoteToken,
              route_polyline_encoded: routePolyline ?? undefined,
            });

          let activeQuote = quote!;
          try {
            const { ride } = await submitRide(
              activeQuote.quote_token,
              activeQuote.route_polyline_encoded,
            );
            if (PICKUP_LOCATION_REQUEST && guestRecipient?.pickupLocationRequestId) {
              void consumePickupLocationRequest(guestRecipient.pickupLocationRequestId).catch(
                () => undefined,
              );
            }
            clearDelegatedBookingDrafts();
            toast.success('Searching for a driver…');
            navigate(`/ride/${ride.id}`);
          } catch (createErr: unknown) {
            const createMsg = createErr instanceof Error ? createErr.message : '';
            if (!createMsg.includes('expired')) throw createErr;

            activeQuote = await ridesQuote({
              pickup_lat: pickup.lat,
              pickup_lng: pickup.lng,
              dropoff_lat: dropoff.lat,
              dropoff_lng: dropoff.lng,
              vehicle_option: vehicleOption,
            });
            setQuotesBySlug((prev) => ({ ...prev, [vehicleOption]: activeQuote }));
            const { ride } = await submitRide(
              activeQuote.quote_token,
              activeQuote.route_polyline_encoded,
            );
            if (PICKUP_LOCATION_REQUEST && guestRecipient?.pickupLocationRequestId) {
              void consumePickupLocationRequest(guestRecipient.pickupLocationRequestId).catch(
                () => undefined,
              );
            }
            clearDelegatedBookingDrafts();
            toast.success('Searching for a driver…');
            navigate(`/ride/${ride.id}`);
          }
        })(),
        30_000,
        'Booking timed out — check your connection and try again.',
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not request ride';
      setBookError(msg);
      toast.error(msg);
      if (e instanceof Error && e.message.includes('expired')) {
        void fetchAllServiceQuotes();
      }
    } finally {
      setBookLoading(false);
    }
  };

  const dismissQuickActions = useCallback(() => {
    setQuickActionsHidden(true);
  }, []);

  const surge = quote?.surge_multiplier ?? null;
  const locationAllowsBooking =
    !locationBlocked || (isNativeCapacitorPlatform() && manualRouteReady);

  const selectedService = services.find((s) => s.slug === vehicleOption);

  const quoteBySlug: Record<string, ServiceQuoteDisplay> = {};
  for (const s of services) {
    const q = quotesBySlug[s.slug];
    quoteBySlug[s.slug] = {
      loading: quotesLoading && !q,
      unavailable: !quotesLoading && coordsReady && !q,
      fareLabel: q
        ? formatMoneyMinor(q.fare_estimate_minor, q.currency)
        : null,
      etaLine: q ? formatVehicleEtaLineCompact(q) : null,
      tripMinutes: q?.eta_trip_minutes_estimate ?? null,
    };
  }

  const pickupInputClassName = [
    'home-place-input',
    pickupSetByDevice ? 'home-place-input--pickup-settled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const destinationInputClassName = [
    'home-place-input',
    !showPickupField
      ? 'home-place-input--destination-prominent'
      : 'home-place-input--destination',
  ].join(' ');

  const showQuickActions = !quickActionsHidden && !destinationChosen;

  const locationPill =
    pickupAddress.trim() ||
    (initialGpsLoading ? 'Finding your location…' : 'Set pickup on map');

  const profileSrc = avatarUrl ?? DEFAULT_PROFILE_AVATAR_URL;

  const bookingActionsBottom = keyboardOpen
    ? keyboardInset
    : coordsReady
      ? 'env(safe-area-inset-bottom, 0px)'
      : 'calc(var(--home-nav-h) + env(safe-area-inset-bottom, 0px))';

  const sheetBottom = keyboardOpen
    ? keyboardInset
    : coordsReady
      ? 'calc(var(--home-booking-actions-h) + env(safe-area-inset-bottom, 0px))'
      : 'calc(var(--home-nav-h) + var(--home-booking-actions-h) + env(safe-area-inset-bottom, 0px))';

  const keyboardSheetHeight = keyboardOpen
    ? Math.max(280, viewportHeight - keyboardInset - (coordsReady ? 168 : 88))
    : 0;

  const homePageStyle = keyboardOpen
    ? ({
        '--home-booking-stack-h': `calc(${keyboardInset}px + ${keyboardSheetHeight}px + env(safe-area-inset-bottom, 0px))`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`home-page relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden ${
        coordsReady ? 'home-page--booking-ready home-page--trip-picker' : ''
      } ${showBookCta ? 'home-page--has-book-cta' : ''}`}
      style={homePageStyle}
    >
      <PermissionOnboardingSheet
        surface="rider"
        permissions={permissions}
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />

      {!showRouteMap && (
        <header
          className="home-header fixed top-0 z-50 w-full border-b safe-t"
          style={{
            backgroundColor: 'var(--home-header-bg)',
            borderColor: 'var(--home-sheet-border)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
            <span
              className="home-display text-xl font-bold"
              style={{ color: 'var(--home-primary)' }}
            >
              Roam
            </span>
            <button
              type="button"
              onClick={() => navigate('/account')}
              className="h-10 w-10 overflow-hidden rounded-full border-2 active:scale-95"
              style={{ borderColor: 'color-mix(in srgb, var(--home-outline-variant) 50%, transparent)' }}
              aria-label="Account"
            >
              <img src={profileSrc} alt="" className="h-full w-full object-cover" />
            </button>
          </div>
        </header>
      )}

      <div className="home-booking-backdrop" aria-hidden />

      {showRouteMap && pickup && dropoff && (
        <div className="home-map-stage home-map-stage--trip-picker">
          <BookingHeroMap
            pickup={pickup}
            dropoff={dropoff}
            encodedPolyline={quote?.route_polyline_encoded}
            quoteLoading={quotesLoading && !hasQuotes}
          />

          <button
            type="button"
            onClick={handleBackToHome}
            className="home-map-stage__back flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 touch-manipulation"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setPickupMapOpen(true)}
            className="home-map-stage__adjust-pin flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--home-pill-bg)',
              color: 'var(--home-primary)',
              border: '1px solid var(--home-sheet-border)',
            }}
            aria-label="Adjust pickup on map"
          >
            <Crosshair className="h-4 w-4" aria-hidden />
            Adjust pin
          </button>
        </div>
      )}

      {showBookCta && (
        <div
          className="home-booking-actions safe-x transition-[bottom] duration-200 ease-out"
          style={{ bottom: bookingActionsBottom }}
        >
          <div className="home-booking-actions__inner px-1">
            {locationBlocked && !locationAllowsBooking && (
              <p
                className="mb-3 rounded-2xl border px-4 py-2 text-center text-sm"
                style={{ borderColor: 'var(--home-card-border)', color: 'var(--home-on-surface)' }}
              >
                Location is required to book. Allow location access in your device settings to continue.
              </p>
            )}

            {bookError && (
              <p
                className="mb-3 rounded-2xl border px-4 py-2 text-center text-sm"
                style={{
                  borderColor: 'color-mix(in srgb, #dc2626 35%, var(--home-card-border))',
                  color: '#b91c1c',
                  backgroundColor: 'color-mix(in srgb, #dc2626 8%, var(--home-panel-solid))',
                }}
                role="alert"
              >
                {bookError}
              </p>
            )}

            <TripPaymentMethodBar
              method={selectedPayment}
              onPress={() => setPaymentSheetOpen(true)}
            />

            <button
              type="button"
              onClick={() => void handleBook()}
              disabled={bookLoading}
              className="btn-touch mt-3 flex h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl text-lg font-semibold shadow-lg transition-all active:scale-[0.97] disabled:opacity-50"
              style={{
                backgroundColor: 'var(--home-primary)',
                color: 'var(--home-on-primary)',
                boxShadow: '0 8px 24px color-mix(in srgb, var(--home-primary) 35%, transparent)',
              }}
            >
              {bookLoading
                ? 'Booking…'
                : guestRecipient
                  ? `Book for ${guestRecipient.fullName.trim()}`
                  : "Let's Roam"}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <main className="relative min-h-[100dvh] w-full pointer-events-none">

        {coordsReady && locationBlocked && !showBookCta && (
          <p
            className="pointer-events-auto fixed left-4 right-4 z-[45] rounded-2xl border px-4 py-2 text-center text-sm safe-x"
            style={{
              bottom: sheetBottom,
              borderColor: 'var(--home-card-border)',
              color: 'var(--home-on-surface)',
              backgroundColor: 'var(--home-panel-solid)',
            }}
          >
            Location is required to book. Allow location access in your device settings to continue.
          </p>
        )}

        <div
          className="home-booking-anchor pointer-events-auto fixed left-0 z-40 w-full px-4 safe-x transition-[bottom] duration-200 ease-out"
          style={{ bottom: sheetBottom }}
        >
          <div
            className={`home-glass-sheet home-booking-sheet mx-auto max-w-xl overflow-hidden rounded-3xl ${
              keyboardOpen ? 'home-booking-sheet--keyboard' : ''
            } ${coordsReady ? 'home-booking-sheet--quotes' : ''}`}
            style={
              keyboardOpen
                ? {
                    maxHeight: Math.max(
                      280,
                      viewportHeight - keyboardInset - (coordsReady ? 168 : 88),
                    ),
                  }
                : undefined
            }
          >
            <div
              className={`flex shrink-0 justify-center ${coordsReady && !keyboardOpen ? 'py-2' : 'py-3'}`}
            >
              <div
                className="h-1.5 w-12 rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--home-outline-variant) 45%, transparent)' }}
                aria-hidden
              />
            </div>

            <div className="home-booking-sheet__top px-5 pb-3 pt-1">
              {guestRecipient ? (
                <div
                  className="mb-3 flex items-start gap-3 rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: 'var(--home-card-border)',
                    backgroundColor: 'color-mix(in srgb, var(--home-primary) 8%, transparent)',
                  }}
                >
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--home-secondary-container)' }}
                  >
                    {guestRecipient.roamTagName ? (
                      <Tag
                        className="h-4 w-4"
                        style={{ color: 'var(--home-primary)' }}
                        aria-hidden
                      />
                    ) : (
                      <UserPlus
                        className="h-4 w-4"
                        style={{ color: 'var(--home-primary)' }}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-bold uppercase tracking-wide"
                      style={{ color: 'var(--home-on-surface-muted)' }}
                    >
                      Booking for someone else
                    </p>
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--home-on-surface)' }}>
                      {guestRecipient.fullName.trim()}
                    </p>
                    {guestRecipient.roamTagName ? (
                      <p className="text-xs font-semibold" style={{ color: 'var(--home-primary)' }}>
                        {formatRoamTagDisplay(guestRecipient.roamTagName)}
                      </p>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--home-on-surface-muted)' }}>
                        SMS updates to{' '}
                        {buildGuestPhoneE164(guestRecipient.countryCode, guestRecipient.phone)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearGuestRecipient}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{ color: 'var(--home-on-surface-muted)' }}
                    aria-label="Cancel booking for someone else"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}

              {showCompactRoute ? (
                <>
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={handleBackToHome}
                    className="flex h-9 w-9 items-center justify-center rounded-full border touch-manipulation transition-transform active:scale-95"
                    style={{
                      borderColor: 'var(--home-card-border)',
                      backgroundColor: 'var(--home-card-bg)',
                      color: 'var(--home-on-surface)',
                    }}
                    aria-label="Back to home"
                  >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </button>
                </div>
                <div className="mb-2">
                  <button
                    type="button"
                    className="home-route-summary touch-manipulation"
                    onClick={() => setRouteExpanded(true)}
                    aria-label="Edit pickup and destination"
                  >
                    <div className="home-route-summary__dots" aria-hidden>
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: 'var(--home-primary)',
                          boxShadow: '0 0 0 3px color-mix(in srgb, var(--home-primary) 22%, transparent)',
                        }}
                      />
                      <div className="home-route-summary__line" />
                      <div
                        className="h-2 w-2 shrink-0"
                        style={{ backgroundColor: 'var(--home-on-surface)' }}
                      />
                    </div>
                    <div className="home-route-summary__addresses">
                      <p className="home-route-summary__row">
                        {truncateRouteLabel(pickupAddress || 'Pickup')}
                      </p>
                      <p className="home-route-summary__row">
                        {truncateRouteLabel(dropoffAddress || 'Destination')}
                      </p>
                    </div>
                    <span className="home-route-summary__edit">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </span>
                  </button>
                </div>
                </>
              ) : (
                <>
              <div className="mb-4 flex items-end justify-between gap-3">
                <h1
                  className="home-display text-[30px] font-bold leading-tight tracking-tight"
                  style={{ color: 'var(--home-on-surface)' }}
                >
                  Where to?
                </h1>
                {coordsReady && routeExpanded && (
                  <button
                    type="button"
                    onClick={() => setRouteExpanded(false)}
                    className="shrink-0 pb-1 text-sm font-semibold touch-manipulation"
                    style={{ color: 'var(--home-primary)' }}
                  >
                    Done
                  </button>
                )}
              </div>

              <div className="relative mb-6">
                {showPickupField ? (
                  <>
                    <div className="absolute bottom-7 left-1 top-7 flex w-2.5 flex-col items-center">
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                        style={{
                          backgroundColor: 'var(--home-primary)',
                          boxShadow:
                            '0 0 0 4px color-mix(in srgb, var(--home-primary) 25%, transparent)',
                        }}
                      />
                      <div
                        className="my-1 w-0.5 flex-1"
                        style={{
                          backgroundColor:
                            'color-mix(in srgb, var(--home-outline-variant) 35%, transparent)',
                        }}
                      />
                      <div
                        className="h-2.5 w-2.5 shrink-0"
                        style={{ backgroundColor: 'var(--home-on-surface)' }}
                      />
                    </div>
                    <div className="space-y-3 pl-10">
                      <RoamPlaceField
                        hideLabel
                        label="Pickup"
                        value={pickupAddress}
                        placeholder="Current location"
                        clearable
                        showLocationButton
                        locationLoading={initialGpsLoading}
                        onLocationClick={() => setPickupMapOpen(true)}
                        inputClassName={pickupInputClassName}
                        suggestionsListClassName={HOME_SUGGESTIONS}
                        suggestionButtonClassName={HOME_SUGGESTION_BTN}
                        portalSuggestions
                        onChangeText={(text) => {
                          setPickupSetByDevice(false);
                          if (text.trim()) {
                            dismissQuickActions();
                          } else if (!dropoffAddress.trim()) {
                            setQuickActionsHidden(false);
                          }
                          setPickupAddress(text);
                          setPickup(null);
                          clearQuotes();
                        }}
                        onResolved={({ address, lat, lng }) => {
                          setPickupSetByDevice(false);
                          dismissQuickActions();
                          setPickupAddress(address);
                          setPickup({ lat, lng });
                        }}
                      />
                      <RoamPlaceField
                        hideLabel
                        label="Destination"
                        value={dropoffAddress}
                        placeholder="Enter destination"
                        clearable
                        trailingIcon="search"
                        inputClassName={destinationInputClassName}
                        suggestionsListClassName={HOME_SUGGESTIONS}
                        suggestionButtonClassName={HOME_SUGGESTION_BTN}
                        portalSuggestions
                        onChangeText={(text) => {
                          if (text.trim()) {
                            dismissQuickActions();
                          } else {
                            setQuickActionsHidden(false);
                            setDestinationChosen(false);
                          }
                          setDropoffAddress(text);
                          setDropoff(null);
                          clearQuotes();
                        }}
                        onResolved={({ address, lat, lng }) => {
                          dismissQuickActions();
                          setDestinationChosen(true);
                          setDropoffAddress(address);
                          setDropoff({ lat, lng });
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <RoamPlaceField
                      hideLabel
                      label="Destination"
                      value={dropoffAddress}
                      placeholder="Where to?"
                      clearable
                      trailingIcon="search"
                      inputClassName={destinationInputClassName}
                      suggestionsListClassName={HOME_SUGGESTIONS}
                      suggestionButtonClassName={HOME_SUGGESTION_BTN}
                      portalSuggestions
                      onChangeText={(text) => {
                        if (text.trim()) {
                          dismissQuickActions();
                        } else {
                          setQuickActionsHidden(false);
                          setDestinationChosen(false);
                        }
                        setDropoffAddress(text);
                        setDropoff(null);
                        clearQuotes();
                      }}
                      onResolved={({ address, lat, lng }) => {
                        dismissQuickActions();
                        setDestinationChosen(true);
                        setDropoffAddress(address);
                        setDropoff({ lat, lng });
                      }}
                    />
                  </div>
                )}
              </div>

              <div
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                  showQuickActions
                    ? 'mb-6 max-h-40 opacity-100'
                    : 'pointer-events-none mb-0 max-h-0 opacity-0'
                }`}
                aria-hidden={!showQuickActions}
              >
                <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/services/book-for-someone')}
                  className="flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl border p-4 text-center transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--home-card-bg)',
                    borderColor: 'var(--home-card-border)',
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--home-secondary-container)' }}
                  >
                    <UserPlus
                      className="h-5 w-5"
                      style={{ color: 'var(--home-on-secondary-container, #636467)' }}
                      aria-hidden
                    />
                  </div>
                  <span className="text-sm font-semibold leading-tight">Pick up Someone</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/services/courier')}
                  className="flex min-h-[7.5rem] flex-col items-center justify-center gap-3 rounded-2xl border p-4 text-center transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--home-card-bg)',
                    borderColor: 'var(--home-card-border)',
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--home-tertiary-dim)' }}
                  >
                    <Package className="h-5 w-5" style={{ color: 'var(--home-primary)' }} aria-hidden />
                  </div>
                  <span className="text-sm font-semibold leading-tight">Courier</span>
                </button>
                </div>
              </div>

              {surge != null && surge > 1 && (
                <p
                  className="mb-3 rounded-2xl border px-4 py-2 text-sm"
                  style={{
                    color: 'var(--home-on-surface)',
                    borderColor: 'var(--home-card-border)',
                    backgroundColor: 'color-mix(in srgb, var(--home-primary) 8%, transparent)',
                  }}
                >
                  Demand is high — surge{' '}
                  <strong className="tabular-nums">×{surge.toFixed(2)}</strong>
                </p>
              )}
                </>
              )}

              {showCompactRoute && surge != null && surge > 1 && (
                <p
                  className="mb-3 rounded-2xl border px-4 py-2 text-sm"
                  style={{
                    color: 'var(--home-on-surface)',
                    borderColor: 'var(--home-card-border)',
                    backgroundColor: 'color-mix(in srgb, var(--home-primary) 8%, transparent)',
                  }}
                >
                  Demand is high — surge{' '}
                  <strong className="tabular-nums">×{surge.toFixed(2)}</strong>
                </p>
              )}
            </div>

            {coordsReady && (
              <div
                className="home-booking-sheet__services min-h-0 flex-1 px-5"
                aria-label="Ride services"
                role="region"
              >
                {quotesLoading && (
                  <p
                    className="mb-2 shrink-0 text-center text-sm"
                    style={{ color: 'var(--home-on-surface-muted)' }}
                  >
                    Getting prices…
                  </p>
                )}
                <TransportOptionPicker
                  vehicles={[]}
                  services={services}
                  selected={vehicleOption}
                  onSelect={setVehicleOption}
                  density="compact"
                  quoteBySlug={quoteBySlug}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <PickupMapOverlay
        open={pickupMapOpen}
        onClose={() => setPickupMapOpen(false)}
        pickup={pickup}
        accuracy={pickupAccuracy}
        onPickupChange={handlePickupChange}
        isLoading={initialGpsLoading}
      />

      <TripPaymentMethodSheet
        open={paymentSheetOpen}
        selectedId={selectedPaymentId}
        onClose={() => setPaymentSheetOpen(false)}
        onSelect={setSelectedPaymentId}
      />
    </div>
  );
}
