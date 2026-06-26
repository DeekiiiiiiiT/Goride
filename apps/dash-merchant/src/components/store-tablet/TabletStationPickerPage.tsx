import { JOB_STATION_OPTIONS, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface TabletStationPickerPageProps {
  storeName?: string;
  onSelect: (station: JobStation) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export default function TabletStationPickerPage({
  storeName,
  onSelect,
  onBack,
  isLoading = false,
}: TabletStationPickerPageProps) {
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
          {JOB_STATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isLoading}
              onClick={() => onSelect(option.value)}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:border-primary-container/40 active:scale-[0.99] disabled:opacity-50"
            >
              <div className="text-title-md font-semibold text-on-background">{option.label}</div>
              <div className="mt-inset-xs text-body-sm text-on-surface-variant">{option.description}</div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
