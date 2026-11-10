/** Ported from Stitch — do not simplify layout (audit §0.4). Grid is built from v_inv_kit_compliance (IV-08). */
import { useIn6VehicleKitsForm } from './hooks/useIn6VehicleKitsForm';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import type { KitCell, KitColumn } from '../inventoryData';

/** Icon for a kit column, picked from its name (look only). */
function columnIcon(col: KitColumn): string {
  if (col.lineType === 'linked_toll_tag') return 'contactless';
  if (col.lineType === 'linked_fuel_card') return 'credit_card';
  const n = col.label.toLowerCase();
  if (n.includes('tire') || n.includes('tyre')) return n.includes('pump') ? 'mode_fan' : 'tire_repair';
  if (n.includes('jack')) return 'hardware';
  if (n.includes('lug') || n.includes('wrench')) return 'build';
  if (n.includes('phone')) return 'stay_current_portrait';
  if (n.includes('aid')) return 'medical_services';
  if (n.includes('triangle')) return 'warning';
  if (n.includes('cam')) return 'videocam';
  if (n.includes('extinguisher')) return 'fire_extinguisher';
  return 'inventory_2';
}

function Cell({ cell, readOnly, onOpen }: { cell: KitCell | undefined; readOnly: boolean; onOpen: (c: KitCell) => void }) {
  if (!cell) {
    return <span className="font-label-code text-on-surface-variant font-bold text-caption">—</span>;
  }
  if (cell.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold" data-testid="kit-cell" data-status="ok">
        <span className="material-symbols-outlined text-[14px]">check_circle</span>
        ✓ OK
      </span>
    );
  }
  if (!cell.required) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface-variant font-label-code text-[11px] font-medium" data-testid="kit-cell" data-status="optional">
        Optional — not fitted
      </span>
    );
  }
  const word = cell.status === 'short' ? 'Short' : 'Missing';
  if (readOnly) {
    return (
      <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-error-container/40 text-error font-label-code text-caption font-bold" data-testid="kit-cell" data-status={cell.status}>
        {word}
      </span>
    );
  }
  const action = cell.itemId ? 'Issue →' : 'Open →';
  return (
    <button
      type="button"
      className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]"
      onClick={() => onOpen(cell)}
      data-testid="kit-cell"
      data-status={cell.status}
      aria-label={`${word}: ${cell.label} on ${cell.plate}`}
    >
      <span className="group-hover:hidden">{word}</span>
      <span className="hidden group-hover:inline text-[10px]">{action}</span>
    </button>
  );
}

