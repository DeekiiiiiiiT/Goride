import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Save, X } from 'lucide-react';
import type { PassengerSavedPlaceIcon } from '@roam/types/passengerSavedPlaces';
import { SAVED_PLACE_ICONS } from '@/lib/savedPlaces';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import { SavedPlaceIconGlyph } from '@/components/contacts/SavedPlaceIconGlyph';

type Props = {
  open: boolean;
  address: string;
  defaultIcon?: PassengerSavedPlaceIcon;
  initialName?: string;
  onClose: () => void;
  onSave: (name: string, icon: PassengerSavedPlaceIcon) => void;
};

export function SaveLocationDetailsSheet({
  open,
  address,
  defaultIcon = 'saved',
  initialName = '',
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation('contacts');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<PassengerSavedPlaceIcon>(defaultIcon);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setIcon(defaultIcon);
  }, [open, defaultIcon, initialName, address]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label={t('places.closeSheet')}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl rounded-t-[32px] border-t safe-b"
        style={{
          backgroundColor: SURFACE_LOWEST,
          borderColor: 'rgba(0, 74, 198, 0.1)',
          boxShadow: '0px -8px 40px rgba(0,0,0,0.12)',
        }}
      >
        <div className="flex justify-center py-4">
          <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: OUTLINE_VARIANT, opacity: 0.4 }} />
        </div>

        <div className="flex flex-col gap-6 px-6 pb-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold" style={{ color: ON_SURFACE }}>
              {t('places.saveDetailsTitle')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: SURFACE_CONTAINER }}
              aria-label={t('places.closeSheet')}
            >
              <X className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} />
            </button>
          </div>

          <p className="text-sm leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
            {address}
          </p>

          <div className="flex flex-col gap-2">
            <label className="ml-1 text-sm font-semibold" style={{ color: ON_SURFACE_VARIANT }} htmlFor="place-name">
              {t('places.nameLabel')}
            </label>
            <div className="relative">
              <input
                id="place-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('places.namePlaceholder')}
                className="h-14 w-full rounded-xl border-2 px-5 pr-12 text-base outline-none transition-all focus:shadow-[0_0_0_4px_rgba(0,74,198,0.1)]"
                style={{
                  backgroundColor: SURFACE_LOW,
                  borderColor: 'transparent',
                  color: ON_SURFACE,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = PRIMARY;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              />
              <Pencil className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: OUTLINE_VARIANT }} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="ml-1 text-sm font-semibold" style={{ color: ON_SURFACE_VARIANT }}>
              {t('places.iconLabel')}
            </span>
            <div className="-mx-2 flex gap-3 overflow-x-auto px-2 py-1">
              {SAVED_PLACE_ICONS.map((item) => {
                const selected = icon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIcon(item.id)}
                    className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95"
                    style={{
                      backgroundColor: selected ? PRIMARY : SURFACE_CONTAINER_HIGH,
                      color: selected ? '#fff' : ON_SURFACE_VARIANT,
                      boxShadow: selected ? '0 4px 12px rgba(0, 74, 198, 0.2)' : undefined,
                      transform: selected ? 'scale(1.05)' : undefined,
                    }}
                  >
                    <SavedPlaceIconGlyph icon={item.id} className="h-5 w-5" selected={selected} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(name.trim(), icon)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #003ea8 0%, #2563eb 100%)' }}
          >
            <Save className="h-5 w-5" />
            {t('places.savePlace')}
          </button>
        </div>
      </div>
    </div>
  );
}
