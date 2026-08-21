import { useState } from 'react';
import { SpecialDate } from '../../../hooks/useMerchantSettings';
import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { DayToggle, TimeField, formatDisplayDate, timeInputClass } from './hoursShared';

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '22:00';

interface SpecialHoursTabProps {
  specialDates: SpecialDate[];
  onAddSpecialDate: (entry: Omit<SpecialDate, 'id'>) => void;
  onUpdateSpecialDate: (id: string, patch: Partial<Omit<SpecialDate, 'id'>>) => void;
  onRemoveSpecialDate: (id: string) => void;
}

export default function SpecialHoursTab({
  specialDates,
  onAddSpecialDate,
  onUpdateSpecialDate,
  onRemoveSpecialDate,
}: SpecialHoursTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [isClosed, setIsClosed] = useState(true);
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [close, setClose] = useState(DEFAULT_CLOSE);

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    onAddSpecialDate({
      name: name.trim(),
      date,
      isClosed,
      open: isClosed ? undefined : open,
      close: isClosed ? undefined : close,
    });
    setName('');
    setDate('');
    setIsClosed(true);
    setOpen(DEFAULT_OPEN);
    setClose(DEFAULT_CLOSE);
    setShowAdd(false);
  };

  return (
    <section className="flex flex-col gap-inset-sm">
      <div className="mb-inset-xs">
        <h2 className="text-headline-md text-on-background">Special hours</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          One-off dates when your store is closed or runs different hours (events, renovations,
          private bookings).
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm">
        {specialDates.length === 0 && !showAdd && (
          <p className="p-inset-md text-center text-body-sm text-on-surface-variant">
            No special hours yet. Jamaica public holidays are managed under Holidays.
          </p>
        )}

        {specialDates.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-col gap-inset-sm border-b border-surface-variant p-inset-sm md:p-inset-md"
          >
            <div className="flex items-start justify-between gap-inset-sm">
              <div className="min-w-0 flex-1">
                <p className="text-body-lg font-semibold text-on-background">{entry.name}</p>
                <p className="text-label-md text-on-surface-variant">
                  {formatDisplayDate(entry.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSpecialDate(entry.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
                aria-label={`Remove ${entry.name}`}
              >
                <MaterialIcon name="delete" />
              </button>
            </div>

            <div className="flex items-center gap-inset-sm">
              <DayToggle
                id={`special-open-${entry.id}`}
                checked={!entry.isClosed}
                onChange={(checked) =>
                  onUpdateSpecialDate(entry.id, {
                    isClosed: !checked,
                    open: checked ? entry.open ?? DEFAULT_OPEN : undefined,
                    close: checked ? entry.close ?? DEFAULT_CLOSE : undefined,
                  })
                }
              />
              <span className="text-body-sm text-on-surface-variant">
                {entry.isClosed ? 'Closed' : 'Open with custom hours'}
              </span>
            </div>

            {!entry.isClosed && (
              <div className="flex flex-wrap items-center gap-inset-sm">
                <TimeField
                  label="Open"
                  value={entry.open ?? DEFAULT_OPEN}
                  onChange={(value) => onUpdateSpecialDate(entry.id, { open: value })}
                />
                <span className="mt-6 px-1 text-body-lg text-on-surface-variant">-</span>
                <TimeField
                  label="Close"
                  value={entry.close ?? DEFAULT_CLOSE}
                  onChange={(value) => onUpdateSpecialDate(entry.id, { close: value })}
                />
              </div>
            )}
          </div>
        ))}

        {showAdd && (
          <div className="space-y-inset-sm border-b border-surface-variant p-inset-sm md:p-inset-md">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Label (e.g. Private event)"
              className={timeInputClass}
            />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={timeInputClass}
            />
            <div className="flex items-center gap-inset-sm">
              <DayToggle
                id="new-special-open"
                checked={!isClosed}
                onChange={(checked) => setIsClosed(!checked)}
              />
              <span className="text-body-sm text-on-surface-variant">
                {isClosed ? 'Closed all day' : 'Open with custom hours'}
              </span>
            </div>
            {!isClosed && (
              <div className="flex flex-wrap items-center gap-inset-sm">
                <TimeField label="Open" value={open} onChange={setOpen} />
                <span className="mt-6 px-1 text-body-lg text-on-surface-variant">-</span>
                <TimeField label="Close" value={close} onChange={setClose} />
              </div>
            )}
            <div className="flex gap-inset-sm">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-md border border-outline px-4 py-2 text-label-md text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim() || !date}
                className="flex-1 rounded-md bg-secondary-container px-4 py-2 text-label-md text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-inset-xs bg-surface p-inset-sm text-secondary-container transition-colors hover:bg-surface-container"
        >
          <MaterialIcon name="add_circle" />
          <span className="text-label-md font-bold">Add special date</span>
        </button>
      </div>
    </section>
  );
}
