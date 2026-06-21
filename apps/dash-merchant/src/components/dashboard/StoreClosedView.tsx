import { MaterialIcon } from '../../signup/components/MaterialIcon';

export type PendingActionType = 'order' | 'inventory';

export interface PendingAction {
  id: string;
  type: PendingActionType;
  title: string;
  description: string;
}

interface StoreClosedViewProps {
  opensLabel: string;
  onOpenEarly: () => void;
  isOpening?: boolean;
  pendingActions: PendingAction[];
  onActionClick: (action: PendingAction) => void;
}

export default function StoreClosedView({
  opensLabel,
  onOpenEarly,
  isOpening = false,
  pendingActions,
  onActionClick,
}: StoreClosedViewProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-margin-mobile py-inset-md pt-20 md:px-margin-tablet">
      <div className="mb-inset-xl mt-inset-lg flex w-full flex-col items-center justify-center text-center">
        <div className="relative mb-inset-md flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-surface-container">
          <MaterialIcon name="storefront" className="text-6xl text-tertiary-container" size={64} />
          <div className="absolute right-6 top-4 flex animate-pulse flex-col items-end gap-1 opacity-50">
            <span className="text-xs text-tertiary-container">z</span>
            <span className="text-sm text-tertiary-container">Z</span>
            <span className="text-lg text-tertiary-container">Z</span>
          </div>
        </div>

        <h2 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-background">
          Your store is currently closed
        </h2>
        <p className="mb-inset-lg text-body-lg text-on-surface-variant">{opensLabel}</p>

        <button
          type="button"
          onClick={onOpenEarly}
          disabled={isOpening}
          className="flex h-12 w-full min-w-[200px] items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-fixed-dim active:scale-95 disabled:opacity-60 md:w-auto"
        >
          {isOpening ? 'Opening…' : 'Open early'}
        </button>
      </div>

      {pendingActions.length > 0 && (
        <section className="flex w-full flex-col gap-inset-sm">
          <div className="mb-inset-xs flex items-center justify-between">
            <h3 className="text-headline-md font-semibold text-on-surface">Pending Actions</h3>
            <span className="rounded-md bg-surface-container-high px-2 py-1 text-label-sm text-on-surface-variant">
              {pendingActions.length} task{pendingActions.length === 1 ? '' : 's'}
            </span>
          </div>

          {pendingActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onActionClick(action)}
              className="flex min-h-[64px] cursor-pointer items-center gap-inset-sm rounded-lg border border-outline-variant bg-surface p-inset-sm text-left transition-shadow hover:shadow-md"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                  action.type === 'order'
                    ? 'bg-error-container text-error'
                    : 'bg-secondary-container text-on-secondary-container'
                }`}
              >
                <MaterialIcon
                  name={action.type === 'order' ? 'error' : 'inventory_2'}
                  filled={action.type === 'inventory'}
                />
              </div>
              <div className="min-w-0 flex-grow">
                <h4 className="text-body-lg font-medium text-on-surface">{action.title}</h4>
                <p className="text-body-sm text-on-surface-variant">{action.description}</p>
              </div>
              <MaterialIcon name="chevron_right" className="shrink-0 text-on-surface-variant" />
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
