import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { HaulageFreightItem } from '@/lib/haulage/types';
import { HaulageIcon } from '@/components/haulage/HaulageIcon';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
  SECONDARY,
  SURFACE_LOW,
} from '@/lib/passengerTheme';

type Props = {
  items: HaulageFreightItem[];
  onRemove?: (clientId: string) => void;
  readOnly?: boolean;
};

export function HaulageFreightCart({ items, onRemove, readOnly = false }: Props) {
  const { t } = useTranslation('haulage');
  const { catalog } = useHaulageBooking();

  if (items.length === 0) return null;

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: OUTLINE_VARIANT, backgroundColor: SURFACE_LOW }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
          {t('cart.title')}
        </h3>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: `${PRIMARY_CONTAINER}33`, color: PRIMARY }}
        >
          {t('cart.itemCount', { count: items.length })}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const iconName = catalog?.items.find((i) => i.id === item.templateId)?.icon ?? 'package';
          return (
            <li
              key={item.clientId}
              className="flex items-center gap-3 rounded-lg border p-3"
              style={{ borderColor: OUTLINE_VARIANT, backgroundColor: '#fff' }}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: SURFACE_LOW, color: SECONDARY }}
              >
                <HaulageIcon name={iconName} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                  {item.itemTitle} · {item.variantLabel}
                </p>
                <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                  {item.subtitle} · {item.weightKg}kg
                  {item.fragile ? ` · ${t('cart.fragile')}` : ''}
                </p>
              </div>
              {!readOnly && onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.clientId)}
                  className="rounded-lg p-2 touch-manipulation"
                  style={{ color: ON_SURFACE_VARIANT }}
                  aria-label={t('cart.remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
