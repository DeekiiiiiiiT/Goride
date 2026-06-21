import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  buildScheduleDates,
  SCHEDULE_SLOTS,
  type ScheduleDate,
  type ScheduleSlot,
} from '@/lib/checkoutStorage';

type Props = {
  open: boolean;
  initialDateId: string | null;
  initialSlotId: string | null;
  onClose: () => void;
  onConfirm: (dateId: string, slotId: string, slotLabel: string) => void;
};

export function ScheduleDeliverySheet({
  open,
  initialDateId,
  initialSlotId,
  onClose,
  onConfirm,
}: Props) {
  const dates = buildScheduleDates();
  const [selectedDateId, setSelectedDateId] = useState(dates[0]?.id ?? '');
  const [selectedSlotId, setSelectedSlotId] = useState('12-30');

  useEffect(() => {
    if (open) {
      setSelectedDateId(initialDateId ?? dates[0]?.id ?? '');
      setSelectedSlotId(initialSlotId ?? '12-30');
    }
  }, [open, initialDateId, initialSlotId, dates]);

  if (!open) return null;

  const handleConfirm = () => {
    const slot = SCHEDULE_SLOTS.find(s => s.id === selectedSlotId);
    if (slot && !slot.disabled) {
      onConfirm(selectedDateId, selectedSlotId, slot.label);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-on-surface/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface rounded-t-[24px] shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] flex flex-col animate-slide-up">
        <div className="w-full flex justify-center pt-2 pb-4">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>

        <div className="px-4 pb-4 flex justify-between items-center border-b border-surface-container-high">
          <h2 className="text-headline-sm font-semibold text-on-surface">Schedule for later</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container"
          >
            <MaterialIcon name="close" className="text-[20px] text-on-surface-variant" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[530px] px-4 py-6 flex flex-col gap-8 scrollbar-hide">
          <DateSelector dates={dates} selectedId={selectedDateId} onSelect={setSelectedDateId} />
          <TimeSelector
            slots={SCHEDULE_SLOTS}
            selectedId={selectedSlotId}
            onSelect={setSelectedSlotId}
          />
        </div>

        <div className="p-4 pt-6 border-t border-surface-container pb-safe">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full bg-primary text-on-primary text-headline-sm font-semibold py-4 rounded-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            Confirm Time
            <MaterialIcon name="schedule" className="text-[20px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DateSelector({
  dates,
  selectedId,
  onSelect,
}: {
  dates: ScheduleDate[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">Select Date</h3>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
        {dates.map(date => {
          const selected = date.id === selectedId;
          return (
            <button
              key={date.id}
              type="button"
              onClick={() => onSelect(date.id)}
              className={`shrink-0 w-24 h-28 rounded-xl flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 ${
                selected
                  ? 'bg-primary-container text-on-primary-container border-2 border-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface border border-outline-variant'
              }`}
            >
              <span className={`text-body-sm ${selected ? 'opacity-90' : 'text-on-surface-variant'}`}>
                {date.label}
              </span>
              <span className="text-headline-md font-semibold">{date.day}</span>
              <span className={`text-label-sm ${selected ? 'opacity-90' : 'text-on-surface-variant'}`}>
                {date.month}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeSelector({
  slots,
  selectedId,
  onSelect,
}: {
  slots: ScheduleSlot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">Select Time</h3>
      <div className="grid grid-cols-2 gap-2">
        {slots.map(slot => {
          if (slot.disabled) {
            return (
              <div
                key={slot.id}
                className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant opacity-50 flex items-center justify-center cursor-not-allowed"
              >
                <span className="text-body-sm text-center">{slot.label}</span>
              </div>
            );
          }
          const selected = slot.id === selectedId;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelect(slot.id)}
              className={`p-2 rounded-lg flex items-center justify-center transition-all active:scale-[0.98] ${
                selected
                  ? 'bg-primary-container text-on-primary-container border-2 border-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface border border-outline-variant hover:border-primary/50'
              }`}
            >
              <span className={`text-body-sm text-center ${selected ? 'font-semibold' : ''}`}>{slot.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
