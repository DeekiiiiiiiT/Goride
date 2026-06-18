import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Pencil, Trash2, X } from 'lucide-react';
import type { PassengerSavedPlaceRow } from '@roam/types/passengerSavedPlaces';
import { SavedPlaceIconBadge } from '@/components/contacts/SavedPlaceIconGlyph';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  place: PassengerSavedPlaceRow | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function SavedPlaceDetailSheet({ place, onClose, onEdit, onDelete }: Props) {
  const { t } = useTranslation('contacts');

  useEffect(() => {
    if (!place) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [place]);

  if (!place) return null;

  const displayName =
    place.icon === 'home'
      ? t('places.home')
      : place.icon === 'work'
        ? t('places.work')
        : place.name;

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
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <SavedPlaceIconBadge icon={place.icon} size="lg" />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold" style={{ color: ON_SURFACE }}>
                  {displayName}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: SURFACE_CONTAINER }}
              aria-label={t('places.closeSheet')}
            >
              <X className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} />
            </button>
          </div>

          <div
            className="flex gap-3 rounded-2xl p-4"
            style={{ backgroundColor: SURFACE_LOW, border: '1px solid rgba(0,74,198,0.08)' }}
          >
            <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: ON_SURFACE_VARIANT }}>
                {t('places.addressLabel')}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: ON_SURFACE }}>
                {place.address}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onEdit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold active:scale-[0.98]"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
            >
              <Pencil className="h-4 w-4" />
              {t('places.editPlace')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold active:scale-[0.98]"
              style={{ borderColor: 'rgba(195,198,215,0.4)', color: ON_SURFACE }}
            >
              <Trash2 className="h-4 w-4" />
              {t('places.delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
