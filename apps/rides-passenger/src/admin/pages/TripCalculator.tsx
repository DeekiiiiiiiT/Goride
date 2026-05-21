import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleDot, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { FareQuoteResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { TripRouteMap } from '@/components/TripRouteMap';
import { ridesQuote } from '@/services/ridesEdge';
import { DEFAULT_VEHICLE_OPTION } from '@/types/vehicleTypes';
import { TransportOptionPicker } from '@/components/TransportOptionPicker';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';
import { formatVehicleEtaLine } from '@/utils/formatRideEta';

function formatBreakdownMinor(minor: number, currency: string) {
  return formatMoneyMinor(minor, currency);
}

function formatRatePer(minor: number | undefined, currency: string, unit: 'km' | 'min') {
  if (minor == null) return '—';
  return `${formatMoneyMinor(minor, currency)}/${unit}`;
}

function BreakdownRow({
  label,
  units,
  amount,
}: {
  label: string;
  units: string;
  amount: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(5rem,1fr)_minmax(7.5rem,1.4fr)_auto] gap-x-3 gap-y-0.5 items-baseline">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-600 text-xs tabular-nums">{units}</span>
      <span className="tabular-nums text-zinc-900 text-right">{amount}</span>
    </li>
  );
}

export function TripCalculator() {
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const { services } = useVehicleTypesContext();
  const [vehicleOption, setVehicleOption] = useState<string>(DEFAULT_VEHICLE_OPTION);
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
        Preview the same fare estimate riders see when booking. Requires an active fare rule in
        Fare Rules for the pickup location and service type — no built-in rate fallback.
      </p>

      <div className="max-w-lg">
        <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-xl shadow-black/20 ring-1 ring-zinc-200/90 space-y-5 text-zinc-900">
          <TransportOptionPicker
            vehicles={[]}
            services={services}
            selected={vehicleOption}
            onSelect={(slug) => {
              setVehicleOption(slug);
              clearQuote();
            }}
            selectedEtaLine={vehicleEtaLine}
            variant="rider"
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
                <div className="bg-white border-t border-zinc-100 text-sm">
                  <p className="px-4 py-2.5 text-xs leading-relaxed text-emerald-900 bg-emerald-50/80 border-b border-emerald-100">
                    Matched fare rule:{' '}
                    <span className="font-mono">{b.vehicle_type ?? quote.vehicle_option}</span> ·{' '}
                    <span className="font-mono">{b.location_key}</span>
                  </p>
                  <ul className="px-4 py-3 space-y-1.5">
                    <li className="grid grid-cols-[minmax(5rem,1fr)_minmax(7.5rem,1.4fr)_auto] gap-x-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                      <span>Item</span>
                      <span>Units / rate</span>
                      <span className="text-right">Amount</span>
                    </li>
                    <BreakdownRow
                      label="Base"
                      units="flat"
                      amount={formatBreakdownMinor(b.base_minor, quote.currency)}
                    />
                    <BreakdownRow
                      label="Booking fee"
                      units="flat"
                      amount={formatBreakdownMinor(b.booking_fee_minor, quote.currency)}
                    />
                    {(b.estimated_tolls_minor ?? 0) > 0 && (
                      <BreakdownRow
                        label="Estimated tolls"
                        units="flat"
                        amount={formatBreakdownMinor(b.estimated_tolls_minor ?? 0, quote.currency)}
                      />
                    )}
                    <BreakdownRow
                      label="Distance"
                      units={`${(b.distance_km ?? quote.distance_estimate_km).toFixed(1)} km × ${formatRatePer(b.price_per_km_minor, quote.currency, 'km')}`}
                      amount={formatBreakdownMinor(b.distance_component_minor, quote.currency)}
                    />
                    <BreakdownRow
                      label="Time"
                      units={`${Math.round(b.duration_minutes ?? quote.eta_trip_minutes_estimate)} min × ${formatRatePer(b.price_per_min_minor, quote.currency, 'min')}`}
                      amount={formatBreakdownMinor(b.time_component_minor, quote.currency)}
                    />
                    {b.min_fare_minor != null && (
                      <BreakdownRow
                        label="Min fare"
                        units="floor"
                        amount={formatBreakdownMinor(b.min_fare_minor, quote.currency)}
                      />
                    )}
                    <li className="grid grid-cols-[minmax(5rem,1fr)_minmax(7.5rem,1.4fr)_auto] gap-x-3 gap-y-0.5 items-baseline border-t border-zinc-100 pt-1.5">
                      <span className="text-zinc-500">Subtotal (pre-surge)</span>
                      <span className="text-zinc-400 text-xs">—</span>
                      <span className="tabular-nums text-zinc-900 text-right">
                        {formatBreakdownMinor(b.subtotal_before_surge_minor, quote.currency)}
                      </span>
                    </li>
                    <BreakdownRow
                      label={`After surge (×${b.surge_multiplier})`}
                      units="× subtotal"
                      amount={formatBreakdownMinor(b.after_surge_minor, quote.currency)}
                    />
                    {b.min_fare_applied && (
                      <li className="text-amber-700 text-xs pt-1 col-span-3">
                        Minimum fare applied after surge
                      </li>
                    )}
                  </ul>
                </div>
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
