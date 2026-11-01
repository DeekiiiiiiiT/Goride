/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In5IssueDialog() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="w-full px-margin-desktop py-space-xl opacity-20 pointer-events-none select-none filter blur-[1.5px]">

      <div className="grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-xl">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="font-caption text-caption text-secondary uppercase tracking-wider mb-1">Kit Fulfillment Rate</div>
      <div className="font-label-price text-headline-lg text-on-surface">64.2%</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">28 of 44 active cabs complete</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="font-caption text-caption text-secondary uppercase tracking-wider mb-1">Storeroom Reserve</div>
      <div className="font-label-price text-headline-lg text-on-surface">J$ 1,482,900</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">Main Store — {live.hubName}</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="font-caption text-caption text-secondary uppercase tracking-wider mb-1">Pending Cabs in Bay</div>
      <div className="font-label-price text-headline-lg text-on-surface">6 units</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">Requires outfitting prior to dispatch</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="font-caption text-caption text-secondary uppercase tracking-wider mb-1">SKU Stockouts</div>
      <div className="font-label-price text-headline-lg text-error">7 line items</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">PO-2025-084 in transit from Montego Bay</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="p-space-lg bg-surface-container-low flex justify-between items-center">
      <span className="font-headline-sm text-headline-sm text-on-surface">Active Fleet Units & Kit Integrity</span>
      <span className="font-label-code text-caption text-secondary">Updated 08:20:30 AM EST</span>
      </div>
      <div className="p-space-xl">
      <div className="h-64 bg-surface-container rounded-lg flex items-center justify-center text-on-surface-variant font-label-code">
                Fleet Kit Allocation Grid Loaded — Main Kingston Storeroom Ledger
              </div>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-sm transition-opacity flex items-center justify-center p-space-md overflow-y-auto">

      <div className="relative w-full max-w-[848px] bg-surface-container-lowest rounded-xl shadow-xl my-auto overflow-hidden animate-in fade-in duration-150" data-stitch-id="issue-dialog">

      <div className="p-space-xl bg-surface-container-lowest">
      <div className="flex items-start justify-between gap-space-md">
      <div className="space-y-1">
      <div className="flex items-center gap-space-sm">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary-container text-on-primary">
      <span className="material-symbols-outlined text-[17px]">inventory_2</span>
      </span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Issue to cars</h2>
      <span className="bg-surface-container px-2 py-0.5 rounded font-label-code text-[11px] text-on-surface-variant">BATCH-ALLOC-042</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Allocate tools, equipment, and standard vehicle kits directly from storeroom stock to active fleet cars.
                  </p>
      </div>
      <button type="button" onClick={() => shell.closeModal()} aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors">
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>

      <div className="mt-space-lg pt-space-md">
      <div className="grid grid-cols-4 gap-space-sm">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-2 rounded-lg">
      <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      <div className="flex flex-col min-w-0">
      <span className="font-caption text-[10px] uppercase text-secondary tracking-wider">Step 1</span>
      <span className="font-caption text-caption text-on-surface font-semibold truncate">What</span>
      </div>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-2 rounded-lg">
      <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      <div className="flex flex-col min-w-0">
      <span className="font-caption text-[10px] uppercase text-secondary tracking-wider">Step 2</span>
      <span className="font-caption text-caption text-on-surface font-semibold truncate">Which cars</span>
      </div>
      </div>

      <div className="flex items-center gap-space-xs bg-primary text-on-primary px-space-md py-2 rounded-lg shadow-sm">
      <span className="w-4 h-4 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center font-label-code text-[10px] font-bold">3</span>
      <div className="flex flex-col min-w-0">
      <span className="font-caption text-[10px] uppercase text-surface-dim tracking-wider">Step 3 (Active)</span>
      <span className="font-caption text-caption text-on-primary font-bold truncate">Check</span>
      </div>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low/60 px-space-md py-2 rounded-lg">
      <span className="w-4 h-4 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[10px]">4</span>
      <div className="flex flex-col min-w-0">
      <span className="font-caption text-[10px] uppercase text-secondary tracking-wider">Step 4</span>
      <span className="font-caption text-caption text-on-surface-variant truncate">Done</span>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="px-space-xl pb-space-lg space-y-space-md max-h-[calc(86vh-200px)] overflow-y-auto">

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
      <div className="flex flex-wrap items-center gap-y-1 gap-x-space-md font-body-sm text-body-sm text-on-surface">
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Kit:</span>
      <span className="font-body-sm font-semibold text-on-surface">Rideshare car kit</span>
      <span className="font-label-code text-caption bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">(10 items)</span>
      </div>
      <div className="h-3 w-px bg-surface-dim hidden md:block"></div>
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Store:</span>
      <span className="font-body-sm text-on-surface">Main store — Kingston</span>
      </div>
      <div className="h-3 w-px bg-surface-dim hidden md:block"></div>
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Targets:</span>
      <span className="font-label-plate text-[12px] bg-surface-container-lowest px-1.5 py-0.5 rounded">{live.secondaryPlate}</span>
      <span className="text-caption text-on-surface-variant">(Fit · 0%)</span>
      <span className="font-label-plate text-[12px] bg-surface-container-lowest px-1.5 py-0.5 rounded ml-1">{live.primaryPlate}</span>
      <span className="text-caption text-on-surface-variant">(Roomy · 70%)</span>
      </div>
      </div>
      <button type="button" className="font-caption text-caption text-primary hover:underline font-semibold whitespace-nowrap self-end md:self-auto">
                  Edit cars or items
                </button>
      </div>

      <div className="bg-tertiary-fixed rounded-xl p-space-md flex items-start justify-between gap-space-md">
      <div className="flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-on-tertiary-fixed-variant mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-tertiary-fixed">
                      Can issue 1 of 11 items now. 10 are short in store.
                    </div>
      <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant mt-0.5">
                      Only the dashboard mount is currently stocked in Kingston Main Hub. Cabs will remain in incomplete kit state until restocked.
                    </p>
      </div>
      </div>
      <button type="button" className="font-caption text-caption font-bold text-on-tertiary-fixed-variant hover:text-on-tertiary-fixed bg-surface-container-lowest px-space-md py-1.5 rounded-lg whitespace-nowrap shadow-sm hover:shadow transition-all flex items-center gap-1 shrink-0">
      <span>Create draft order for 10 short items</span>
      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
      <th className="py-space-sm px-space-md font-semibold">Car</th>
      <th className="py-space-sm px-space-md font-semibold">Item & SKU</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">Needs</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">In Store</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">Will Issue</th>
      <th className="py-space-sm px-space-md font-semibold text-right">Result / Status</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">

      {issueLines.length === 0 ? (
      <tr>
      <td colSpan={6} className="py-space-lg px-space-md font-body-sm text-body-sm text-on-surface-variant text-center">
                      No kit gaps to issue right now.
                    </td>
      </tr>
      ) : (
      issueLines.map((row) => {
        const plate = formatPlate(strField(row, 'license_plate', ''));
        const itemId = strField(row, 'item_id', '');
        const { name, sku } = itemLabelById(shell.items, shell.stockRows, itemId);
        const needs = numField(row, 'qty_required', 1);
        const status = strField(row, 'line_status', '');
        const isLinked = strField(row, 'line_type', '') !== 'item';
        const short = status === 'missing' || status === 'short';
        return (
      <tr key={`${plate}-${itemId}-${status}`} className="hover:bg-surface-container-lowest/80 transition-colors">
      <td className="py-space-sm px-space-md">
      <span className="font-label-plate text-[13px] text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded">{plate}</span>
      <span className="block font-caption text-caption text-on-surface-variant">{strField(row, 'kit_code', 'Kit')}</span>
      </td>
      <td className="py-space-sm px-space-md">
      <div className="font-body-md font-medium text-on-surface">{name}</div>
      <div className="font-label-code text-[11px] text-secondary">{sku}</div>
      </td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-on-surface">{needs}</td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-on-surface-variant">—</td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-secondary">{short ? 0 : needs}</td>
      <td className="py-space-sm px-space-md text-right">
      {isLinked ? (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-secondary bg-surface-container px-2 py-0.5 rounded-full">
      <span className="material-symbols-outlined text-[12px]">link</span>
                            Linked item
                          </span>
      ) : short ? (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-error bg-error-container/50 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            Short {needs}
                          </span>
      ) : (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-primary bg-primary-fixed px-2 py-0.5 rounded-full font-bold">
      <span className="material-symbols-outlined text-[12px]">check</span>
                            OK
                          </span>
      )}
      </td>
      </tr>
        );
      })
      )}
      </tbody>
      </table>
      </div>
      </div>

      <label className="block bg-surface-container-low/70 hover:bg-surface-container-low p-space-md rounded-xl cursor-pointer transition-colors">
      <div className="flex items-start gap-space-md">
      <input defaultChecked className="mt-1 h-4 w-4 rounded text-primary focus:ring-0 accent-primary cursor-pointer" type="checkbox"/>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-surface">
                      Issue what's available now and leave the rest as missing
                    </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      Will dispatch 1 Phone Holder Mount to {live.secondaryPlate}. {live.secondaryPlate} kit completeness will increase after posting. {live.primaryPlate} remains at {live.primaryVehicle?.pct ?? 0}%.
                    </p>
      </div>
      </div>
      </label>

      <div className="bg-surface-container p-space-md rounded-xl flex items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary">
      <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
      </span>
      <div className="font-caption text-caption text-on-surface">
      <span className="font-semibold">Step 4 Live Audit:</span> 1 item issued to 1 car · Logged in immutable movements ledger (JM-KGN-MV-9021)
                  </div>
      </div>
      <a className="font-caption text-caption text-primary underline font-semibold hover:text-on-surface-variant transition-colors whitespace-nowrap" href="#">
                  View in Movements →
                </a>
      </div>
      </div>

      <div className="px-space-xl py-space-md bg-surface-container-lowest flex items-center justify-between">
      <div className="font-label-code text-caption text-secondary">
                Step 3 of 4: Allocation check
              </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors">
                  Back
                </button>
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-space-sm shadow-sm active:scale-[0.98] transition-all" data-stitch-id="issue-btn">
      <span className="material-symbols-outlined text-[17px]">send</span>
      <span>Issue 1 item</span>
      </button>
      </div>
      </div>
      </div>
      </div>

      </div></div>
    </div>
  );
}
