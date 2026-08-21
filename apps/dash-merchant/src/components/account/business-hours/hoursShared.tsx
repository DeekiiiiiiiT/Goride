import { MaterialIcon } from '../../../signup/components/MaterialIcon';

export const timeInputClass =
  'time-input h-12 w-full rounded-md border border-outline-variant bg-transparent px-3 text-body-sm text-on-background outline-none transition-colors focus:border-primary-container focus:shadow-[inset_0_0_0_1px_#10b981]';

export function formatDisplayDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DayToggle({
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

export function TimeField({
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
