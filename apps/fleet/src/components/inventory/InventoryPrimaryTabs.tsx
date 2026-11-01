import type { InventoryTabId } from './InventoryTabs';
import { useInventoryLive } from './inventoryLive';
import { useInventoryShell } from './InventoryShellContext';

const TABS: { id: InventoryTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'stock', label: 'Stock' },
  { id: 'vehicle-kits', label: 'Vehicle kits' },
  { id: 'assets', label: 'Assets' },
  { id: 'movements', label: 'Movements' },
  { id: 'purchasing', label: 'Purchasing' },
  { id: 'counts', label: 'Counts' },
  { id: 'alerts', label: 'Alerts' },
];

type Variant = 'pill' | 'segment';

export function InventoryPrimaryTabs({ variant = 'pill' }: { variant?: Variant }) {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);

  if (variant === 'segment') {
    return (
      <div className="flex items-center gap-space-xs bg-surface-container-high p-1 rounded-lg overflow-x-auto w-full max-w-full">
        {TABS.map((t) => {
          const active = shell.tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => shell.setTab(t.id)}
              className={
                active
                  ? 'px-space-md py-1.5 rounded font-body-sm text-body-sm bg-surface-container-lowest text-primary font-semibold shadow-sm whitespace-nowrap flex items-center gap-space-xs'
                  : 'px-space-md py-1.5 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap flex items-center gap-space-xs'
              }
            >
              {active && t.id === 'vehicle-kits' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              ) : null}
              {t.label}
              {t.id === 'alerts' && live.openAlertCount > 0 ? (
                <span className="bg-error text-on-error font-label-code text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {live.openAlertCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center overflow-x-auto p-1 bg-surface-container rounded-xl w-fit max-w-full">
      {TABS.map((t) => {
        const active = shell.tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => shell.setTab(t.id)}
            className={
              active
                ? 'px-space-lg py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-semibold shadow-sm transition-all flex items-center gap-space-xs'
                : 'px-space-lg py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center gap-space-xs'
            }
          >
            {t.label}
            {t.id === 'alerts' && live.openAlertCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-error text-on-error font-label-code text-[10px] font-bold">
                {live.openAlertCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
