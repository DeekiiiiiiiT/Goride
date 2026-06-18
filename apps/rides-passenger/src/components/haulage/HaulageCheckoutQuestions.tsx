import React from 'react';
import { useTranslation } from 'react-i18next';
import type { HaulagePrepStatus, HaulageStairsLevel } from '@/lib/haulage/types';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { ON_SURFACE, ON_SURFACE_VARIANT, OUTLINE_VARIANT, PRIMARY, SURFACE_LOWEST } from '@/lib/passengerTheme';

const STAIRS_OPTIONS: { id: HaulageStairsLevel; labelKey: string }[] = [
  { id: 'none', labelKey: 'checkout.stairs.none' },
  { id: '1_flight', labelKey: 'checkout.stairs.oneFlight' },
  { id: '2_plus', labelKey: 'checkout.stairs.twoPlus' },
];

const PREP_OPTIONS: { id: HaulagePrepStatus; labelKey: string }[] = [
  { id: 'ready', labelKey: 'checkout.prep.ready' },
  { id: 'needs_unhooking', labelKey: 'checkout.prep.needsHelp' },
];

export function HaulageCheckoutQuestions() {
  const { t } = useTranslation('haulage');
  const { draft, setStairsLevel, setPrepStatus } = useHaulageBooking();

  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      style={{ borderColor: OUTLINE_VARIANT, backgroundColor: SURFACE_LOWEST }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
          {t('checkout.stairs.heading', { defaultValue: 'Are there stairs involved?' })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STAIRS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStairsLevel(opt.id)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold touch-manipulation"
              style={{
                borderColor: draft.stairsLevel === opt.id ? PRIMARY : OUTLINE_VARIANT,
                color: draft.stairsLevel === opt.id ? PRIMARY : ON_SURFACE_VARIANT,
                backgroundColor: draft.stairsLevel === opt.id ? `${PRIMARY}11` : 'transparent',
              }}
            >
              {t(opt.labelKey, { defaultValue: opt.id })}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
          {t('checkout.prep.heading', { defaultValue: 'Are items ready to move?' })}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PREP_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPrepStatus(opt.id)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold touch-manipulation"
              style={{
                borderColor: draft.prepStatus === opt.id ? PRIMARY : OUTLINE_VARIANT,
                color: draft.prepStatus === opt.id ? PRIMARY : ON_SURFACE_VARIANT,
                backgroundColor: draft.prepStatus === opt.id ? `${PRIMARY}11` : 'transparent',
              }}
            >
              {t(opt.labelKey, { defaultValue: opt.id })}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
