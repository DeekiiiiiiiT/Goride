import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { HAULAGE_CATEGORIES } from '@/lib/haulage/catalog';
import { HaulageIcon } from '@/components/haulage/HaulageIcon';
import { HaulageTactileCard } from '@/components/haulage/HaulageShell';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
} from '@/lib/passengerTheme';

export function HaulageCategoryStep() {
  const { t } = useTranslation('haulage');
  const { setCategory } = useHaulageBooking();

  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
          {t('category.heading')}
        </h2>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {t('category.subheading')}
        </p>
      </div>

      <ul className="space-y-4">
        {HAULAGE_CATEGORIES.map((category) => (
          <li key={category.id}>
            <HaulageTactileCard onClick={() => setCategory(category.id)} className="p-5">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: PRIMARY_CONTAINER, color: PRIMARY }}
                >
                  <HaulageIcon name={category.icon} className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: ON_SURFACE }}>
                    {t(category.titleKey)}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                    {t(category.descriptionKey)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: ON_SURFACE_VARIANT }} />
              </div>
            </HaulageTactileCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
