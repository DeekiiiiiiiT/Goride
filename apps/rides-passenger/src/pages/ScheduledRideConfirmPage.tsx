import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2 } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import type { ScheduledRideDetailResponse } from '@roam/types/rides';
import {
  CARD_SHADOW,
  HEADER_BG,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type LocationState = {
  confirmation?: ScheduledRideDetailResponse;
};

import { formatScheduledWhenLong } from '@/lib/formatScheduledWhen';

export default function ScheduledRideConfirmPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const data = state.confirmation;

  if (!data?.ride) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6" style={{ backgroundColor: PAGE_BG }}>
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Booking details unavailable.</p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold"
          style={{ color: PRIMARY }}
          onClick={() => navigate('/services/schedule')}
        >
          Schedule a ride
        </button>
      </div>
    );
  }

  const { ride, pickup_window_start, pickup_window_end, cancellation_policy } = data;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to home"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-xl font-semibold tracking-tight">Ride scheduled</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-6 safe-x">
        <div
          className="rounded-[24px] p-8 text-center"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${PRIMARY}18`, color: PRIMARY }}
          >
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold">You&apos;re all set</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
            We&apos;ll start finding a driver before your pickup time.
          </p>
        </div>

        <div
          className="mt-4 space-y-4 rounded-[24px] p-6"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Pickup time
              </p>
              <p className="mt-1 font-semibold">{formatScheduledWhenLong(ride.scheduled_pickup_at)}</p>
              {pickup_window_start && pickup_window_end ? (
                <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                  Window {formatScheduledWhenLong(pickup_window_start)} – {formatScheduledWhenLong(pickup_window_end)}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              Route
            </p>
            <p className="mt-1 text-sm">{ride.pickup_address ?? 'Pickup'}</p>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>→ {ride.dropoff_address ?? 'Destination'}</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              Estimated fare
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: PRIMARY }}>
              {formatMoneyMinor(ride.fare_estimate_minor, ride.currency)}
            </p>
          </div>

          <div className="border-t pt-4 text-sm leading-relaxed" style={{ borderColor: `${OUTLINE_VARIANT}33`, color: ON_SURFACE_VARIANT }}>
            {cancellation_policy}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/activity')}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-xl text-base font-semibold shadow-lg"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          View in Activity
        </button>
      </main>

      <footer
        className="border-t p-4 backdrop-blur-md safe-x"
        style={{ backgroundColor: HEADER_BG, borderColor: `${OUTLINE_VARIANT}33` }}
      >
        <p className="text-center text-xs" style={{ color: ON_SURFACE_VARIANT }}>
          Driver assignment is not guaranteed until matching begins.
        </p>
      </footer>
    </div>
  );
}
