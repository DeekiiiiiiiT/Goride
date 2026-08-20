import { AnalyticsTimeRange } from '../../types/analytics';

interface TimeRangeFilterProps {
  value: AnalyticsTimeRange;
  onChange: (value: AnalyticsTimeRange) => void;
}

const OPTIONS: { value: AnalyticsTimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

export default function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  return (
    <div className="hide-scrollbar flex gap-inset-xs overflow-x-auto pb-1">
      {OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-inset-sm text-label-md transition-colors ${
              isActive
                ? 'bg-primary text-on-primary shadow-[0px_4px_12px_rgba(0,0,0,0.05)]'
                : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
