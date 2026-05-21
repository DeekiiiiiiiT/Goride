import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { CircleDot, Crosshair, LogOut, MapPin, Navigation } from 'lucide-react';
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

export default function HomePage() {
  const navigate = useNavigate();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAccuracy, setPickupAccuracy] = useState<number | null>(null);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const { active: services } = useRidesVehicleTypes();
  const [vehicleOption, setVehicleOption] = useState<string>(DEFAULT_VEHICLE_OPTION);

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.slug === vehicleOption)) {
      setVehicleOption(services[0].slug);
    }
  }, [services, vehicleOption]);

  const [quotesLoading, setQuotesLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [quotesBySlug, setQuotesBySlug] = useState<Record<string, FareQuoteResponse>>({});
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialGpsLoading, setInitialGpsLoading] = useState(true);

  const coordsReady = pickup && dropoff;
  const quote = vehicleOption ? quotesBySlug[vehicleOption] ?? null : null;

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
          if (!cancelled) setPickupAddress(address);
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
    setPickupAddress(location.address);
    setPickup({ lat: location.lat, lng: location.lng });
    if (location.accuracyMeters != null) {
      setPickupAccuracy(location.accuracyMeters);
    }
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/login');
  };

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
  }, [pickup, dropoff, services]);

  useEffect(() => {
    if (!coordsReady) {
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
  }, [coordsReady, fetchAllServiceQuotes]);

  const clearQuotes = () => setQuotesBySlug({});

  const handleBook = async () => {
    if (!pickup || !dropoff) {
      toast.error('Choose pickup and drop-off from the search suggestions.');
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

  const surge = quote?.surge_multiplier ?? null;
  const canBook = coordsReady && Boolean(quote?.quote_token) && !quotesLoading;

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

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100 text-zinc-900">
      {/* Hero route map — top ~42% like Uber */}
      <div className="relative h-[42dvh] min-h-[200px] max-h-[360px] w-full shrink-0">
        <BookingHeroMap
          pickup={pickup}
          dropoff={dropoff}
          encodedPolyline={quote?.route_polyline_encoded}
          quoteLoading={quotesLoading && coordsReady}
        />

        {/* Floating header on map */}
        <header className="absolute top-0 left-0 right-0 z-10 safe-t pointer-events-none">
          <div className="max-w-lg mx-auto safe-x px-3 py-3 flex items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-2.5 min-w-0 rounded-2xl bg-white/95 shadow-md border border-zinc-200/80 px-3 py-2 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Navigation className="w-4 h-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm tracking-tight truncate">Roam Rides</p>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="btn-touch shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md border border-zinc-200/80 text-zinc-700 hover:bg-white touch-manipulation"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </header>

        {/* Adjust pickup pin — always available */}
        <button
          type="button"
          onClick={() => setPickupMapOpen(true)}
          className="absolute bottom-4 right-4 z-10 flex h-11 items-center gap-2 rounded-full bg-white px-4 shadow-lg border border-zinc-200/90 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 touch-manipulation active:scale-[0.98]"
          aria-label="Adjust pickup location on map"
        >
          <Crosshair className="h-4 w-4" aria-hidden />
          <span>Adjust pin</span>
        </button>
      </div>

      {/* Bottom sheet — addresses, services, book */}
      <main className="flex-1 flex flex-col min-h-0 -mt-4 relative z-20 max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col min-h-0 rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.08)] ring-1 ring-zinc-200/80 overflow-hidden">
          <div className="shrink-0 flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-zinc-300" aria-hidden />
          </div>

          <div className="flex-1 overflow-y-auto safe-x px-4 pb-4 space-y-4">
            <div className="space-y-3 pt-1">
              <RoamPlaceField
                label={
                  <>
                    <MapPin className="w-4 h-4 text-emerald-600" aria-hidden />
                    Pickup
                  </>
                }
                value={pickupAddress}
                placeholder="Pickup location"
                clearable
                showLocationButton
                locationLoading={initialGpsLoading}
                onLocationClick={() => setPickupMapOpen(true)}
                onChangeText={(text) => {
                  setPickupAddress(text);
              setPickup(null);
              clearQuotes();
            }}
                onResolved={({ address, lat, lng }) => {
                  setPickupAddress(address);
                  setPickup({ lat, lng });
                }}
              />

              <RoamPlaceField
                label={
                  <>
                    <CircleDot className="w-4 h-4 text-emerald-600" aria-hidden />
                    Drop-off
                  </>
                }
                value={dropoffAddress}
                placeholder="Where to?"
                onChangeText={(text) => {
                  setDropoffAddress(text);
              setDropoff(null);
              clearQuotes();
            }}
                onResolved={({ address, lat, lng }) => {
                  setDropoffAddress(address);
                  setDropoff({ lat, lng });
                }}
              />
            </div>

            {surge != null && surge > 1 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2">
                Demand is high — surge <strong className="tabular-nums">×{surge.toFixed(2)}</strong>
              </p>
            )}

            {coordsReady && (
              <div className="space-y-2 pt-1 border-t border-zinc-100">
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
              <p className="text-sm text-zinc-500 text-center py-2">
                Enter pickup and destination to see ride options
              </p>
            )}
          </div>

          {/* Sticky footer CTA */}
          <div className="shrink-0 border-t border-zinc-100 bg-white safe-x safe-b px-4 py-4 space-y-3">
            {quotesLoading && coordsReady && (
              <p className="text-sm text-zinc-500 text-center">Getting prices…</p>
            )}

            <button
              type="button"
              onClick={handleBook}
              disabled={bookLoading || !canBook}
              className="btn-touch w-full rounded-2xl bg-emerald-600 text-white text-base font-semibold py-4 shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
            >
              {bookLoading
                ? 'Requesting…'
                : selectedService
                  ? `Request ${selectedService.label}`
                  : 'Request ride'}
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline-offset-4 hover:underline"
              >
                Use a different account
              </Link>
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
