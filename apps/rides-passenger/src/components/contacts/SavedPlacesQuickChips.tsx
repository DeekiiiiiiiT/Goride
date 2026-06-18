import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PassengerSavedPlaceRow } from '@roam/types/passengerSavedPlaces';
import { SavedPlaceIconGlyph } from '@/components/contacts/SavedPlaceIconGlyph';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { getBookingShortcuts } from '@/lib/savedPlaces';

type Props = {
  onSelect: (place: PassengerSavedPlaceRow) => void;
  className?: string;
};

export function SavedPlacesQuickChips({ onSelect, className = '' }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation('contacts');
  const { places, isLoading } = useSavedPlaces();
  const shortcuts = getBookingShortcuts(places);

  if (isLoading || shortcuts.length === 0) return null;

  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {shortcuts.map((place) => (
        <button
          key={place.id}
          type="button"
          onClick={() => onSelect(place)}
          className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold touch-manipulation active:scale-95"
          style={{
            borderColor: 'var(--home-card-border)',
            backgroundColor: 'var(--home-card-bg)',
            color: 'var(--home-on-surface)',
          }}
        >
          <SavedPlaceIconGlyph icon={place.icon} className="h-4 w-4" />
          <span className="max-w-[8rem] truncate">{place.name}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => navigate('/account/contacts?tab=places')}
        className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold touch-manipulation active:scale-95"
        style={{ color: 'var(--home-primary)' }}
      >
        {t('places.manage')}
      </button>
    </div>
  );
}
