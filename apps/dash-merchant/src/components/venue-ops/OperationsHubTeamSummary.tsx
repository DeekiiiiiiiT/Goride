import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface OperationsHubTeamSummaryProps {
  activeCount: number;
  onViewRoster: () => void;
}

export default function OperationsHubTeamSummary({
  activeCount,
  onViewRoster,
}: OperationsHubTeamSummaryProps) {
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-inset-md">
        <div>
          <h2 className="text-title-md font-semibold text-on-background">Team roster</h2>
          <p className="mt-inset-xs text-body-sm text-on-surface-variant">
            Floor staff who sign in with a PIN on paired tablets.
          </p>
        </div>
        <span className="rounded-full bg-primary-container px-3 py-1 text-label-md font-semibold text-on-primary-container">
          {activeCount} active
        </span>
      </div>
      <button
        type="button"
        onClick={onViewRoster}
        className="mt-inset-md flex min-h-[48px] w-full items-center justify-center gap-inset-xs rounded-full border border-outline-variant bg-surface px-inset-md text-label-lg font-semibold text-on-background transition-colors hover:border-primary-container/40"
      >
        <MaterialIcon name="groups" size={20} />
        View full roster
      </button>
    </section>
  );
}
