import { formatJobStationLabel, JobStation } from '../../../types/team';

export default function JobStationBadge({ station }: { station: JobStation | null | undefined }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-label-sm font-semibold ${
        station
          ? 'bg-primary-container/15 text-primary-container'
          : 'bg-surface-variant text-on-surface-variant'
      }`}
    >
      {formatJobStationLabel(station)}
    </span>
  );
}
