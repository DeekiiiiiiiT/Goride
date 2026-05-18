import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleDot, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { FareQuoteResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { TripRouteMap } from '@/components/TripRouteMap';
import { ridesQuote } from '@/services/ridesEdge';
import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  RIDES_VEHICLE_TYPES,
  vehicleCapacityDisplay,
} from '@roam/business-config';
import { formatVehicleEtaLine } from '@/utils/formatRideEta';

function formatBreakdownMinor(minor: number, currency: string) {
  return formatMoneyMinor(minor, currency);
}

export function TripCalculator() {
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [vehicleOption, setVehicleOption] = useState<string>(DEFAULT_RIDES_VEHICLE_TYPE);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<FareQuoteResponse | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coordsReady = Boolean(pickup && dropoff);

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
      const msg = e instanceof Error ? e.message : 'Quote failed';
      toast.error(msg.length > 120 ? 'Quote failed — check rides function is deployed' : msg);
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

  const clearQuote = () => setQuote(null);

  const fareLabel = quote
    ? formatMoneyMinor(quote.fare_estimate_minor, quote.currency)
    : null;
  const surge = quote?.surge_multiplier ?? null;
  const vehicleEtaLine = coordsReady && quote && !quoteLoading
    ? formatVehicleEtaLine(quote)
    : null;
  const b = quote?.fare_breakdown;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 max-w-2xl">
        Preview the same fare estimate riders see when booking. Uses live fare rules, surge, and
        routing from the rides API.
      </p>

      <div className="max-w-lg">
        <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl shadow-black/20 ring-1 ring-zinc-200/90 space-y-5 text-zinc-900">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
              Vehicle
            </p>
            <div className="space-y-2">
              {RIDES_VEHICLE_TYPES.map((v) => (
                <button
                  key={v.slug}
                  type="button"
                  onClick={() => {
                    setVehicleOption(v.slug);
                    clearQuote();
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    vehicleOption === v.slug
                      ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30'
                      : 'border-zinc-200 bg-zinc-50 hover:bg-white'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm">{v.label}</span>
                    <span className="text-xs text-zinc-500">{vehicleCapacityDisplay(v)}</span>
                  </div>
                  {vehicleEtaLine && (
                    <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">{vehicleEtaLine}</p>
                  )}
                  <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{v.description}</p>
                  {v.slug === 'courier' && (
                    <p className="text-[11px] text-zinc-500 mt-1">Send a package</p>
                  )}
                </button>
              ))}
            </div>
          </div>

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

          {coordsReady && quote && !quoteLoading && pickup && dropoff && (
            <TripRouteMap
              pickup={pickup}
              dropoff={dropoff}
              encodedPolyline={quote.route_polyline_encoded}
            />
          )}

          {quoteLoading && coordsReady && (
            <p className="text-sm text-zinc-500 px-1 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Calculating fare…
            </p>
          )}

          {fareLabel && !quoteLoading && quote && (
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-100 px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-emerald-900 font-medium">Estimated fare</span>
                <span className="text-lg font-semibold tabular-nums text-emerald-950">
                  {fareLabel}
                </span>
              </div>
              <p className="text-xs text-emerald-800/80">
                {quote.distance_estimate_km.toFixed(1)} km · ~
                {Math.round(quote.eta_trip_minutes_estimate)} min
                {quote.duration_traffic_aware ? ' · includes traffic' : ''}
                {quote.route_source === 'haversine_fallback' ? ' (route estimate)' : ''}
              </p>
              {quote.grid_cell_key && (
                <p className="text-[11px] text-emerald-800/60 font-mono">
                  Surge cell: {quote.grid_cell_key} · ×{quote.surge_multiplier.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {surge != null && surge > 1 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2">
              Demand is high — surge <strong className="tabular-nums">×{surge.toFixed(2)}</strong>{' '}
              in this area.
            </p>
          )}

          {b && fareLabel && !quoteLoading && (
            <div className="border border-zinc-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="w-full px-4 py-2.5 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 text-left"
              >
                {showBreakdown ? 'Hide' : 'Show'} fare breakdown (admin)
              </button>
              {showBreakdown && (
                <ul className="px-4 py-3 text-sm space-y-1.5 bg-white border-t border-zinc-100">
                  <li className="flex justify-between gap-2">
                    <span className="text-zinc-500">Base</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.base_minor, quote!.currency)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-zinc-500">Booking fee</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.booking_fee_minor, quote!.currency)}
                    </span>
                  </li>
                  {(b.estimated_tolls_minor ?? 0) > 0 && (
                    <li className="flex justify-between gap-2">
                      <span className="text-zinc-500">Estimated tolls</span>
                      <span className="tabular-nums">
                        {formatBreakdownMinor(b.estimated_tolls_minor ?? 0, quote!.currency)}
                      </span>
                    </li>
                  )}
                  <li className="flex justify-between gap-2">
                    <span className="text-zinc-500">Distance</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.distance_component_minor, quote!.currency)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-zinc-500">Time</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.time_component_minor, quote!.currency)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2 border-t border-zinc-100 pt-1.5">
                    <span className="text-zinc-500">Subtotal (pre-surge)</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.subtotal_before_surge_minor, quote!.currency)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-zinc-500">After surge (×{b.surge_multiplier})</span>
                    <span className="tabular-nums">
                      {formatBreakdownMinor(b.after_surge_minor, quote!.currency)}
                    </span>
                  </li>
                  {b.min_fare_applied && (
                    <li className="text-amber-700 text-xs pt-1">Minimum fare applied</li>
                  )}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void fetchQuote()}
            disabled={quoteLoading || !coordsReady}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 py-3"
          >
            <RefreshCw className={`w-4 h-4 ${quoteLoading ? 'animate-spin' : ''}`} />
            {quoteLoading ? 'Getting price…' : 'Refresh price'}
          </button>

          {!coordsReady && (
            <p className="text-xs text-zinc-500 text-center">
              Select pickup and drop-off from the address suggestions to calculate a fare.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
