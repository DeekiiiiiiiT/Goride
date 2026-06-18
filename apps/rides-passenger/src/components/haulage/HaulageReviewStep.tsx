import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Route } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import { toast } from 'sonner';
import { HaulageCheckoutQuestions } from '@/components/haulage/HaulageCheckoutQuestions';
import { HaulageFreightCart } from '@/components/haulage/HaulageFreightCart';
import { HaulageStickyFooter } from '@/components/haulage/HaulageShell';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { haulageQuote } from '@/services/haulageEdge';
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

function buildScheduledPickupAt(pickupTime: string): string | null {
  const parts = pickupTime.split(':').map((p) => Number(p));
  const hours = parts[0];
  const minutes = parts[1] ?? 0;
  if (!Number.isFinite(hours)) return null;
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() - Date.now() < 30 * 60_000) return null;
  return d.toISOString();
}

type Props = {
  onBook?: () => void;
  showFooter?: boolean;
};

export function HaulageReviewStep({ onBook, showFooter = true }: Props) {
  const { t } = useTranslation('haulage');
  const { draft, setQuote } = useHaulageBooking();
  const [quoting, setQuoting] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);

  useEffect(() => {
    if (!draft.pickup || !draft.dropoff || draft.items.length === 0) return;
    let cancelled = false;
    setQuoting(true);
    void haulageQuote({
      items: draft.items.map((item) => ({
        item_id: item.templateId,
        variant_id: item.variantId,
        qty: 1,
      })),
      pickup: draft.pickup,
      dropoff: draft.dropoff,
      stairs_level: draft.stairsLevel,
      prep_status: draft.prepStatus,
      scheduled_pickup_at: buildScheduledPickupAt(draft.pickupTime),
    })
      .then((quote) => {
        if (cancelled) return;
        setQuote(quote.quote_token, quote.breakdown.total_minor, quote.breakdown.currency);
        setDistanceKm(quote.distance_km);
        setDurationMin(quote.duration_minutes);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('review.quoteFailed', { defaultValue: 'Could not get a quote.' }));
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    draft.pickup,
    draft.dropoff,
    draft.items,
    draft.stairsLevel,
    draft.prepStatus,
    draft.pickupTime,
    setQuote,
    t,
  ]);

  const fareLabel = draft.quotedTotalMinor != null && draft.currency
    ? formatMoneyMinor(draft.quotedTotalMinor, draft.currency)
    : '—';

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
        {quoting ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: PRIMARY }} />
          </div>
        ) : null}
      </div>

      <HaulageCheckoutQuestions />
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
        <HaulageStickyFooter>
          <div className="flex items-center justify-between gap-4">
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
              disabled={quoting || !draft.quoteToken}
              className="haulage-primary-btn shrink-0 rounded-xl px-6 py-3 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
            >
              {t('review.bookFreight')}
            </button>
          </div>
        </HaulageStickyFooter>
      ) : null}
    </div>
  );
}
