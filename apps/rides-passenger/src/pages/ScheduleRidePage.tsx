import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CircleDot, Clock, Loader2, MapPin } from 'lucide-react';

import { RoamPlaceField } from '@/components/RoamPlaceField';
import { TripPaymentMethodBar } from '@/components/TripPaymentMethodBar';
import { TripPaymentMethodSheet } from '@/components/TripPaymentMethodSheet';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { useRidesVehicleTypes } from '@/hooks/useRidesVehicleTypes';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import { isScheduledRidesEnabled } from '@/lib/scheduledRidesFlags';
import {
  CARD_SHADOW,
  HEADER_BG,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_FIXED_DIM,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_DIM,
  SURFACE_LOW,
  SURFACE_LOWEST,
  TERTIARY,
} from '@/lib/passengerTheme';
import { ridesCreateScheduled, ridesScheduledQuote } from '@/services/ridesEdge';
import type { FareQuoteResponse } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';

function buildScheduleDays(count: number) {
  const days: { id: string; month: string; day: number; weekday: string }[] = [];
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', weekday: 'short' });
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const parts = formatter.formatToParts(date);
    const month = parts.find((p) => p.type === 'month')?.value.toUpperCase() ?? '';
    const weekday = parts.find((p) => p.type === 'weekday')?.value.toUpperCase() ?? '';
    days.push({
      id: date.toISOString().slice(0, 10),
      month,
      day: date.getDate(),
      weekday,
    });
  }
  return days;
}

