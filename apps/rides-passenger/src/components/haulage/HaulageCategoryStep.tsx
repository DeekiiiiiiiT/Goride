import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2 } from 'lucide-react';
import { HaulageIcon } from '@/components/haulage/HaulageIcon';
import { HaulageTactileCard } from '@/components/haulage/HaulageShell';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_CONTAINER_HIGH,
} from '@/lib/passengerTheme';

export function HaulageCategoryStep() {
  const { t } = useTranslation('haulage');
  const { catalog, catalogLoading, catalogError, setCategory } = useHaulageBooking();

  if (catalogLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
      </div>
    );
  }

  if (catalogError || !catalog?.categories.length) {
    return (
      <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
        {t('catalogUnavailable', { defaultValue: 'Catalog is temporarily unavailable.' })}
      </p>
    );
  }

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
        {catalog.categories.map((category) => (
          <li key={category.id}>
            <HaulageTactileCard onClick={() => setCategory(category.id)} className="p-5">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: SURFACE_CONTAINER_HIGH, color: PRIMARY }}
                >
                  <HaulageIcon name={category.icon} className="text-[1.75rem]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: ON_SURFACE }}>
                    {category.title}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                    {category.description}
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
