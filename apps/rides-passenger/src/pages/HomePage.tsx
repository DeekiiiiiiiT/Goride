import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  Crosshair,
  Menu,
  Package,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@roam/auth-client';
import { useTheme } from '@/contexts/ThemeContext';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import {
  DEFAULT_PROFILE_AVATAR_URL,
  HOME_MAP_DARK_URL,
  HOME_MAP_LIGHT_URL,
} from '@/lib/roamHomeAssets';
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
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import { formatVehicleEtaLine } from '@/utils/formatRideEta';
import { usePermissionPolicy } from '@/hooks/usePermissionPolicy';
import { PermissionOnboardingSheet } from '@/components/PermissionOnboardingSheet';
import {
  checkGeolocationGranted,
  isBlockedByPolicy,
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

export default function HomePage() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { keyboardInset, height: viewportHeight } = useVisualViewport();
  const keyboardOpen = keyboardInset > 48;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const staticMapUrl = resolvedTheme === 'dark' ? HOME_MAP_DARK_URL : HOME_MAP_LIGHT_URL;

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
  const quote = vehicleOption ? quotesBySlug[vehicleOption] ?? null : null;
  const hasQuotes = Object.keys(quotesBySlug).length > 0;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const position: GeoPositionWithAccuracy = await getCurrentPositionWithAccuracy();
        if (cancelled) return;
        setPickup({ lat: position.lat, lng: position.lng });
        setPickupAccuracy(position.accuracyMeters);
        try {
          const address = await resolveAddressFromCoordinates(position.lat, position.lng);
          if (!cancelled) {
            setPickupAddress(address);
            setPickupSetByDevice(true);
          }
        } catch {
          // Address fill optional on first load
        }
      } catch (e) {
        console.warn('Initial GPS failed:', e);
      } finally {
        if (!cancelled) setInitialGpsLoading(false);
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

  const handleBook = async () => {
    if (!pickup || !dropoff) {
      toast.error('Choose pickup and drop-off from the search suggestions.');
      return;
    }
    const geo = await checkGeolocationGranted();
    if (isBlockedByPolicy(permissions, 'location_precise_while_using', geo)) {
      toast.error('Enable location in your browser to book a ride.');
      const next = await requestGeolocationPermission();
      setLocationBlocked(isBlockedByPolicy(permissions, 'location_precise_while_using', next));
      return;
    }
    if (!quote?.quote_token) {
      toast.error('Wait for the fare estimate, or tap Refresh price.');
      return;
    }
    setBookLoading(true);
    try {
      const { ride } = await ridesCreateRequest({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        vehicle_option: vehicleOption,
        quote_token: quote.quote_token,
        idempotency_key: crypto.randomUUID(),
        route_polyline_encoded: quote.route_polyline_encoded,
      });
      toast.success('Searching for a driver…');
      navigate(`/ride/${ride.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not request ride');
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
  const canBook =
    coordsReady && Boolean(quote?.quote_token) && !quotesLoading && !locationBlocked;

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
      etaLine: q ? formatVehicleEtaLine(q) : null,
      tripMinutes: q?.eta_trip_minutes_estimate ?? null,
    };
  }

  const emphasizeDestination =
    pickupSetByDevice &&
    Boolean(pickup) &&
    !dropoffAddress.trim() &&
    !initialGpsLoading;

  const pickupInputClassName = [
    'home-place-input',
    emphasizeDestination ? 'home-place-input--pickup-settled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const destinationInputClassName = [
    'home-place-input',
    emphasizeDestination
      ? 'home-place-input--destination-prominent'
      : 'home-place-input--destination',
  ].join(' ');

  const locationPill =
    pickupAddress.trim() ||
    (initialGpsLoading ? 'Finding your location…' : 'Set pickup on map');

  const profileSrc = avatarUrl ?? DEFAULT_PROFILE_AVATAR_URL;

  return (
    <div className="home-page relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden">
      <PermissionOnboardingSheet
        surface="rider"
        permissions={permissions}
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />

      <header
        className="fixed top-0 z-50 w-full border-b safe-t"
        style={{
          backgroundColor: 'var(--home-header-bg)',
          borderColor: 'var(--home-sheet-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/account')}
              className="rounded-full p-2 transition-colors active:scale-95 hover:opacity-80"
              style={{ color: 'var(--home-primary)' }}
              aria-label="Menu"
            >
              <Menu className="h-6 w-6" aria-hidden />
            </button>
            <span
              className="home-display text-xl font-bold"
              style={{ color: 'var(--home-primary)' }}
            >
              Roam
            </span>
          </div>
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

      <main className="relative min-h-[100dvh] w-full pt-16 pb-[5.5rem]">
        <div className="absolute inset-0 z-0">
          {pickup && dropoff ? (
            <BookingHeroMap
              pickup={pickup}
              dropoff={dropoff}
              encodedPolyline={quote?.route_polyline_encoded}
              quoteLoading={quotesLoading && coordsReady && !hasQuotes}
            />
          ) : (
            <img
              src={staticMapUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--home-map-overlay)' }} />
        </div>

        <div className="relative z-10 px-5 pt-4">
          <div
            className="inline-flex max-w-[min(100%,20rem)] items-center gap-2 rounded-full px-4 py-2 shadow-lg"
            style={{
              backgroundColor: 'var(--home-pill-bg)',
              border: '1px solid var(--home-sheet-border)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Crosshair
              className="h-5 w-5 shrink-0"
              style={{ color: 'var(--home-primary)' }}
              aria-hidden
            />
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--home-on-surface)' }}>
              {locationPill}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPickupMapOpen(true)}
          className="absolute bottom-[calc(5.5rem+min(42vh,520px))] right-4 z-20 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform active:scale-95"
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

        <div
          className="fixed left-0 z-40 w-full px-4 safe-x transition-[bottom] duration-200 ease-out"
          style={{
            bottom: keyboardOpen
              ? keyboardInset
              : 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div
            className="home-glass-sheet mx-auto max-w-xl overflow-visible rounded-3xl"
            style={{
              maxHeight: keyboardOpen
                ? Math.max(280, viewportHeight - 16)
                : 'min(78dvh, 720px)',
            }}
          >
            <div className="flex justify-center py-3">
              <div
                className="h-1.5 w-12 rounded-full"
                style={{ backgroundColor: 'color-mix(in srgb, var(--home-outline-variant) 45%, transparent)' }}
                aria-hidden
              />
            </div>

            <div className="max-h-[min(72dvh,680px)] overflow-y-auto px-5 pb-6 pt-1">
              <h1
                className="home-display mb-6 text-[30px] font-bold leading-tight tracking-tight"
                style={{ color: 'var(--home-on-surface)' }}
              >
                Where to?
              </h1>

              <div className="relative mb-6">
                <div className="absolute bottom-7 left-1 top-7 flex w-2.5 flex-col items-center">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                    style={{
                      backgroundColor: 'var(--home-primary)',
                      boxShadow: '0 0 0 4px color-mix(in srgb, var(--home-primary) 25%, transparent)',
                    }}
                  />
                  <div
                    className="my-1 w-0.5 flex-1"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--home-outline-variant) 35%, transparent)' }}
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
                        }
                        setDropoffAddress(text);
                        setDropoff(null);
                        clearQuotes();
                      }}
                    onResolved={({ address, lat, lng }) => {
                      dismissQuickActions();
                      setDropoffAddress(address);
                      setDropoff({ lat, lng });
                    }}
                  />
                </div>
              </div>

              <div
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                  quickActionsHidden
                    ? 'pointer-events-none mb-0 max-h-0 opacity-0'
                    : 'mb-6 max-h-40 opacity-100'
                }`}
                aria-hidden={quickActionsHidden}
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
                  className="mb-4 rounded-2xl border px-4 py-2 text-sm"
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

              {coordsReady && (
                <div className="mb-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--home-card-border)' }}>
                  <TransportOptionPicker
                    vehicles={[]}
                    services={services}
                    selected={vehicleOption}
                    onSelect={setVehicleOption}
                    quoteBySlug={quoteBySlug}
                  />
                </div>
              )}

              {!coordsReady && services.length > 0 && (
                <p className="mb-4 text-center text-sm" style={{ color: 'var(--home-on-surface-muted)' }}>
                  Enter pickup and destination to see ride options
                </p>
              )}

              {quotesLoading && coordsReady && (
                <p className="mb-3 text-center text-sm" style={{ color: 'var(--home-on-surface-muted)' }}>
                  Getting prices…
                </p>
              )}

              {locationBlocked && (
                <p
                  className="mb-3 rounded-2xl border px-4 py-2 text-center text-sm"
                  style={{ borderColor: 'var(--home-card-border)', color: 'var(--home-on-surface)' }}
                >
                  Location is required to book. Allow location access in your browser to continue.
                </p>
              )}

              <button
                type="button"
                onClick={handleBook}
                disabled={bookLoading || !canBook}
                className="btn-touch flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold shadow-lg transition-all active:scale-[0.97] disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--home-primary)',
                  color: 'var(--home-on-primary)',
                  boxShadow: '0 8px 24px color-mix(in srgb, var(--home-primary) 35%, transparent)',
                }}
              >
                {bookLoading ? 'Booking…' : "Let's Roam"}
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
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
    </div>
  );
}
