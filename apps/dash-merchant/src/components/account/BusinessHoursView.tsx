import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  jamaicaHolidayDateSet,
  type JamaicaHoliday,
} from '@roam/business-config';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useImmersiveMode } from '../../hooks/useImmersiveMode';
import {
  DaySchedule,
  SpecialDate,
} from '../../hooks/useMerchantSettings';
import HolidaysTab from './business-hours/HolidaysTab';
import RegularScheduleTab from './business-hours/RegularScheduleTab';
import SpecialHoursTab from './business-hours/SpecialHoursTab';

type HoursTab = 'business' | 'special' | 'holidays';

const TABS: { id: HoursTab; label: string }[] = [
  { id: 'business', label: 'Business hours' },
  { id: 'special', label: 'Special hours' },
  { id: 'holidays', label: 'Holidays' },
];

interface BusinessHoursViewProps {
  hours: DaySchedule[];
  specialDates: SpecialDate[];
  onBack: () => void;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  isSaving?: boolean;
  onToggleDayOpen: (dayIndex: number, isOpen: boolean) => void;
  onUpdateShift: (
    dayIndex: number,
    shiftIndex: number,
    field: 'open' | 'close',
    value: string,
  ) => void;
  onAddShift: (dayIndex: number) => void;
  onRemoveShift: (dayIndex: number, shiftIndex: number) => void;
  onCopyToAll: (sourceDayIndex: number) => void;
  onAddSpecialDate: (entry: Omit<SpecialDate, 'id'>) => void;
  onUpdateSpecialDate: (id: string, patch: Partial<Omit<SpecialDate, 'id'>>) => void;
  onRemoveSpecialDate: (id: string) => void;
  onUpsertHolidayOverride: (
    holiday: JamaicaHoliday,
    patch: { isClosed: boolean; open?: string; close?: string },
  ) => void;
  onClearHolidayOverride: (date: string) => void;
}

export default function BusinessHoursView({
  hours,
  specialDates,
  onBack,
  onSave,
  onDiscard,
  isSaving = false,
  onToggleDayOpen,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onCopyToAll,
  onAddSpecialDate,
  onUpdateSpecialDate,
  onRemoveSpecialDate,
  onUpsertHolidayOverride,
  onClearHolidayOverride,
}: BusinessHoursViewProps) {
  const [activeTab, setActiveTab] = useState<HoursTab>('business');
  useImmersiveMode(true);

  const holidayDates = useMemo(() => jamaicaHolidayDateSet(), []);
  const partnerSpecialDates = useMemo(
    () => specialDates.filter((entry) => !holidayDates.has(entry.date)),
    [specialDates, holidayDates],
  );
  const holidayOverrides = useMemo(
    () => specialDates.filter((entry) => holidayDates.has(entry.date)),
    [specialDates, holidayDates],
  );

  return createPortal(
    <div className="app-fullscreen-screen safe-x safe-t bg-background text-on-background">
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface/90 px-margin-mobile backdrop-blur-md md:border-none md:px-margin-tablet">
        <div className="flex items-center gap-inset-xs">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container active:scale-95"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="truncate text-headline-md font-bold text-on-surface md:hidden">
            Business Hours
          </h1>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-inset-md overflow-y-auto px-margin-mobile py-inset-md md:px-margin-tablet">
        <div className="hidden flex-col gap-inset-xs md:flex">
          <h1 className="text-headline-lg text-on-background">Business Hours</h1>
          <p className="text-body-sm text-on-surface-variant">
            Weekly schedule, special dates, and Jamaica public holidays.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Business hours sections"
          className="flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-md px-2 py-2.5 text-center text-label-md font-semibold transition-colors ${
                  selected
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'business' && (
          <RegularScheduleTab
            hours={hours}
            onToggleDayOpen={onToggleDayOpen}
            onUpdateShift={onUpdateShift}
            onAddShift={onAddShift}
            onRemoveShift={onRemoveShift}
            onCopyToAll={onCopyToAll}
          />
        )}

        {activeTab === 'special' && (
          <SpecialHoursTab
            specialDates={partnerSpecialDates}
            onAddSpecialDate={onAddSpecialDate}
            onUpdateSpecialDate={onUpdateSpecialDate}
            onRemoveSpecialDate={onRemoveSpecialDate}
          />
        )}

        {activeTab === 'holidays' && (
          <HolidaysTab
            specialDates={holidayOverrides}
            onUpsertHolidayOverride={onUpsertHolidayOverride}
            onClearHolidayOverride={onClearHolidayOverride}
          />
        )}
      </main>

      <footer className="shrink-0 border-t border-outline-variant bg-surface/95 px-margin-mobile py-inset-sm shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm safe-b md:px-margin-tablet">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-inset-sm md:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            className="hidden h-12 rounded-md border border-outline px-6 text-label-md text-on-surface transition-colors hover:bg-surface-container md:block"
          >
            Discard Changes
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex h-12 flex-1 items-center justify-center gap-inset-xs rounded-md bg-primary-container px-6 text-label-md font-bold text-on-primary shadow-sm transition-colors hover:bg-primary active:scale-95 disabled:opacity-50 md:flex-none"
          >
            <MaterialIcon name="save" />
            {isSaving ? 'Saving...' : 'Save Hours'}
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
