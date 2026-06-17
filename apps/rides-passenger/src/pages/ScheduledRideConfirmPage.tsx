import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  MapPin,
} from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import type { ScheduledRideDetailResponse } from '@roam/types/rides';

import { formatScheduledWhenLong } from '@/lib/formatScheduledWhen';
import { PAGE_BG } from '@/lib/passengerTheme';

const PRIMARY = '#006d43';
const PRIMARY_CONTAINER = '#00a86b';

type LocationState = {
  confirmation?: ScheduledRideDetailResponse;
};

export default function ScheduledRideConfirmPage() {
  const { t } = useTranslation('booking');
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const data = state.confirmation;

  if (!data?.ride) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{ backgroundColor: PAGE_BG }}
      >
        <p className="text-sm text-gray-500">{t('detailsUnavailable')}</p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold"
          style={{ color: PRIMARY }}
          onClick={() => navigate('/services/schedule')}
        >
          {t('scheduleARide')}
        </button>
      </div>
    );
  }

  const { ride, pickup_window_start, pickup_window_end, cancellation_policy } = data;
  const fareLabel = formatMoneyMinor(ride.fare_estimate_minor, ride.currency);

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-36"
      style={{ backgroundColor: PAGE_BG, color: '#1b1c1c' }}
    >
      <header className="sticky top-0 z-50 flex h-16 w-full items-center border-b border-[#006d43]/10 bg-[#fbf9f8]/95 px-6 backdrop-blur-xl safe-t">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full p-2 transition-transform active:scale-95 hover:bg-[#006d43]/5"
          style={{ color: PRIMARY }}
          aria-label={t('backToHome')}
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="ml-4 text-2xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          {t('rideScheduled')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-3 overflow-y-auto px-6 py-4 safe-x">
        <div className="scheduled-confirm-glass-card flex flex-col items-center rounded-[1.5rem] p-4 text-center shadow-[0_4px_24px_rgba(0,168,107,0.05)]">
          <div className="relative mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#006d43]/10">
            <div className="scheduled-confirm-success-glow" aria-hidden />
            <CheckCircle2 className="h-8 w-8 fill-[#006d43]/15" style={{ color: PRIMARY }} aria-hidden />
          </div>
          <h2 className="mb-1 text-2xl font-semibold text-gray-900">{t('allSet')}</h2>
          <p className="max-w-[240px] text-base leading-relaxed text-[#3d4a41]">
            {t('driverSearchHint')}
          </p>
        </div>

        <div className="scheduled-confirm-glass-card space-y-4 rounded-[1.5rem] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="flex gap-4">
            <div className="mt-1 shrink-0">
              <Clock className="h-6 w-6" style={{ color: PRIMARY }} fill="currentColor" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-[#5f5e5e]">
                {t('pickupTime')}
              </p>
              <p className="mb-1 text-2xl font-semibold text-gray-900">
                {formatScheduledWhenLong(ride.scheduled_pickup_at)}
              </p>
              {pickup_window_start && pickup_window_end ? (
                <p className="text-xs text-[#3d4a41]/80">
                  {t('window', {
                    start: formatScheduledWhenLong(pickup_window_start),
                    end: formatScheduledWhenLong(pickup_window_end),
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex gap-4">
            <div className="mt-1 flex flex-col items-center">
              <Circle className="h-5 w-5 fill-[#006d43]" style={{ color: PRIMARY }} aria-hidden />
              <div className="scheduled-confirm-route-line" aria-hidden />
              <MapPin className="h-5 w-5 fill-[#00a86b]" style={{ color: PRIMARY_CONTAINER }} aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-4 pt-1">
              <div>
                <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-[#5f5e5e]">
                  {t('origin')}
                </p>
                <p className="text-lg text-gray-900">{ride.pickup_address ?? t('pickup')}</p>
              </div>
              <div>
                <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-[#5f5e5e]">
                  {t('destinationField')}
                </p>
                <p className="text-lg text-gray-900">{ride.dropoff_address ?? t('destinationField')}</p>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-[#006d43]/10" />

          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-[#5f5e5e]">
                  {t('estimatedFare')}
                </p>
                <p className="text-[32px] font-semibold leading-tight" style={{ color: PRIMARY }}>
                  {fareLabel}
                </p>
              </div>
              <div className="rounded-full border border-[#00a86b]/20 bg-[#00a86b]/10 px-3 py-1">
                <p className="text-xs font-semibold" style={{ color: PRIMARY_CONTAINER }}>
                  {t('scheduled')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5f5e5e]" aria-hidden />
              <p className="text-xs leading-relaxed text-[#3d4a41]">{cancellation_policy}</p>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-20 left-0 z-40 w-full bg-gradient-to-t from-[#fbf9f8] via-[#fbf9f8]/95 to-transparent px-6 pb-6 safe-x">
        <button
          type="button"
          onClick={() =>
            navigate('/activity', { state: { scheduledRideId: ride.id } })
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-[0_8px_20px_rgba(0,168,107,0.25)] transition-transform duration-200 active:scale-95"
          style={{ backgroundColor: PRIMARY }}
        >
          {t('viewInActivity')}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
