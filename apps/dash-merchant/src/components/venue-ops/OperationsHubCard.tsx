import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface OperationsHubCardProps {
  onOpenOperations: () => void;
}

export default function OperationsHubCard({ onOpenOperations }: OperationsHubCardProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex gap-inset-md p-inset-md">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/15 text-primary-container">
          <MaterialIcon name="hub" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-title-md font-semibold text-on-surface">Operations Hub</h3>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Set your venue type, turn stations on or off, and pair tablets for POS, kitchen, bar,
            expo, and more.
          </p>
          <button
            type="button"
            onClick={onOpenOperations}
            className="mt-inset-sm flex min-h-[44px] items-center gap-1 rounded-lg bg-primary-container px-4 text-label-md font-semibold text-on-primary transition-transform active:scale-[0.98]"
          >
            Open Operations Hub
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>
        </div>
      </div>
    </section>
  );
}
