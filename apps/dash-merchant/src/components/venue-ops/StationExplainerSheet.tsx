import { JOB_STATION_OPTIONS, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface StationExplainerSheetProps {
  station: JobStation | null;
  onClose: () => void;
}

export default function StationExplainerSheet({
  station,
  onClose,
}: StationExplainerSheetProps) {
  if (!station) return null;

  const option = JOB_STATION_OPTIONS.find((entry) => entry.value === station);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-surface p-inset-lg shadow-xl sm:rounded-xl">
        <div className="mb-inset-md flex items-center justify-between">
          <h2 className="text-headline-md font-bold text-on-background">
            {option?.label ?? station}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <MaterialIcon name="close" />
          </button>
        </div>
        <p className="text-body-md text-on-surface-variant">
          {option?.description ?? 'Staff tablet view for this zone.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-inset-lg min-h-[48px] w-full rounded-lg bg-primary-container font-semibold text-on-primary"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
