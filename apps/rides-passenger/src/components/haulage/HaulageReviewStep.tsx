import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Route } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import { HaulageFreightCart } from '@/components/haulage/HaulageFreightCart';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { estimateDurationMinutes, estimateHaulageTotalMinor } from '@/lib/haulage/pricing';
import { formatTimeLabel } from '@/lib/scheduleTime';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SECONDARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
  TERTIARY_FIXED,
} from '@/lib/passengerTheme';

type Props = {
  onBook?: () => void;
  showFooter?: boolean;
};

export function HaulageReviewStep({ onBook, showFooter = true }: Props) {
  const { t } = useTranslation('haulage');
  const { draft } = useHaulageBooking();

  const { totalMinor, distanceKm } = useMemo(
    () => estimateHaulageTotalMinor(draft.items, draft.pickup, draft.dropoff),
    [draft.items, draft.pickup, draft.dropoff],
  );

  const durationMin = estimateDurationMinutes(distanceKm);
  const fareLabel = formatMoneyMinor(totalMinor, 'USD');

  return (
    <div className="space-y-4">
      <div
        className="relative h-48 overflow-hidden rounded-xl border"
        style={{ borderColor: OUTLINE_VARIANT, backgroundColor: TERTIARY_FIXED }}
      >
        <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(135deg, ${SURFACE_LOW}, ${TERTIARY_FIXED})` }} />
        {distanceKm != null ? (
          <div
            className="absolute top-4 left-4 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur-sm"
            style={{ borderColor: OUTLINE_VARIANT, backgroundColor: 'rgba(255,255,255,0.85)', color: ON_SURFACE }}
          >
            <Route className="h-4 w-4" style={{ color: PRIMARY }} />
            {t('review.routeSummary', {
              distance: distanceKm,
              duration: durationMin ?? '—',
            })}
          </div>
        ) : null}
      </div>

      <HaulageFreightCart items={draft.items} readOnly />

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: OUTLINE_VARIANT, backgroundColor: SURFACE_LOWEST }}
      >
        <h3 className="mb-4 text-sm font-semibold" style={{ color: ON_SURFACE }}>
          {t('review.tripDetails')}
        </h3>
        <div className="relative space-y-6 pl-6">
          <div
            className="absolute top-2 bottom-2 left-2 border-l-2 border-dotted"
            style={{ borderColor: OUTLINE_VARIANT }}
          />
          <div className="relative">
            <span
              className="absolute -left-6 top-1 h-3 w-3 rounded-full"
              style={{ backgroundColor: PRIMARY, boxShadow: `0 0 0 4px color-mix(in srgb, ${PRIMARY} 20%, transparent)` }}
            />
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: PRIMARY }}>
              {t('review.pickup')}
            </p>
            <p className="text-sm" style={{ color: ON_SURFACE }}>
              {draft.pickup?.address}
            </p>
            <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
              {t('review.arrivalWindow', { time: formatTimeLabel(draft.pickupTime) })}
            </p>
          </div>
          <div className="relative">
            <span
              className="absolute -left-6 top-1 h-3 w-3 rounded-full"
              style={{ backgroundColor: SECONDARY, boxShadow: `0 0 0 4px color-mix(in srgb, ${SECONDARY} 20%, transparent)` }}
            />
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: SECONDARY }}>
              {t('review.dropoff')}
            </p>
            <p className="text-sm" style={{ color: ON_SURFACE }}>
              {draft.dropoff?.address}
            </p>
          </div>
        </div>
      </section>

      {showFooter ? (
        <div
          className="fixed right-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 z-40 border-t px-4 py-4 safe-x"
          style={{ borderColor: OUTLINE_VARIANT, backgroundColor: SURFACE_LOWEST }}
        >
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>
                {t('review.estimatedTotal')}
              </p>
              <p className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
                {fareLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onBook}
              className="haulage-primary-btn shrink-0 rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wide"
            >
              {t('review.bookFreight')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
