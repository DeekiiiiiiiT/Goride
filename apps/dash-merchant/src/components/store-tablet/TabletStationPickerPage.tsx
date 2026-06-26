import { JOB_STATION_OPTIONS, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface TabletStationPickerPageProps {
  storeName?: string;
  onSelect: (station: JobStation) => void;
  onBack?: () => void;
  isLoading?: boolean;
  error?: string | null;
  /** When on, show all stations; non-enabled ones are disabled. */
  venueOpsV2?: boolean;
  enabledStations?: JobStation[];
}

export default function TabletStationPickerPage({
  storeName,
  onSelect,
  onBack,
  isLoading = false,
  error,
  venueOpsV2 = false,
  enabledStations,
}: TabletStationPickerPageProps) {
  const enabled = enabledStations ? new Set(enabledStations) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {onBack && (
        <header className="safe-t flex h-16 items-center px-margin-mobile">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full text-primary"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
        </header>
      )}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-inset-lg px-margin-tablet py-inset-xl">
        <header className="text-center">
          <h1 className="text-headline-lg font-bold text-on-background">Which station is this tablet?</h1>
          {storeName && (
            <p className="mt-inset-xs text-body-lg text-on-surface-variant">{storeName}</p>
          )}
          <p className="mt-inset-sm text-body-sm text-on-surface-variant">
            This tablet will stay on that view. Staff still sign in with their PIN.
          </p>
        </header>

        <div className="grid gap-inset-md">
          {JOB_STATION_OPTIONS.map((option) => {
            const stationDisabled =
              venueOpsV2 && enabled != null && !enabled.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                disabled={isLoading || stationDisabled}
                onClick={() => onSelect(option.value)}
                className={`rounded-xl border p-inset-md text-left transition-colors active:scale-[0.99] disabled:opacity-50 ${
                  stationDisabled
                    ? 'cursor-not-allowed border-outline-variant/50 bg-surface-container-low'
                    : 'border-outline-variant bg-surface-container-lowest hover:border-primary-container/40'
                }`}
              >
                <div className="flex items-center justify-between gap-inset-sm">
                  <div className="text-title-md font-semibold text-on-background">{option.label}</div>
                  {stationDisabled && (
                    <span className="rounded-full bg-surface-variant px-2 py-0.5 text-label-sm text-on-surface-variant">
                      Not enabled
                    </span>
                  )}
                </div>
                <div className="mt-inset-xs text-body-sm text-on-surface-variant">{option.description}</div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="rounded-lg border border-error/30 bg-error-container/20 px-inset-md py-inset-sm text-body-sm text-error">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
