import { formatJobStationLabel, JobStation } from '../../../types/team';

export default function JobStationBadge({ station }: { station: JobStation | null | undefined }) {
  if (!station) return null;

  return (
    <span className="rounded-full bg-primary-container/15 px-2 py-0.5 text-label-sm font-semibold text-primary-container">
      {formatJobStationLabel(station)}
    </span>
  );
}
