import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, PlusCircle, Wrench, AlertTriangle } from 'lucide-react';
import { getCatalogItem } from '@/hooks/useHaulageCatalog';
import {
  buildFreightItemFromCatalog,
  useHaulageBooking,
} from '@/contexts/HaulageBookingContext';
import { HaulagePrimaryButton } from '@/components/haulage/HaulageShell';
import { parseItemSpec, validateItemSpec } from '@/lib/haulage/validation';
import {
  ERROR,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  TERTIARY,
  TERTIARY_FIXED,
} from '@/lib/passengerTheme';

export function HaulageItemSpecSheet() {
  const { t } = useTranslation('haulage');
  const { catalog, pendingItem, specSheetOpen, closeSpecSheet, addFreightItem } = useHaulageBooking();

  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [fragile, setFragile] = useState(false);
  const [requiresDisassembly, setRequiresDisassembly] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const template = pendingItem ? getCatalogItem(catalog, pendingItem.templateId) : null;
  const variant = template?.variants.find((v) => v.id === pendingItem?.variantId);

  useEffect(() => {
    if (!specSheetOpen) return;
    setLengthCm('');
    setWidthCm('');
    setHeightCm('');
    setWeightKg('');
    setFragile(false);
    setRequiresDisassembly(false);
    setErrors({});
  }, [specSheetOpen, pendingItem?.templateId, pendingItem?.variantId]);

  useEffect(() => {
    if (!specSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSpecSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [specSheetOpen, closeSpecSheet]);

  if (!specSheetOpen || !pendingItem || !template || !variant) return null;

  const handleAdd = () => {
    const input = { lengthCm, widthCm, heightCm, weightKg };
    const validation = validateItemSpec(input);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    const spec = parseItemSpec(input);
    const item = buildFreightItemFromCatalog(catalog, pendingItem, {
      ...spec,
      fragile,
      requiresDisassembly,
    });
    if (!item || item.weightKg <= 0) return;
    addFreightItem(item);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={closeSpecSheet}
        aria-label={t('spec.close')}
      />
      <div
        className="haulage-sheet-enter relative z-10 max-h-[90dvh] w-full overflow-hidden rounded-t-[2rem] shadow-2xl safe-x"
        style={{ backgroundColor: SURFACE_LOW }}
      >
        <div className="flex justify-center py-3">
          <div className="h-1.5 w-12 rounded-full opacity-50" style={{ backgroundColor: OUTLINE_VARIANT }} />
        </div>

        <div className="px-6 pb-4">
          <h2 className="text-xl font-bold" style={{ color: ON_SURFACE }}>
            {t('spec.heading', { item: template.title })}
          </h2>
          <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('spec.subheading')}
          </p>
        </div>

        <div className="max-h-[55dvh] space-y-5 overflow-y-auto px-6 pb-6">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {t('spec.dimensions')}
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ['lengthCm', lengthCm, setLengthCm],
                  ['widthCm', widthCm, setWidthCm],
                  ['heightCm', heightCm, setHeightCm],
                ] as const
              ).map(([key, value, setter]) => (
                <div
                  key={key}
                  className="flex items-center rounded-xl border px-3 py-3"
                  style={{ borderColor: OUTLINE_VARIANT, backgroundColor: '#fff' }}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder="0"
                    className="w-full border-none bg-transparent text-base font-semibold outline-none"
                    style={{ color: ON_SURFACE }}
                    aria-label={t(`spec.${key}`)}
                  />
                  <span className="text-[10px] font-bold" style={{ color: ON_SURFACE_VARIANT }}>
                    CM
                  </span>
                </div>
              ))}
            </div>
            {errors.lengthCm ? (
              <p className="mt-1 text-xs" style={{ color: ERROR }}>
                {t(`spec.errors.${errors.lengthCm}`)}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {t('spec.weight')}
            </label>
            <div
              className="mt-2 flex items-center rounded-xl border px-4 py-3"
              style={{ borderColor: OUTLINE_VARIANT, backgroundColor: '#fff' }}
            >
              <input
                type="number"
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="0.00"
                className="w-full border-none bg-transparent text-base font-semibold outline-none"
                style={{ color: ON_SURFACE }}
              />
              <span className="font-bold" style={{ color: PRIMARY }}>
                KG
              </span>
            </div>
            {errors.weightKg ? (
              <p className="mt-1 text-xs" style={{ color: ERROR }}>
                {t(`spec.errors.${errors.weightKg}`)}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {t('spec.handling')}
            </label>
            <ToggleRow
              icon={<AlertTriangle className="h-5 w-5" style={{ color: ERROR }} />}
              iconBg="rgba(255, 218, 214, 0.5)"
              title={t('spec.fragile')}
              subtitle={t('spec.fragileHint')}
              checked={fragile}
              onChange={setFragile}
            />
            <ToggleRow
              icon={<Wrench className="h-5 w-5" style={{ color: TERTIARY }} />}
              iconBg={`${TERTIARY_FIXED}33`}
              title={t('spec.disassembly')}
              subtitle={t('spec.disassemblyHint')}
              checked={requiresDisassembly}
              onChange={setRequiresDisassembly}
            />
          </div>

          <HaulagePrimaryButton onClick={handleAdd}>
            <PlusCircle className="h-5 w-5" />
            {t('spec.addToTrip')}
          </HaulagePrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  iconBg,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="haulage-tactile-card flex items-center justify-between rounded-2xl p-4"
      style={checked ? { borderColor: PRIMARY } : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {subtitle}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 rounded-full transition-colors"
        style={{ backgroundColor: checked ? PRIMARY : OUTLINE_VARIANT }}
      >
        <span
          className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}
