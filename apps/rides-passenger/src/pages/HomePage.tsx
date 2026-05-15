import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { MapPin, LogOut } from 'lucide-react';
import { ridesCreateRequest, ridesQuote } from '@/services/ridesEdge';

/** Demo coordinates — replace with map picker / places autocomplete in production. */
const DEFAULT_PICKUP = { lat: 18.0179, lng: -76.8099 };
const DEFAULT_DROPOFF = { lat: 18.0281, lng: -76.7436 };

function fmtUsdMinor(minor: bigint | number | string): string {
  const n = typeof minor === 'bigint' ? Number(minor) : Number(minor);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n / 100);
}

export default function HomePage() {
  const navigate = useNavigate();
  const [pickupAddress, setPickupAddress] = useState('Kingston — pickup');
  const [dropoffAddress, setDropoffAddress] = useState('Kingston — drop-off');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [bookLoading, setBookLoading] = useState(false);
  const [fareLabel, setFareLabel] = useState<string | null>(null);
  const [surge, setSurge] = useState<number | null>(null);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
    navigate('/login');
  };

  const handleQuote = async () => {
    setQuoteLoading(true);
    try {
      const q = await ridesQuote({
        pickup_lat: DEFAULT_PICKUP.lat,
        pickup_lng: DEFAULT_PICKUP.lng,
        dropoff_lat: DEFAULT_DROPOFF.lat,
        dropoff_lng: DEFAULT_DROPOFF.lng,
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
    setBookLoading(true);
    try {
      const { ride } = await ridesCreateRequest({
        pickup_lat: DEFAULT_PICKUP.lat,
        pickup_lng: DEFAULT_PICKUP.lng,
        dropoff_lat: DEFAULT_DROPOFF.lat,
        dropoff_lng: DEFAULT_DROPOFF.lng,
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-zinc-700" />
            <span className="font-semibold tracking-tight">Roam Rides</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <LogOut className="w-4 h-4" /> Out
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Where to?</h1>
          <p className="text-sm text-zinc-500">Uber-style matching runs on Roam’s rides service.</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Pickup</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Drop-off</label>
            <input
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              value={dropoffAddress}
              onChange={(e) => setDropoffAddress(e.target.value)}
            />
          </div>

          {fareLabel && (
            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2 text-sm flex justify-between">
              <span className="text-zinc-600">Estimated fare</span>
              <span className="font-medium tabular-nums">{fareLabel}</span>
            </div>
          )}
          {surge != null && surge > 1 && (
            <p className="text-xs text-amber-700">Surge x{surge.toFixed(2)} in this grid cell.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleQuote}
              disabled={quoteLoading}
              className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              {quoteLoading ? 'Pricing…' : 'Fare estimate'}
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={bookLoading}
              className="flex-1 rounded-xl bg-zinc-900 text-white py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
            >
              {bookLoading ? 'Requesting…' : 'Request ride'}
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-400 text-center">
          Demo pickup/drop coordinates are fixed in code — swap for map UX next.
        </p>

        <div className="text-center">
          <Link to="/login" className="text-xs text-zinc-400 hover:text-zinc-600">
            Switch account
          </Link>
        </div>
      </main>
    </div>
  );
}
