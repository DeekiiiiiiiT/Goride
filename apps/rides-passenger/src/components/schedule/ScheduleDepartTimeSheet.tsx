import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  HOUR12_OPTIONS,
  MINUTE_OPTIONS,
  formatTimeLabel,
  parseTime24,
  toTime24,
  type TimePeriod,
} from '@/lib/scheduleTime';
import {
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (time24: string) => void;
};

function TimeSelect({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: number | string;
  options: Array<number | string>;
  formatOption?: (v: number | string) => string;
  onChange: (v: number | string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="text-center text-[10px] font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        {label}
      </span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(typeof options[0] === 'number' ? Number(raw) : raw);
        }}
        className="h-14 w-full appearance-none rounded-xl border-none px-2 text-center text-xl font-bold outline-none focus:ring-2 touch-manipulation"
        style={{
          backgroundColor: SURFACE_LOW,
          color: ON_SURFACE,
          WebkitAppearance: 'none',
        }}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {formatOption ? formatOption(opt) : String(opt).padStart(2, '0')}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ScheduleDepartTimeSheet({ open, value, onClose, onConfirm }: Props) {
  const parsed = parseTime24(value);
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute - (parsed.minute % 5));
  const [period, setPeriod] = useState<TimePeriod>(parsed.period);

  useEffect(() => {
    if (!open) return;
    const next = parseTime24(value);
    setHour12(next.hour12);
    setMinute(next.minute - (next.minute % 5));
    setPeriod(next.period);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const preview = formatTimeLabel(toTime24(hour12, minute, period));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close time picker"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-xl rounded-t-3xl px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 safe-x"
        style={{
          backgroundColor: SURFACE_LOWEST,
          borderTop: `1px solid ${OUTLINE_VARIANT}33`,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-time-sheet-title"
      >
        <div className="mb-2 flex justify-center">
          <div className="h-1.5 w-12 rounded-full bg-zinc-300" aria-hidden />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 id="schedule-time-sheet-title" className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            Departure time
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition-colors active:scale-95"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="mb-5 text-center text-3xl font-bold tabular-nums" style={{ color: PRIMARY }}>
          {preview}
        </p>

        <div className="mb-6 flex gap-3">
          <TimeSelect label="HOUR" value={hour12} options={HOUR12_OPTIONS} onChange={(v) => setHour12(Number(v))} />
          <TimeSelect
            label="MINUTE"
            value={minute}
            options={MINUTE_OPTIONS}
            formatOption={(v) => String(v).padStart(2, '0')}
            onChange={(v) => setMinute(Number(v))}
          />
          <TimeSelect
            label="AM/PM"
            value={period}
            options={['AM', 'PM']}
            onChange={(v) => setPeriod(v as TimePeriod)}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onConfirm(toTime24(hour12, minute, period));
            onClose();
          }}
          className="flex h-14 w-full items-center justify-center rounded-xl text-base font-semibold shadow-lg transition-transform active:scale-[0.98]"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          Set time
        </button>
      </div>
    </div>
  );
}