function combineDayAndTime(dayId: string, time24: string): string | null {
  const [y, m, d] = dayId.split('-').map(Number);
  const [hh, mm] = time24.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function formatTimeLabel(time24: string): string {
  const [hh, mm] = time24.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return time24;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

export default function ScheduleRidePage() {
  const navigate = useNavigate();
  const enabled = isScheduledRidesEnabled();
  const scheduleDays = useMemo(() => buildScheduleDays(7), []);
  const { active: services, loading: typesLoading } = useRidesVehicleTypes();
  const {
    selectedId: selectedPaymentId,
    selectedMethod: selectedPayment,
    select: setSelectedPaymentId,
  } = useDefaultPaymentMethod();
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  const [selectedDayId, setSelectedDayId] = useState(scheduleDays[0]?.id ?? '');
  const [departTime, setDepartTime] = useState('08:30');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [quotesBySlug, setQuotesBySlug] = useState<Record<string, FareQuoteResponse>>({});
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) {
      toast.message('Scheduled rides are not available.');
      navigate('/services', { replace: true });
    }
  }, [enabled, navigate]);

  useEffect(() => {
    if (services.length > 0 && !vehicleId) {
      setVehicleId(services[0].slug);
    }
  }, [services, vehicleId]);

  const scheduledPickupAt = useMemo(
    () => combineDayAndTime(selectedDayId, departTime),
    [selectedDayId, departTime],
  );

  const fetchQuotes = useCallback(async () => {
    if (!pickupCoords || !dropoffCoords || !scheduledPickupAt) return;
    setQuoting(true);
    try {
      const results = await Promise.all(
        services.map(async (s) => {
          const q = await ridesScheduledQuote({
            pickup_lat: pickupCoords.lat,
            pickup_lng: pickupCoords.lng,
            dropoff_lat: dropoffCoords.lat,
            dropoff_lng: dropoffCoords.lng,
            vehicle_option: s.slug,
            scheduled_pickup_at: scheduledPickupAt,
          });
          return [s.slug, q] as const;
        }),
      );
      setQuotesBySlug(Object.fromEntries(results));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not get fare estimate.');
      setQuotesBySlug({});
    } finally {
      setQuoting(false);
    }
  }, [pickupCoords, dropoffCoords, scheduledPickupAt, services]);

  useEffect(() => {
    if (!pickupCoords || !dropoffCoords || !scheduledPickupAt || services.length === 0) return;
    const t = window.setTimeout(() => void fetchQuotes(), 400);
    return () => window.clearTimeout(t);
  }, [pickupCoords, dropoffCoords, scheduledPickupAt, services, fetchQuotes]);

  const selectedQuote = vehicleId ? quotesBySlug[vehicleId] : undefined;
  const selectedService = services.find((s) => s.slug === vehicleId);

  const handleSchedule = async () => {
    if (!pickupCoords || !dropoffCoords || !scheduledPickupAt) {
      toast.error('Enter pickup and destination.');
      return;
    }
    if (!selectedQuote?.quote_token) {
      toast.error('Wait for fare estimate or pick another service.');
      return;
    }
    setSubmitting(true);
    try {
      const confirmation = await ridesCreateScheduled({
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        dropoff_lat: dropoffCoords.lat,
        dropoff_lng: dropoffCoords.lng,
        pickup_address: pickup.trim() || undefined,
        dropoff_address: destination.trim() || undefined,
        vehicle_option: vehicleId,
        scheduled_pickup_at: scheduledPickupAt,
        quote_token: selectedQuote.quote_token,
        idempotency_key: createIdempotencyKey(),
        payment_method: selectedPayment.ridePaymentMethod,
        route_polyline_encoded: selectedQuote.route_polyline_encoded,
      });
      navigate('/services/schedule/confirmed', { state: { confirmation } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not schedule ride.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/services')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to services"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-xl font-semibold tracking-tight">Schedule Ride</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-44 pt-4 safe-x">
        <section className="mb-4">
          <div className="rounded-[24px] p-6" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <span className="mb-4 block text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>
              PICKUP DATE &amp; TIME
            </span>
            <div className="flex flex-col gap-4">
              <div className="-mx-1 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {scheduleDays.map((day) => {
                  const selected = day.id === selectedDayId;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDayId(day.id)}
                      className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-xl transition-colors"
                      style={{
                        backgroundColor: selected ? PRIMARY : SURFACE_LOW,
                        color: selected ? ON_PRIMARY : ON_SURFACE_VARIANT,
                        boxShadow: selected ? '0 4px 12px rgba(0, 74, 198, 0.25)' : undefined,
                      }}
                    >
                      <span className="text-[10px] font-bold">{day.month}</span>
                      <span className="text-2xl font-bold">{day.day}</span>
                      <span className="text-[10px] font-bold">{day.weekday}</span>
                    </button>
                  );
                })}
              </div>
              <div
                className="flex items-center justify-between rounded-xl p-4"
                style={{ backgroundColor: SURFACE_LOW }}
              >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold tracking-wide" style={{ color: SECONDARY }}>
                    DEPART AT
                  </span>
                  <span className="text-2xl font-bold" style={{ color: PRIMARY }}>
                    {formatTimeLabel(departTime)}
                  </span>
                </div>
                <label
                  className="rounded-lg border bg-white p-2 shadow-sm transition-transform active:scale-95"
                  style={{ borderColor: `${OUTLINE_VARIANT}33`, color: PRIMARY }}
                >
                  <Clock className="h-6 w-6" aria-hidden />
                  <input
                    type="time"
                    value={departTime}
                    onChange={(e) => setDepartTime(e.target.value)}
                    className="sr-only"
                    aria-label="Change departure time"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4">
          <div className="rounded-[24px] p-6" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
            <div className="relative flex flex-col gap-6">
              <div
                className="absolute bottom-6 left-[11px] top-6 w-0.5 opacity-40"
                style={{ backgroundColor: OUTLINE_VARIANT }}
                aria-hidden
              />
              <div className="flex items-start gap-4">
                <div className="z-10 rounded-full bg-white ring-4 ring-white">
                  <CircleDot className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>
                    PICKUP LOCATION
                  </label>
                  <RoamPlaceField
                    label="Pickup"
                    hideLabel
                    value={pickup}
                    onChangeText={(v) => {
                      setPickup(v);
                      setPickupCoords(null);
                    }}
                    onResolved={({ address, lat, lng }) => {
                      setPickup(address);
                      setPickupCoords({ lat, lng });
                    }}
                    placeholder="Enter pickup address"
                    portalSuggestions
                  />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="z-10 rounded-full bg-white ring-4 ring-white">
                  <MapPin className="h-6 w-6" style={{ color: TERTIARY }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>
                    DESTINATION
                  </label>
                  <RoamPlaceField
                    label="Destination"
                    hideLabel
                    value={destination}
                    onChangeText={(v) => {
                      setDestination(v);
                      setDropoffCoords(null);
                    }}
                    onResolved={({ address, lat, lng }) => {
                      setDestination(address);
                      setDropoffCoords({ lat, lng });
                    }}
                    placeholder="Enter destination"
                    portalSuggestions
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4">
          <span className="mb-3 block px-2 text-xs font-bold tracking-wide" style={{ color: SECONDARY }}>
            SELECT SERVICE
          </span>
          {typesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: PRIMARY }} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {services.map((service, index) => {
                const selected = service.slug === vehicleId;
                const quote = quotesBySlug[service.slug];
                const bg = [SECONDARY_CONTAINER, PRIMARY_FIXED_DIM, SURFACE_DIM][index % 3];
                return (
                  <button
                    key={service.slug}
                    type="button"
                    onClick={() => setVehicleId(service.slug)}
                    className="relative flex items-center gap-4 rounded-[24px] p-4 text-left transition-all active:scale-[0.98]"
                    style={{
                      backgroundColor: SURFACE_LOWEST,
                      boxShadow: CARD_SHADOW,
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: selected ? PRIMARY : 'transparent',
                    }}
                  >
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
                      style={{ backgroundColor: bg, color: PRIMARY }}
                    >
                      {service.label.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{service.label}</h3>
                      <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        {service.description ?? 'Scheduled ride'}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-semibold" style={{ color: PRIMARY }}>
                      {quote
                        ? formatMoneyMinor(quote.fare_estimate_minor, quote.currency)
                        : quoting
                          ? '…'
                          : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <TripPaymentMethodBar
          method={selectedPayment}
          onPress={() => setPaymentSheetOpen(true)}
        />
      </main>

      <TripPaymentMethodSheet
        open={paymentSheetOpen}
        selectedId={selectedPaymentId}
        onClose={() => setPaymentSheetOpen(false)}
        onSelect={setSelectedPaymentId}
      />

      <footer
        className="fixed bottom-[4.5rem] left-0 z-40 w-full border-t p-4 backdrop-blur-md safe-x"
        style={{ backgroundColor: HEADER_BG, borderColor: `${OUTLINE_VARIANT}33` }}
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => void handleSchedule()}
            disabled={submitting || quoting || !selectedQuote}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-xl text-base font-semibold shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Scheduling…
              </>
            ) : (
              <>
                <span>
                  Schedule Ride
                  {selectedQuote
                    ? ` for ${formatMoneyMinor(selectedQuote.fare_estimate_minor, selectedQuote.currency)}`
                    : ''}
                </span>
                <ArrowRight className="h-5 w-5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
