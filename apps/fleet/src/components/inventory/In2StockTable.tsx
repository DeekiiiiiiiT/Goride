import { numField, stockStatusLabel, strField } from './inventoryData';
import { formatJmd } from './inventoryFormat';
import type { InventoryShellState } from './InventoryShellContext';

function statusClasses(status: string): string {
  if (status === 'out') {
    return 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-error-container text-on-error-container';
  }
  if (status === 'low') {
    return 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-tertiary-fixed text-on-tertiary-container';
  }
  return 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-surface-container-high text-on-surface';
}

function isVehicleLocation(row: Record<string, unknown>): boolean {
  const name = strField(row, 'location_name', '').toLowerCase();
  const code = strField(row, 'location_code', '').toLowerCase();
  return name.includes('vehicle') || code.startsWith('veh');
}

export function In2StockTable({
  rows,
  shell,
  primaryPlate,
}: {
  rows: Record<string, unknown>[];
  shell: InventoryShellState;
  primaryPlate: string;
}) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={11} className="py-space-xl px-space-lg text-center font-body-sm text-body-sm text-on-surface-variant">
          No stock rows yet. Receive or post opening balances to populate this table.
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((row, index) => {
        const onHand = numField(row, 'on_hand', 0);
        const reserved = numField(row, 'reserved', 0);
        const available = Math.max(0, onHand - reserved);
        const status = strField(row, 'stock_status', 'ok');
        const onVehicle = isVehicleLocation(row);
        const itemId = strField(row, 'item_id', '');
        const value = numField(row, 'stock_value', 0);
        const unitCost = onHand > 0 ? value / onHand : value;

        return (
          <tr
            key={`${itemId}-${strField(row, 'location_id', '')}-${index}`}
            className="hover:bg-surface-container-low/50 transition-colors group"
          >
            <td className="py-space-sm px-space-lg">
              <div className="font-body-md text-body-md font-bold text-on-surface leading-tight">
                {strField(row, 'name', '—')}
              </div>
              <div className="font-label-code text-caption text-secondary font-medium tracking-wide">
                {strField(row, 'sku', strField(row, 'short_code', '—'))}
              </div>
            </td>
            <td className="py-space-sm px-space-md text-on-surface-variant font-medium">
              {strField(row, 'tracking', '—')}
            </td>
            <td className="py-space-sm px-space-md">
              <div
                className={`inline-flex items-center gap-1 ${onVehicle ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}
              >
                <span className="material-symbols-outlined text-[14px] text-secondary">
                  {onVehicle ? 'directions_car' : 'warehouse'}
                </span>
                <span>
                  {onVehicle
                    ? `On cars (${primaryPlate !== '—' ? primaryPlate : strField(row, 'location_name', '—')})`
                    : strField(row, 'location_name', '—')}
                </span>
              </div>
            </td>
            <td className="py-space-sm px-space-md text-right font-label-code text-label-code font-semibold">
              {onHand}
            </td>
            <td className="py-space-sm px-space-md text-right font-label-code text-label-code text-outline">
              {reserved}
            </td>
            <td className="py-space-sm px-space-md text-right font-label-code text-label-code font-bold text-on-surface">
              {available}
            </td>
            <td className="py-space-sm px-space-md text-right font-label-code text-label-code text-secondary">—</td>
            <td className="py-space-sm px-space-md text-right font-label-price text-label-price text-on-surface">
              {formatJmd(unitCost)}
            </td>
            <td className="py-space-sm px-space-md text-right font-label-price text-label-price font-semibold text-on-surface">
              {formatJmd(value)}
            </td>
            <td className="py-space-sm px-space-md text-center">
              <span className={statusClasses(status)}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                {stockStatusLabel(status)}
              </span>
            </td>
            <td className="py-space-sm px-space-lg text-right">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    shell.setSelectedItemId(itemId || null);
                    shell.openModal('item-drawer');
                  }}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  title="Item details"
                >
                  <span className="material-symbols-outlined text-[17px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => shell.openModal('issue')}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  title="Issue or transfer"
                >
                  <span className="material-symbols-outlined text-[17px]">more_horiz</span>
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
