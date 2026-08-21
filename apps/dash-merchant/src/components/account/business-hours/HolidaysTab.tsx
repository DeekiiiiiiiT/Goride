import { useMemo } from 'react';
import {
  jamaicaHolidaysUpcoming,
  type JamaicaHoliday,
} from '@roam/business-config';
import { SpecialDate } from '../../../hooks/useMerchantSettings';
import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { DayToggle, TimeField, formatDisplayDate } from './hoursShared';

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '22:00';

interface HolidaysTabProps {
  specialDates: SpecialDate[];
  onUpsertHolidayOverride: (holiday: JamaicaHoliday, patch: {
    isClosed: boolean;
    open?: string;
    close?: string;
  }) => void;
  onClearHolidayOverride: (date: string) => void;
}

export default function HolidaysTab({
  specialDates,
  onUpsertHolidayOverride,
  onClearHolidayOverride,
}: HolidaysTabProps) {
  const holidays = useMemo(() => jamaicaHolidaysUpcoming(), []);
  const overrideByDate = useMemo(() => {
    const map = new Map<string, SpecialDate>();
    for (const entry of specialDates) {
      map.set(entry.date, entry);
    }
    return map;
  }, [specialDates]);

  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  return (
    <section className="flex flex-col gap-inset-sm">
      <div className="mb-inset-xs rounded-lg border border-outline-variant bg-surface-container-low p-inset-sm">
        <div className="flex gap-inset-sm">
          <MaterialIcon name="verified" className="mt-0.5 shrink-0 text-primary-container" />
          <div>
            <p className="text-body-md font-semibold text-on-surface">Managed by Roam</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Jamaica public holidays are built into Partner. Stores are closed by default on these
              days. You can open for custom hours if you choose — you never need to add the holidays
              yourself.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm">
        {holidays.map((holiday) => {
          const override = overrideByDate.get(holiday.date);
          const isClosed = override ? override.isClosed : true;
          const isPast = holiday.date < todayIso;
          const open = override?.open ?? DEFAULT_OPEN;
          const close = override?.close ?? DEFAULT_CLOSE;

          return (
            <div
              key={holiday.id}
              className={`flex flex-col gap-inset-sm border-b border-surface-variant p-inset-sm last:border-b-0 md:p-inset-md ${
                isPast ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-inset-sm">
                <div className="min-w-0">
                  <p className="text-body-lg font-semibold text-on-background">{holiday.name}</p>
                  <p className="text-label-md text-on-surface-variant">
                    {formatDisplayDate(holiday.date)}
                    {isPast ? ' · Past' : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-1 text-label-sm ${
                    isClosed
                      ? 'bg-surface-container-highest text-on-surface-variant'
                      : 'bg-primary-container/15 text-primary-container'
                  }`}
                >
                  {isClosed ? 'Closed' : 'Open'}
                </span>
              </div>

              <div className="flex items-center gap-inset-sm">
                <DayToggle
                  id={`holiday-open-${holiday.id}`}
                  checked={!isClosed}
                  onChange={(checked) => {
                    if (!checked) {
                      // Back to Roam default (closed) — drop partner override if any.
                      if (override) onClearHolidayOverride(holiday.date);
                      return;
                    }
                    onUpsertHolidayOverride(holiday, {
                      isClosed: false,
                      open,
                      close,
                    });
                  }}
                />
                <span className="text-body-sm text-on-surface-variant">
                  {isClosed ? 'Closed (Roam default)' : 'Open with custom hours'}
                </span>
              </div>

              {!isClosed && (
                <div className="flex flex-wrap items-center gap-inset-sm">
                  <TimeField
                    label="Open"
                    value={open}
                    onChange={(value) =>
                      onUpsertHolidayOverride(holiday, {
                        isClosed: false,
                        open: value,
                        close,
                      })
                    }
                  />
                  <span className="mt-6 px-1 text-body-lg text-on-surface-variant">-</span>
                  <TimeField
                    label="Close"
                    value={close}
                    onChange={(value) =>
                      onUpsertHolidayOverride(holiday, {
                        isClosed: false,
                        open,
                        close: value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
