import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { getCategoryById, getItemsForCategory } from '@/lib/haulage/catalog';
import { HaulageFreightCart } from '@/components/haulage/HaulageFreightCart';
import { HaulageIcon } from '@/components/haulage/HaulageIcon';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export function HaulageItemSelectStep() {
  const { t } = useTranslation('haulage');
  const { draft, openSpecSheet, removeFreightItem } = useHaulageBooking();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  const category = draft.categoryId ? getCategoryById(draft.categoryId) : null;
  const items = draft.categoryId ? getItemsForCategory(draft.categoryId) : [];

  if (!category) return null;

  const toggleExpand = (templateId: string) => {
    setExpandedId((prev) => (prev === templateId ? null : templateId));
  };

  const selectVariant = (templateId: string, variantId: string) => {
    setSelectedVariants((prev) => ({ ...prev, [templateId]: variantId }));
    openSpecSheet({ templateId, variantId });
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
          {t('items.heading', { category: t(category.titleKey) })}
        </h2>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {t('items.subheading')}
        </p>
      </div>

      <ul className="space-y-4">
        {items.map((template) => {
          const isOpen = expandedId === template.id;
          const selectedVariant = selectedVariants[template.id];
          return (
            <li key={template.id}>
              <div
                className="overflow-hidden rounded-xl border shadow-sm"
                style={{
                  borderColor: isOpen ? PRIMARY : OUTLINE_VARIANT,
                  backgroundColor: isOpen ? SURFACE_CONTAINER_HIGH : SURFACE_LOWEST,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(template.id)}
                  className="flex w-full items-center justify-between p-5 text-left touch-manipulation"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-lg"
                      style={{ backgroundColor: SURFACE_CONTAINER_HIGH, color: PRIMARY }}
                    >
                      <HaulageIcon name={template.icon} className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: ON_SURFACE }}>
                        {t(template.titleKey)}
                      </p>
                      <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                        {t(template.subtitleKey)}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: ON_SURFACE_VARIANT }}
                  />
                </button>

                <div className={`haulage-accordion-content ${isOpen ? 'haulage-accordion-content--open' : ''}`}>
                  <div className="haulage-accordion-inner">
                    <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: OUTLINE_VARIANT }}>
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                        {t('items.sizeModel')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {template.variants.map((variant) => (
                          <div key={variant.id}>
                            <input
                              type="radio"
                              id={`${template.id}_${variant.id}`}
                              name={template.id}
                              className="haulage-variant-radio hidden"
                              checked={selectedVariant === variant.id}
                              onChange={() => selectVariant(template.id, variant.id)}
                            />
                            <label
                              htmlFor={`${template.id}_${variant.id}`}
                              className="haulage-variant-label flex cursor-pointer items-center justify-center rounded-lg border p-3 text-sm font-semibold transition-colors"
                              style={{ borderColor: OUTLINE_VARIANT }}
                            >
                              {t(variant.labelKey)}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {draft.items.length > 0 ? (
        <div className="mt-6">
          <HaulageFreightCart items={draft.items} onRemove={removeFreightItem} />
        </div>
      ) : null}
    </div>
  );
}