export function In6VehicleKits() {
  const form = useIn6VehicleKitsForm();
  const { shell, live, columns } = form;
  const readOnly = shell.readOnly;
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="px-margin-desktop py-space-xl flex flex-col gap-space-xl max-w-[1560px] mx-auto w-full">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Inventory & Asset Management</span>
      <span className="text-outline-variant font-label-code text-[11px]">/</span>
      <span className="font-caption text-caption uppercase tracking-wider text-primary font-semibold">Vehicle kits</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">What you have, where it is, and what every car is missing.</p>
      </div>

      <div className="flex items-center gap-space-md flex-wrap">
      <div className="bg-surface-container-lowest px-space-md py-space-sm rounded-lg shadow-sm flex items-center gap-space-md">
      <div className={`w-2.5 h-2.5 rounded-full ${live.missingRequiredTotal > 0 ? 'bg-error animate-pulse' : 'bg-primary'}`}></div>
      <div className="flex flex-col">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Missing items</span>
      <span className="font-headline-sm text-headline-sm text-on-surface" data-testid="kits-missing-total">{live.missingRequiredTotal}</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest px-space-md py-space-sm rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
      <div className="flex flex-col">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Cars with a full kit</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">{live.kitFullCount} of {live.kitVehicles.length}</span>
      </div>
      </div>
      </div>
      </div>

      <InventoryPrimaryTabs variant="segment" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">

      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface">Vehicle kits</span>
      </div>
      <div className="h-4 w-px bg-outline-variant/50"></div>
      <div className="flex items-center bg-surface-container-high p-0.5 rounded gap-0.5">
      <button type="button" onClick={() => shell.openGap('kit-compare')} className="px-space-md py-1 rounded bg-surface-container-lowest text-on-surface hover:text-primary font-body-sm text-body-sm font-medium transition-colors">Kit templates</button>
      {!readOnly ? (
      <button type="button" onClick={() => form.openKitEditor()} className="px-space-md py-1 rounded bg-surface-container-lowest text-on-surface hover:text-primary font-body-sm text-body-sm font-medium transition-colors flex items-center gap-1" data-testid="edit-kit">
      <span className="material-symbols-outlined text-[16px]">edit</span>
                  Edit kit
                </button>
      ) : null}
      </div>
      </div>

      <div className="flex items-center gap-space-md flex-wrap">

      <div className="flex items-center bg-surface-container-high p-0.5 rounded">
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1 rounded font-body-sm text-body-sm transition-all ${form.view === 'matrix' ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`} data-stitch-data-stitch-id="view-mode-matrix"  onClick={() => form.setView('matrix')}>
      <span className="material-symbols-outlined text-[16px]">grid_view</span>
                  Matrix
                </button>
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1 rounded font-body-sm text-body-sm transition-all ${form.view === 'cards' ? 'bg-surface-container-lowest text-primary font-semibold shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`} data-stitch-data-stitch-id="view-mode-cards"  onClick={() => form.setView('cards')}>
      <span className="material-symbols-outlined text-[16px]">view_agenda</span>
                  Cards
                </button>
      </div>
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-medium hover:bg-surface-container transition-colors flex items-center gap-space-xs shadow-xs" onClick={() => void form.exportMatrix().catch(() => undefined)}>
      <span className="material-symbols-outlined text-[16px]">download</span>
                Export matrix
              </button>
      {!readOnly ? (
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-inverse-surface transition-colors flex items-center gap-space-xs shadow-sm"  onClick={() => form.issueAllMissing()}>
      <span className="material-symbols-outlined text-[16px]">inventory</span>
                Issue missing
              </button>
      ) : null}
      </div>
      </div>

      {!readOnly ? (
      <div className="bg-surface-container-low px-space-md py-space-sm rounded-lg flex items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">
                Clicking any red <span className="text-error font-semibold uppercase font-label-code text-[11px] bg-error-container/50 px-1 py-0.5 rounded">Missing</span> cell opens the Issue dialog for that car and item. Fuel card and toll tag cells open their own page.
              </span>
      </div>
      </div>
      ) : null}

      {form.view === 'matrix' ? (
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col" data-stitch-data-stitch-id="matrix-container">
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left" data-testid="kit-matrix">
      <thead>
      <tr className="bg-surface-container-high/60">

      <th className="p-space-lg w-80 min-w-[280px] bg-surface-container-high/90 sticky left-0 z-20">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Vehicle & Kit</span>
      <span className="font-caption text-caption text-on-surface-variant">Status</span>
      </div>
      </th>

      {columns.map((col) => (
      <th key={col.kitLineId} className={`p-space-sm text-center min-w-[105px] ${col.required ? '' : 'bg-surface-container-high/40'}`} data-testid="kit-column">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className={`w-7 h-7 rounded flex items-center justify-center ${col.required ? 'bg-surface-container text-on-surface-variant' : 'bg-surface-container-high text-outline'}`}>
      <span className="material-symbols-outlined text-[16px]">{columnIcon(col)}</span>
      </div>
      <div className="flex flex-col items-center">
      <span className={`font-caption text-caption ${col.required ? 'text-on-surface font-semibold' : 'text-secondary font-medium'}`}>{col.label}</span>
      {!col.required ? <span className="font-caption text-[9px] text-outline uppercase tracking-tight">Optional</span> : null}
      </div>
      </div>
      </th>
      ))}
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container">

      {live.kitVehicles.length === 0 ? (
      <tr>
      <td colSpan={columns.length + 1} className="p-space-lg font-body-sm text-body-sm text-on-surface-variant">No cars are on a kit yet.</td>
      </tr>
      ) : (
      live.kitVehicles.map((vehicle) => {
        const also = form.alsoOnCar(vehicle.vehicleId);
        const byLine = new Map(vehicle.cells.map((c) => [c.kitLineId, c]));
        const full = vehicle.requiredLines > 0 && vehicle.okLines === vehicle.requiredLines;
        return (
      <tr key={vehicle.vehicleId} className="hover:bg-surface/50 transition-colors" data-testid="kit-row" data-plate={vehicle.plate}>
      <td className="p-space-lg bg-surface-container-lowest sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-sm">
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container-high rounded text-on-surface">{vehicle.plate}</span>
      <span className={`font-label-code text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${full ? 'text-on-tertiary-container bg-tertiary-fixed/30' : 'text-error bg-error-container/60'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${full ? 'bg-on-tertiary-container' : 'bg-error'}`}></span>
                            {vehicle.pct}% · {vehicle.okLines} of {vehicle.requiredLines} complete
                          </span>
      </div>

      <div className="mt-1 flex items-center gap-1 text-on-surface-variant flex-wrap">
      <span className="material-symbols-outlined text-[13px]">{also.length ? 'layers' : 'layers_clear'}</span>
      <span className="font-caption text-caption text-on-surface-variant">Also on this car:</span>
      {also.length ? (
        also.map((a) => (
      <span key={a} className="font-label-code text-[11px] bg-surface-container-low px-1.5 py-0.5 rounded text-secondary font-medium">{a}</span>
        ))
      ) : (
      <span className="font-caption text-caption text-outline italic">None</span>
      )}
      </div>
      </div>
      </td>

      {columns.map((col) => (
      <td key={col.kitLineId} className={`p-space-sm text-center ${col.required ? '' : 'bg-surface-container-high/20'}`}>
      <Cell cell={byLine.get(col.kitLineId)} readOnly={readOnly} onOpen={form.openCell} />
      </td>
      ))}
      </tr>
        );
      })
      )}
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm text-on-surface-variant">
      <div className="flex items-center gap-space-md flex-wrap">
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-surface-container-highest"></span>
      <span>OK: in the car</span>
      </div>
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-error-container"></span>
      <span>Missing / Short: required item not in the car</span>
      </div>
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-surface-container-high"></span>
      <span>Optional — not fitted</span>
      </div>
      </div>
      <div className="font-label-code text-caption">
                Showing {live.kitVehicles.length} cars · {columns.length} kit lines
              </div>
      </div>
      </div>
      ) : null}

      {form.view === 'cards' ? (
      <div className="flex flex-col gap-space-md" data-stitch-data-stitch-id="cards-container">
      <div className="flex items-center justify-between">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Vehicle kit cards</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">What each car has and what it is missing.</p>
      </div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider bg-surface-container px-2.5 py-1 rounded">{live.kitVehicles.length} cars</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
      {live.kitVehicles.length === 0 ? (
      <p className="font-body-sm text-body-sm text-on-surface-variant md:col-span-2">No vehicle kits configured yet.</p>
      ) : (
      live.kitVehicles.map((vehicle) => (
      <div key={vehicle.vehicleId} className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-lg hover:shadow-md transition-shadow relative overflow-hidden">
      <div className={`w-1.5 absolute left-0 top-0 bottom-0 ${vehicle.pct >= 100 ? 'bg-tertiary-container' : vehicle.pct > 0 ? 'bg-tertiary-container' : 'bg-error'}`}></div>
      <div className="flex flex-col gap-space-md pl-1">
      <div className="flex items-start justify-between">
      <div>
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container rounded text-on-surface">{vehicle.plate}</span>
      <p className="font-caption text-caption text-on-surface-variant mt-1">{vehicle.requiredLines} required kit items</p>
      </div>
      <span className={`font-label-code text-caption font-bold px-2 py-0.5 rounded ${vehicle.pct >= 100 ? 'text-on-tertiary-container bg-tertiary-fixed/30' : 'text-error bg-error-container/60'}`}>{vehicle.pct}% Complete</span>
      </div>

      <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center font-caption text-caption">
      <span className="text-on-surface-variant">Kit items in the car</span>
      <span className="font-label-code font-semibold text-on-surface">{vehicle.okLines} / {vehicle.requiredLines} items</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
      <div className={`h-full rounded-full ${vehicle.pct > 0 ? 'bg-on-tertiary-container' : 'bg-error'}`} style={{ width: `${vehicle.pct}%` }}></div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm pt-space-xs">
      {vehicle.missingLabels.length > 0 ? (
      <div className="bg-error-container/20 p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">error</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-error">Missing items required</span>
      <p className="font-body-sm text-body-sm font-semibold text-error">{vehicle.missingLabels.join(', ')}</p>
      </div>
      </div>
      ) : (
      <div className="bg-surface-container-low p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">check_circle</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-primary">Kit complete</span>
      <p className="font-body-sm text-body-sm text-on-surface">Every required item is in {vehicle.plate}.</p>
      </div>
      </div>
      )}
      </div>
      </div>

      <div className="flex items-center justify-end pt-space-md gap-space-sm pl-1">
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-low text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.openKitCard(vehicle.vehicleId)}>Report</button>
      {!readOnly && vehicle.missingLabels.length > 0 ? (
      <button type="button" onClick={() => form.issueMissingForCar(vehicle.vehicleId)} className="h-9 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-inverse-surface transition-colors flex items-center gap-1 shadow-xs" >
      <span className="material-symbols-outlined text-[16px]">add_box</span>
                      Issue missing
                    </button>
      ) : null}
      </div>
      </div>
      ))
      )}
      </div>
      </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex flex-col gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Store</span>
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Kit items in the store</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{live.hubName}</p>
      </div>
      <div className="grid grid-cols-3 gap-space-sm py-space-md">
      {live.storeNeeds.length === 0 ? (
      <p className="col-span-3 font-body-sm text-body-sm text-on-surface-variant">No kit items yet.</p>
      ) : (
        live.storeNeeds.map((n) => (
      <div key={n.itemId} className="bg-surface-container-low p-space-sm rounded flex flex-col">
      <span className="font-label-code text-[11px] text-on-surface-variant truncate" title={n.name}>{n.name}</span>
      <span className={`font-headline-sm text-headline-sm ${n.status === 'ok' ? 'text-on-surface' : 'text-error'}`}>{n.storeOnHand}</span>
      </div>
        ))
      )}
      </div>
      <button type="button" className="h-8 w-full rounded bg-surface-container text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high transition-colors font-medium" onClick={() => form.openCentralStore()}>
                Open Stock
              </button>
      </div>
      </div>

      </div>
      </div></div>
    </div>
  );
}
