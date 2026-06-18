import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCatalogItem } from '@/hooks/useHaulageCatalog';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';

export function HaulageVariantSheet() {
  const { t } = useTranslation('haulage');
  const { catalog, variantSheetTemplateId, closeVariantSheet, selectVariant } = useHaulageBooking();

  const template = variantSheetTemplateId ? getCatalogItem(catalog, variantSheetTemplateId) : null;

  useEffect(() => {
    if (!variantSheetTemplateId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeVariantSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variantSheetTemplateId, closeVariantSheet]);

  if (!variantSheetTemplateId || !template) return null;

  const handleSelect = (variantId: string) => {
    selectVariant({ templateId: template.id, variantId });
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={closeVariantSheet}
        aria-label={t('spec.close')}
      />
      <div className="haulage-sheet-enter relative z-10 w-full overflow-hidden rounded-t-[2rem] bg-white shadow-2xl safe-x">
        <div className="flex justify-center py-3">
          <div className="h-1.5 w-12 rounded-full bg-[#bacbbf] opacity-50" />
        </div>

        <div className="px-6 pb-4">
          <div className="flex items-center gap-4">
            {template.emoji ? (
              <div className="haulage-emoji text-[1.75rem]">{template.emoji}</div>
            ) : null}
            <div>
              <h2 className="text-xl font-bold text-[#191c1e]">{template.title}</h2>
              <p className="mt-0.5 text-sm text-[#3b4a41]">{template.subtitle}</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-8">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3b4a41]">
            {t('items.sizeModel')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {template.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => handleSelect(variant.id)}
                className="haulage-variant-overlay-btn rounded-xl border border-[#bacbbf] px-3 py-3 text-sm font-semibold text-[#191c1e] transition-colors touch-manipulation active:scale-[0.98]"
              >
                {variant.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
