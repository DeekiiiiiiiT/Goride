import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { RoamPlaceField } from '@/components/RoamPlaceField';
import { ScheduleDepartTimeSheet } from '@/components/schedule/ScheduleDepartTimeSheet';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { formatTimeLabel } from '@/lib/scheduleTime';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export function HaulageLocationsStep() {
  const { t } = useTranslation('haulage');
  const { draft, setPickup, setDropoff, setPickupTime } = useHaulageBooking();
  const [pickupText, setPickupText] = useState(draft.pickup?.address ?? '');
  const [dropoffText, setDropoffText] = useState(draft.dropoff?.address ?? '');
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
          {t('locations.heading')}
        </h2>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {t('locations.subheading')}
        </p>
      </div>

      <div className="space-y-4">
        <RoamPlaceField
          label={t('locations.pickup')}
          value={pickupText}
          onChangeText={(text) => {
            setPickupText(text);
            if (!text.trim()) setPickup(null);
          }}
          onResolved={(place) => {
            setPickupText(place.address);
            setPickup(place);
          }}
          placeholder={t('locations.pickupPlaceholder')}
          clearable
        />

        <RoamPlaceField
          label={t('locations.dropoff')}
          value={dropoffText}
          onChangeText={(text) => {
            setDropoffText(text);
            if (!text.trim()) setDropoff(null);
          }}
          onResolved={(place) => {
            setDropoffText(place.address);
            setDropoff(place);
          }}
          placeholder={t('locations.dropoffPlaceholder')}
          clearable
        />

        <button
          type="button"
          onClick={() => setTimeSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left touch-manipulation"
          style={{
            borderColor: OUTLINE_VARIANT,
            backgroundColor: SURFACE_LOWEST,
          }}
        >
          <Clock className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {t('locations.pickupWindow')}
            </p>
            <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
              {formatTimeLabel(draft.pickupTime)}
            </p>
          </div>
        </button>
      </div>

      <ScheduleDepartTimeSheet
        open={timeSheetOpen}
        value={draft.pickupTime}
        onClose={() => setTimeSheetOpen(false)}
        onConfirm={(time) => {
          setPickupTime(time);
          setTimeSheetOpen(false);
        }}
      />
    </div>
  );
}
