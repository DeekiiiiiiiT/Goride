import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  BUSINESS_DAYS,
  DaySchedule,
  SpecialDate,
} from '../../hooks/useMerchantSettings';

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
    value: string
  ) => void;
  onAddShift: (dayIndex: number) => void;
  onRemoveShift: (dayIndex: number, shiftIndex: number) => void;
  onCopyToAll: (sourceDayIndex: number) => void;
  onAddSpecialDate: (entry: Omit<SpecialDate, 'id'>) => void;
  onRemoveSpecialDate: (id: string) => void;
}

const timeInputClass =
  'time-input h-12 w-full rounded-md border border-outline-variant bg-transparent px-3 text-body-sm text-on-background outline-none transition-colors focus:border-primary-container focus:shadow-[inset_0_0_0_1px_#10b981]';

function formatDisplayDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DayToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="peer h-6 w-12 rounded-full border border-outline-variant bg-surface-variant transition-colors peer-checked:border-primary-container peer-checked:bg-primary-container peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-container/20 after:absolute after:left-[2px] after:top-[2px] after:flex after:h-5 after:w-5 after:items-center after:justify-center after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:after:translate-x-6" />
    </label>
  );
}

function TimeField({
  label,
  value,
  onChange,
  showLabel = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showLabel?: boolean;
}) {
  return (
    <div className="flex min-w-[120px] flex-1 flex-col gap-inset-base">
      {showLabel && (
        <span className="text-label-sm text-on-surface-variant">{label}</span>
      )}
      <div className="relative">
        <input
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={timeInputClass}
        />
        <MaterialIcon
          name="schedule"
          size={20}
          className="pointer-events-none absolute right-3 top-3 text-on-surface-variant"
        />
      </div>
    </div>
  );
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
  onRemoveSpecialDate,
}: BusinessHoursViewProps) {
  const [showAddSpecial, setShowAddSpecial] = useState(false);
  const [newSpecialName, setNewSpecialName] = useState('');
  const [newSpecialDate, setNewSpecialDate] = useState('');

  const handleAddSpecialDate = () => {
    if (!newSpecialName.trim() || !newSpecialDate) return;
    onAddSpecialDate({
      name: newSpecialName.trim(),
      date: newSpecialDate,
      isClosed: true,
    });
    setNewSpecialName('');
    setNewSpecialDate('');
    setShowAddSpecial(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background pb-[120px] text-on-background">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/90 px-margin-mobile backdrop-blur-md md:border-none md:px-margin-tablet">
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

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-inset-lg px-margin-mobile py-inset-md md:px-margin-tablet">
        <div className="hidden flex-col gap-inset-xs md:flex">
          <div className="flex items-center gap-inset-sm">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"
            >
              <MaterialIcon name="arrow_back" />
            </button>
            <h1 className="text-headline-lg text-on-background">Business Hours</h1>
          </div>
          <p className="pl-14 text-body-sm text-on-surface-variant">
            Set your regular store hours and special holiday schedules.
          </p>
        </div>

        <section className="flex flex-col gap-inset-sm">
          <div className="mb-inset-xs flex items-center justify-between">
            <h2 className="text-headline-md text-on-background">Regular Schedule</h2>
            <button
              type="button"
              onClick={() => onCopyToAll(1)}
              className="flex items-center gap-inset-base text-label-md text-primary-container transition-colors hover:text-primary active:scale-95"
            >
              <MaterialIcon name="content_copy" size={16} />
              Copy to all
            </button>
          </div>

          {BUSINESS_DAYS.map(({ label, index }) => {
            const day = hours[index];
            const isOpen = !day.isClosed;

            return (
              <div
                key={label}
                className={`flex flex-col gap-inset-sm rounded-lg border border-outline-variant p-inset-sm shadow-sm transition-shadow md:p-inset-md ${
                  isOpen
                    ? 'bg-surface-container-lowest hover:shadow-md'
                    : 'bg-surface-container opacity-75 grayscale-[0.5]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-inset-sm">
                    <span
                      className={`w-24 text-body-lg font-semibold ${
                        isOpen ? 'text-on-surface' : 'text-on-surface-variant'
                      }`}
                    >
                      {label}
                    </span>
                    <DayToggle
                      id={`toggle-${index}`}
                      checked={isOpen}
                      onChange={(checked) => onToggleDayOpen(index, checked)}
                    />
                    <span className="hidden text-body-sm text-on-surface-variant md:inline-block">
                      {isOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  {isOpen && day.shifts.length === 1 && (
                    <button
                      type="button"
                      onClick={() => onAddShift(index)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                      title="Add split shift"
                    >
                      <MaterialIcon name="add" />
                    </button>
                  )}
                </div>

                {isOpen ? (
                  <div className="mt-inset-xs flex flex-col gap-inset-sm">
                    {day.shifts.map((shift, shiftIndex) => (
                      <div key={`${label}-${shiftIndex}`}>
                        {shiftIndex > 0 && <div className="my-1 h-px w-full bg-surface-variant" />}
                        <div className="flex flex-wrap items-center gap-inset-sm">
                          <TimeField
                            label="Opening Time"
                            value={shift.open}
                            onChange={(value) => onUpdateShift(index, shiftIndex, 'open', value)}
                            showLabel={shiftIndex === 0 || day.shifts.length > 1}
                          />
                          <span className="mt-6 px-1 text-body-lg text-on-surface-variant">-</span>
                          <TimeField
                            label="Closing Time"
                            value={shift.close}
                            onChange={(value) => onUpdateShift(index, shiftIndex, 'close', value)}
                            showLabel={shiftIndex === 0 || day.shifts.length > 1}
                          />
                          {day.shifts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveShift(index, shiftIndex)}
                              className="mt-6 flex h-12 w-12 items-center justify-center self-end rounded-full text-error transition-colors hover:bg-error-container"
                              title="Remove shift"
                            >
                              <MaterialIcon name="close" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {day.shifts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onAddShift(index)}
                        className="mt-2 flex w-full items-center justify-center gap-inset-base rounded-md border border-dashed border-primary-container py-2 text-label-md text-primary-container transition-colors hover:text-primary"
                      >
                        <MaterialIcon name="add" size={18} />
                        Add Break/Shift
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-inset-xs py-inset-sm text-center">
                    <p className="text-body-sm italic text-on-surface-variant">
                      Store is closed on this day.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="mt-inset-md flex flex-col gap-inset-sm">
          <div className="mb-inset-xs flex items-center justify-between">
            <h2 className="flex items-center gap-inset-xs text-headline-md text-on-background">
              <MaterialIcon name="event_seat" className="text-secondary" />
              Holiday &amp; Special Hours
            </h2>
          </div>

          <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm">
            {specialDates.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-inset-sm border-b border-surface-variant p-inset-sm md:p-inset-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-body-lg font-semibold text-on-background">
                      {entry.name}
                    </span>
                    <span className="text-label-md text-on-surface-variant">
                      {formatDisplayDate(entry.date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-inset-sm">
                    <span className="rounded bg-surface-container-highest px-2 py-1 text-label-sm text-on-surface-variant">
                      {entry.isClosed ? 'Closed' : 'Special Hours'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveSpecialDate(entry.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container hover:text-error active:scale-95"
                    >
                      <MaterialIcon name="delete" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {showAddSpecial && (
              <div className="space-y-inset-sm border-b border-surface-variant p-inset-sm md:p-inset-md">
                <input
                  type="text"
                  value={newSpecialName}
                  onChange={(event) => setNewSpecialName(event.target.value)}
                  placeholder="Holiday name"
                  className={timeInputClass}
                />
                <input
                  type="date"
                  value={newSpecialDate}
                  onChange={(event) => setNewSpecialDate(event.target.value)}
                  className={timeInputClass}
                />
                <div className="flex gap-inset-sm">
                  <button
                    type="button"
                    onClick={() => setShowAddSpecial(false)}
                    className="flex-1 rounded-md border border-outline px-4 py-2 text-label-md text-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSpecialDate}
                    className="flex-1 rounded-md bg-secondary-container px-4 py-2 text-label-md text-white"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAddSpecial(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-inset-xs bg-surface p-inset-sm text-secondary-container transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="add_circle" />
              <span className="text-label-md font-bold">Add Special Date</span>
            </button>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 z-40 w-full border-t border-outline-variant bg-surface/95 p-margin-mobile shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm md:bottom-16 md:px-margin-tablet">
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
      </div>
    </div>
  );
}
