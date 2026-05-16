import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { CircleDot, LogOut, MapPin, Navigation } from 'lucide-react';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { ridesCreateRequest, ridesQuote } from '@/services/ridesEdge';

function fmtUsdMinor(minor: bigint | number | string): string {
  const n = typeof minor === 'bigint' ? Number(minor) : Number(minor);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100);
}

export default function HomePage() {
  const navigate = useNavigate();
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [fareLabel, setFareLabel] = useState<string | null>(null);
  const [surge, setSurge] = useState<number | null>(null);

  const coordsReady = pickup && dropoff;

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/login');
  };

  const handleQuote = async () => {
    if (!pickup || !dropoff) {
      toast.error('Choose pickup and drop-off from the search suggestions.');
      return;
    }
    setQuoteLoading(true);
    try {
      const q = await ridesQuote({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
      });
      setFareLabel(fmtUsdMinor(q.fare_estimate_minor));
      setSurge(q.surge_multiplier);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Quote failed');
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleBook = async () => {
    if (!pickup || !dropoff) {
      toast.error('Choose pickup and drop-off from the search suggestions.');
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
        idempotency_key: crypto.randomUUID(),
      });
      toast.success('Searching for a driver…');
      navigate(`/ride/${ride.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not request ride');
    } finally {
      setBookLoading(false);
    }
  };

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
          <RoamPlaceField
            label={
              <>
                <MapPin className="w-4 h-4 text-emerald-600" aria-hidden />
                Pickup
              </>
            }
            value={pickupAddress}
            placeholder="Search pickup (e.g. Half Way Tree)"
            onChangeText={(text) => {
              setPickupAddress(text);
              setPickup(null);
              setFareLabel(null);
              setSurge(null);
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
              setFareLabel(null);
              setSurge(null);
            }}
            onResolved={({ address, lat, lng }) => {
              setDropoffAddress(address);
              setDropoff({ lat, lng });
            }}
          />

          {fareLabel && (
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-emerald-900 font-medium">Estimated fare</span>
              <span className="text-lg font-semibold tabular-nums text-emerald-950">{fareLabel}</span>
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
              onClick={handleQuote}
              disabled={quoteLoading || !coordsReady}
              className="btn-touch flex-1 rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
            >
              {quoteLoading ? 'Getting price…' : 'Fare estimate'}
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={bookLoading || !coordsReady}
              className="btn-touch flex-1 rounded-2xl bg-emerald-600 text-white text-base font-semibold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 disabled:opacity-50 touch-manipulation active:scale-[0.99]"
            >
              {bookLoading ? 'Requesting…' : 'Request ride'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-500 leading-relaxed px-2">
          Places search uses Google Maps (suggestions biased to Jamaica). The app loads a{' '}
          <strong className="text-zinc-600">Roam Rides–only</strong> key from your backend. Type at least three
          characters, then tap a result.
        </p>

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
