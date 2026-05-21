import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { CircleDot, LogOut, MapPin, Navigation } from 'lucide-react';
import type { FareQuoteResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { TripRouteMap } from '@/components/TripRouteMap';
import { getCurrentPosition, reverseGeocode } from '@/services/locationService';
import { ridesCreateRequest, ridesQuote } from '@/services/ridesEdge';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import { TransportOptionPicker } from '@/components/TransportOptionPicker';
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import { formatVehicleEtaLine } from '@/utils/formatRideEta';

export default function HomePage() {
  const navigate = useNavigate();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const { active: services } = useRidesVehicleTypes();
  const [vehicleOption, setVehicleOption] = useState<string>(DEFAULT_VEHICLE_OPTION);

  useEffect(() => {
    if (services.length > 0 && !services.some((s) => s.slug === vehicleOption)) {
      setVehicleOption(services[0].slug);
    }
  }, [services, vehicleOption]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [quote, setQuote] = useState<FareQuoteResponse | null>(null);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupGeolocCancelled = useRef(false);

  const coordsReady = pickup && dropoff;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const position = await getCurrentPosition();
        const address = await reverseGeocode(position.latitude, position.longitude);
        if (cancelled || pickupGeolocCancelled.current) return;
        setPickupAddress(address);
        setPickup({ lat: position.latitude, lng: position.longitude });
      } catch {
        // Permission denied or unavailable — user can search manually.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/login');
  };

  const fetchQuote = useCallback(async () => {
    if (!pickup || !dropoff) return;
    setQuoteLoading(true);
    try {
      const q = await ridesQuote({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        vehicle_option: vehicleOption,
      });
      setQuote(q);
    } catch (e: unknown) {
      setQuote(null);
      toast.error(e instanceof Error ? e.message : 'Quote failed');
    } finally {
      setQuoteLoading(false);
    }
  }, [pickup, dropoff, vehicleOption]);

  useEffect(() => {
    if (!coordsReady) {
      setQuote(null);
      return;
    }
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(() => {
      void fetchQuote();
    }, 400);
    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [coordsReady, fetchQuote]);

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
        void fetchQuote();
      }
    } finally {
      setBookLoading(false);
    }
  };

  const clearQuote = () => setQuote(null);

  const fareLabel = quote
    ? formatMoneyMinor(quote.fare_estimate_minor, quote.currency)
    : null;
  const surge = quote?.surge_multiplier ?? null;
  const canBook = coordsReady && Boolean(quote?.quote_token) && !quoteLoading;
  const vehicleEtaLine = coordsReady && quote && !quoteLoading
    ? formatVehicleEtaLine(quote)
    : null;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/90 backdrop-blur-md safe-t">
        <div className="max-w-lg mx-auto safe-x px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <Navigation className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-semibold tracking-tight truncate">Roam Rides</p>
              <p className="text-xs text-zinc-500 truncate">Book in seconds</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="btn-touch shrink-0 inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 touch-manipulation active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full safe-x safe-b px-4 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-[1.65rem] font-semibold tracking-tight leading-tight">
            Where to?
          </h1>
          <p className="text-zinc-600 text-base leading-relaxed">
            Search addresses (Jamaica). Pick a suggestion so we have exact coordinates for your driver.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl shadow-zinc-900/6 ring-1 ring-zinc-200/90 space-y-5">
          <TransportOptionPicker
            vehicles={[]}
            services={services}
            selected={vehicleOption}
            onSelect={(slug) => {
              setVehicleOption(slug);
              clearQuote();
            }}
            selectedEtaLine={vehicleEtaLine}
          />

          <RoamPlaceField
            label={
              <>
                <MapPin className="w-4 h-4 text-emerald-600" aria-hidden />
                Pickup
              </>
            }
            value={pickupAddress}
            placeholder="Search pickup (e.g. Half Way Tree)"
            clearable
            onChangeText={(text) => {
              pickupGeolocCancelled.current = true;
              setPickupAddress(text);
              setPickup(null);
              clearQuote();
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
            placeholder="Search destination"
            onChangeText={(text) => {
              setDropoffAddress(text);
              setDropoff(null);
              clearQuote();
            }}
            onResolved={({ address, lat, lng }) => {
              setDropoffAddress(address);
              setDropoff({ lat, lng });
            }}
          />

          {coordsReady && quote && !quoteLoading && (
            <TripRouteMap
              pickup={pickup}
              dropoff={dropoff}
              encodedPolyline={quote.route_polyline_encoded}
            />
          )}

          {quoteLoading && coordsReady && (
            <p className="text-sm text-zinc-500 px-1">Calculating fare…</p>
          )}

          {fareLabel && !quoteLoading && (
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-emerald-900 font-medium">Estimated fare</span>
                <span className="text-lg font-semibold tabular-nums text-emerald-950">{fareLabel}</span>
              </div>
              {quote && (
                <p className="text-xs text-emerald-800/80">
                  {quote.distance_estimate_km.toFixed(1)} km · ~{Math.round(quote.eta_trip_minutes_estimate)} min
                  {quote.duration_traffic_aware ? ' · includes traffic' : ''}
                  {quote.route_source === 'haversine_fallback' ? ' (estimate)' : ''}
                </p>
              )}
            </div>
          )}

          {surge != null && surge > 1 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2">
              Demand is high — surge <strong className="tabular-nums">×{surge.toFixed(2)}</strong> in your area.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={() => void fetchQuote()}
              disabled={quoteLoading || !coordsReady}
              className="btn-touch flex-1 rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
            >
              {quoteLoading ? 'Getting price…' : 'Refresh price'}
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={bookLoading || !canBook}
              className="btn-touch flex-1 rounded-2xl bg-emerald-600 text-white text-base font-semibold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
            >
              {bookLoading ? 'Requesting…' : 'Request ride'}
            </button>
          </div>
        </div>

        <div className="text-center pb-2">
          <Link
            to="/login"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 underline-offset-4 hover:underline"
          >
            Use a different account
          </Link>
        </div>
      </main>
    </div>
  );
}

