import {
  JOB_STATION_OPTIONS,
  NO_JOB_STATION_OPTION,
  type JobStation,
  type JobStationSelection,
} from '../../../types/team';

interface JobStationPickerProps {
  value: JobStationSelection;
  onChange: (station: JobStationSelection) => void;
  disabled?: boolean;
  allowedStations?: JobStation[];
  includeNone?: boolean;
}

export default function JobStationPicker({
  value,
  onChange,
  disabled,
  allowedStations,
  includeNone = true,
}: JobStationPickerProps) {
  const stationOptions = allowedStations
    ? JOB_STATION_OPTIONS.filter((option) => allowedStations.includes(option.value))
    : JOB_STATION_OPTIONS;

  const options = includeNone ? [NO_JOB_STATION_OPTION, ...stationOptions] : stationOptions;

  return (
    <div className="space-y-inset-xs">
      <p className="text-label-md text-on-surface-variant">Job station</p>
      <div className="grid gap-inset-xs sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`rounded-lg border px-inset-sm py-inset-sm text-left transition-colors ${
                selected
                  ? 'border-primary-container bg-primary-container/10'
                  : 'border-outline-variant bg-surface'
              }`}
            >
              <div className="text-body-sm font-semibold text-on-background">{option.label}</div>
              <div className="text-label-sm text-on-surface-variant">{option.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
