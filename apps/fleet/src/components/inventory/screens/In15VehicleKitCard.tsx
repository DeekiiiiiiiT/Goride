/**
 * Vehicle kit card — one car's kit from v_inv_kit_compliance (IV-13 Report, IV-14).
 * Works inside Inventory (uses the shell, actions open the Issue dialog) and on
 * Vehicle → Profile → Equipment (loads its own rows, read-only, links to Inventory).
 */
import { useMemo } from 'react';
import { inventoryApi } from '../inventoryApi';
import { aggregateKitVehicles, asPagedItems, numField, strField } from '../inventoryData';
import { goToFleetPath } from '../inventoryNav';
import { useInventoryShellOptional } from '../InventoryShellContext';
import { useGapLoad } from '../gap/useGapLoad';
import { useFleetTimezone, formatInFleetTz } from '../../../utils/timezoneDisplay';

export function In15VehicleKitCard({ vehicleId }: { vehicleId?: string | null }) {
  const shell = useInventoryShellOptional();
  const timezone = useFleetTimezone();
  const standalone = useGapLoad(async () => {
    if (shell || !vehicleId) return { compliance: [] as Record<string, unknown>[], stock: [] as Record<string, unknown>[] };
    const params = new URLSearchParams({ vehicle_id: vehicleId });
    const [compliance, stock] = await Promise.all([inventoryApi.kitsCompliance(params), inventoryApi.stockAll()]);
    return { compliance: asPagedItems(compliance), stock: asPagedItems(stock) };
  }, [vehicleId, Boolean(shell)]);

  const complianceRows = shell ? shell.kitComplianceRows : standalone.data?.compliance ?? [];
  const stockRows = shell ? shell.stockRows : standalone.data?.stock ?? [];
  const carRows = useMemo(
    () => complianceRows.filter((r) => !vehicleId || strField(r, 'vehicle_id', '') === vehicleId),
    [complianceRows, vehicleId],
  );
  const vehicle = aggregateKitVehicles(carRows)[0] ?? null;
  const readOnly = !shell || shell.readOnly;

  if (!vehicleId) {
    return <p className="font-body-sm text-body-sm text-on-surface-variant p-space-lg">No car chosen.</p>;
  }
  if (!shell && standalone.loading) {
    return <p className="font-body-sm text-body-sm text-on-surface-variant p-space-lg">Loading kit…</p>;
  }
  if (!vehicle) {
    return <p className="font-body-sm text-body-sm text-on-surface-variant p-space-lg">This car is not on a kit yet.</p>;
  }

  const missing = vehicle.cells.filter((c) => c.required && c.status !== 'ok');
  const present = vehicle.cells.filter((c) => c.status === 'ok');
  const optionalMissing = vehicle.cells.filter((c) => !c.required && c.status !== 'ok');
  const kitName = strField(carRows[0] ?? {}, 'kit_code', 'Kit');
  const kitVersion = strField(carRows[0] ?? {}, 'kit_version', '');
  const lastChecked = strField(carRows[0] ?? {}, 'last_inspected_at', '');
  const tollTag = carRows.map((r) => strField(r, 'toll_tag_number', '')).find((t) => t) ?? '';
  const kitItemIds = new Set(vehicle.cells.map((c) => c.itemId).filter(Boolean));
  const alsoOnCar = stockRows
    .filter((r) => strField(r, 'location_code', '').toLowerCase() === `veh-${vehicle.vehicleId}`.toLowerCase())
    .filter((r) => numField(r, 'on_hand', 0) > 0 && !kitItemIds.has(strField(r, 'item_id', '')))
    .map((r) => `${strField(r, 'name', 'Item')} × ${numField(r, 'on_hand', 0)}`);
  const full = vehicle.requiredLines > 0 && vehicle.okLines === vehicle.requiredLines;

  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="px-margin md:px-margin-desktop py-space-lg max-w-[1100px] mx-auto w-full">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md" data-testid="vehicle-kit-card">

      <div className="flex flex-wrap items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-on-surface text-[24px]">inventory_2</span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Kit & equipment</h2>
      <span className="font-label-plate text-label-plate px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface font-bold">{vehicle.plate}</span>
      </div>
      <div className="flex items-center gap-space-sm">
      <div className={`flex items-center gap-space-xs px-space-sm py-1 rounded-full font-label-code text-caption font-semibold ${full ? 'bg-surface-container text-on-surface' : 'bg-tertiary-fixed text-on-tertiary-fixed'}`}>
      <span>{vehicle.pct}% · {vehicle.okLines} of {vehicle.requiredLines} items</span>
      </div>
      {shell ? (
      <button type="button" aria-label="Close" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container flex items-center justify-center" onClick={() => shell.closeModal()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
      </button>
      ) : null}
      </div>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
      Kit: <span className="font-semibold text-on-surface">{kitName}{kitVersion ? ` (v${kitVersion})` : ''}</span>
      {missing.length ? <> · <span className="text-error font-medium">{missing.length} required item{missing.length === 1 ? '' : 's'} missing</span></> : ' · complete'}
      {' · '}Last checked: {lastChecked ? formatInFleetTz(lastChecked, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'}
      {tollTag ? <> · Toll tag <span className="font-label-code text-on-surface">{tollTag}</span></> : null}
      </p>
      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
      <div className="bg-primary h-full" style={{ width: `${vehicle.pct}%` }}></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">
      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-xs px-space-xs">
      <span aria-hidden="true" className="material-symbols-outlined text-error text-base">warning</span>
      <span className="font-caption text-caption uppercase tracking-wider text-error font-bold">Missing ({missing.length})</span>
      </div>
      {missing.length === 0 ? (
      <p className="font-body-sm text-secondary px-space-xs">Nothing missing.</p>
      ) : (
        missing.map((c) => (
      <div key={c.kitLineId} className="bg-error-container/40 p-space-sm rounded-lg flex items-center justify-between gap-space-sm">
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{c.label}</span>
      <span className="font-caption text-caption text-error font-medium">{c.status === 'short' ? `Short — ${c.onHandInCar} of ${c.qtyRequired}` : 'Missing'}</span>
      </div>
      {!readOnly && c.itemId ? (
      <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-1" onClick={() => shell!.openIssue({ vehicleId: vehicle.vehicleId, kitLineIds: [c.kitLineId] })}>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">add_box</span>
      <span>Issue</span>
      </button>
      ) : null}
      </div>
        ))
      )}
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-xs px-space-xs">
      <span aria-hidden="true" className="material-symbols-outlined text-surface-tint text-base">verified</span>
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface font-bold">In the car ({present.length})</span>
      </div>
      <div className="flex flex-col gap-space-xs bg-surface-container-low p-space-xs rounded-lg">
      {present.length === 0 ? (
      <p className="font-body-sm text-secondary p-space-sm">Nothing recorded in this car yet.</p>
      ) : (
        present.map((c) => (
      <div key={c.kitLineId} className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">{c.label}</span>
      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">OK</span>
      </div>
        ))
      )}
      {optionalMissing.map((c) => (
      <div key={c.kitLineId} className="p-space-sm bg-surface-container-lowest rounded flex items-center justify-between gap-space-sm">
      <span className="font-body-sm text-body-sm text-on-surface-variant">{c.label}</span>
      <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-caption text-caption">Optional — not fitted</span>
      </div>
      ))}
      </div>
      {alsoOnCar.length ? (
      <div className="px-space-xs font-body-sm text-caption text-secondary">Also on this car (not in the kit): {alsoOnCar.join(', ')}</div>
      ) : null}
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-sm pt-space-sm">
      {shell && !readOnly && missing.some((c) => c.itemId) ? (
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:opacity-90 text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-space-xs shadow-sm" onClick={() => shell.openIssue({ vehicleId: vehicle.vehicleId, kitLineIds: missing.filter((c) => c.itemId).map((c) => c.kitLineId) })}>
      <span aria-hidden="true" className="material-symbols-outlined text-base">outgoing_mail</span>
      <span>Issue missing ({missing.filter((c) => c.itemId).length})</span>
      </button>
      ) : null}
      {!shell ? (
      <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs" onClick={() => goToFleetPath('/vehicle-operations/inventory?tab=vehicle-kits')}>
      <span aria-hidden="true" className="material-symbols-outlined text-base">open_in_new</span>
      <span>Open in Inventory</span>
      </button>
      ) : null}
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
