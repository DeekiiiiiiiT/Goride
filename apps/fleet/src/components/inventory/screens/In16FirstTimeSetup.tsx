/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In16FirstTimeSetup() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="w-full max-w-[1240px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary">Depot Provisioning</span>
      <span className="text-surface-dim font-label-code text-caption">/</span>
      <span className="font-label-code text-caption uppercase tracking-wider text-on-surface">Jamaica Sector 01</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-secondary max-w-2xl">
                Set up your storeroom nodes, catalog items, and vehicle kit standards in 3 simple steps.
              </p>
      </div>

      <div className="flex items-center gap-space-md self-start md:self-auto">
      <div className="bg-surface-container-high px-space-md py-1.5 rounded-full flex items-center gap-space-sm shadow-sm">
      <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      </span>
      <span className="font-label-code text-caption font-semibold uppercase tracking-wider text-on-surface">
                  Initial Setup Mode · 0 items on ledger
                </span>
      </div>
      </div>
      </div>

      <div className="w-full flex flex-col items-center gap-space-xl">

      <section className="w-full max-w-[820px] bg-surface-container-lowest rounded-xl shadow-md overflow-hidden transition-all duration-300">

      <div className="bg-surface-container-low px-space-xl py-space-lg flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[22px]">inventory_2</span>
      </div>
      <div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight">Set up inventory</h2>
      <span className="font-caption text-caption text-secondary">Kingston Fleet Terminal #01 Ledger</span>
      </div>
      </div>
      <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-space-xs font-label-code text-caption text-secondary">
      <span className="text-on-surface font-bold" data-stitch-data-stitch-id="step-counter-text">Step 1 of 3</span>
      <span className="text-surface-dim">|</span>
      <span className="text-surface-tint">33% completed</span>
      </div>

      <div className="w-32 h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex gap-0.5">
      <div className="h-full bg-primary flex-1 transition-all duration-500" data-stitch-data-stitch-id="progress-bar-segment"></div>
      <div className="h-full bg-surface-container-high flex-1"></div>
      <div className="h-full bg-surface-container-high flex-1"></div>
      </div>
      </div>
      </div>

      <div className="p-space-xl flex flex-col gap-space-xl">

      <div className="flex gap-space-lg relative group">
      <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold shadow-sm z-10">
                      1
                    </div>
      <div className="w-0.5 h-full bg-surface-container-highest my-2"></div>
      </div>
      <div className="flex-1 pb-space-lg flex flex-col gap-space-md">
      <div>
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Add where you keep stock</h3>
      <span className="font-label-code text-caption text-secondary bg-surface-container px-2 py-0.5 rounded">Core Depot Node</span>
      </div>
      <p className="font-body-md text-body-md text-secondary mt-1">
                        Every item in Roam Fleet belongs to a physical storeroom, depot bay, or vehicle.
                      </p>
      </div>

      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-md">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-space-sm">
      <div className="relative flex-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-secondary">warehouse</span>
      <input className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-28 py-2 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" data-stitch-data-stitch-id="storeroom-input" placeholder="e.g. West Storage Bay, Dispatch Rack A" type="text" value="Main store — Kingston"/>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-caption text-caption text-secondary pointer-events-none">
                            Depot Hub #01 (Default)
                          </span>
      </div>
      <button type="button" className="bg-primary hover:bg-surface-container-highest hover:text-on-surface text-on-primary font-body-md text-body-md font-medium px-space-lg py-2 rounded transition-all duration-200 active:scale-95 flex items-center justify-center gap-space-xs shadow-sm" data-stitch-data-stitch-id="add-location-btn">
      <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
      <span>Add location</span>
      </button>
      </div>

      <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-space-sm rounded shadow-sm">
      <div className="flex items-center gap-space-sm">
      <div className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[14px]">check</span>
      </div>
      <span className="font-body-md text-body-md font-semibold text-on-surface">Main store — Kingston created</span>
      <span className="font-label-code text-caption text-secondary">ID: ST-KIN-001</span>
      </div>
      <span className="font-label-code text-caption text-secondary bg-surface-container-low px-2 py-0.5 rounded">Active Node</span>
      </div>
      </div>
      </div>
      </div>

      <div className="flex gap-space-lg relative group">
      <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold shadow-sm z-10">
                      2
                    </div>
      <div className="w-0.5 h-full bg-surface-container-highest my-2"></div>
      </div>
      <div className="flex-1 pb-space-lg flex flex-col gap-space-md">
      <div>
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Add your items</h3>
      <span className="font-label-code text-caption text-secondary bg-surface-container px-2 py-0.5 rounded">Catalog Init</span>
      </div>
      <p className="font-body-md text-body-md text-secondary mt-1">
                        Start with Roam's recommended standard fleet essentials or create custom items from scratch.
                      </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between shadow-sm cursor-pointer hover:shadow-md transition-all duration-200" data-stitch-data-stitch-id="card-starter-pack">
      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">auto_fix_high</span>
      <span className="font-headline-sm text-[15px] text-on-surface font-semibold">Standard fleet essentials</span>
      </div>
      <span className="bg-primary text-on-primary font-caption text-caption px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Recommended</span>
      </div>
      <p className="font-caption text-caption text-secondary">
                            Pre-configured registry items tagged with serial templates & JMD landed cost defaults:
                          </p>

      <div className="flex flex-wrap gap-1.5 py-1">
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Spare tyre</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Car jack</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Lug wrench</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Tyre pump</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Phone holder</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">First-aid kit</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Warning triangle</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Dash camera</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Toll tag</span>
      <span className="bg-surface-container-lowest text-on-surface font-label-code text-[11px] px-2 py-0.5 rounded shadow-sm">Fuel card</span>
      </div>
      </div>
      <div className="pt-space-md mt-space-sm flex items-center justify-between">
      <span className="font-label-code text-caption text-secondary">10 catalog definitions</span>
      <button type="button" className="bg-primary hover:bg-surface-container-highest hover:text-on-surface text-on-primary font-body-sm text-body-sm font-semibold px-space-md py-1.5 rounded transition-all duration-150 flex items-center gap-space-xs shadow-sm" data-stitch-data-stitch-id="load-starter-btn">
      <span className="material-symbols-outlined text-[16px]">file_download_done</span>
      <span>Load starter list (10 items)</span>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col justify-between shadow-sm cursor-pointer hover:shadow-md transition-all duration-200">
      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-secondary">post_add</span>
      <span className="font-headline-sm text-[15px] text-on-surface font-semibold">Add items myself</span>
      </div>
      <span className="font-label-code text-caption text-secondary">Custom</span>
      </div>
      <p className="font-body-sm text-body-sm text-secondary">
                            Build your SKU ledger from custom CSV sheets or input part barcodes by hand with bespoke reorder thresholds.
                          </p>
      <div className="bg-surface-container-lowest rounded p-space-sm flex items-center gap-space-sm shadow-sm mt-2">
      <span className="material-symbols-outlined text-[20px] text-secondary">upload_file</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption font-semibold text-on-surface">Supported formats</span>
      <span className="font-label-code text-[10px] text-secondary">CSV, TSV, or XLSX standard schemas</span>
      </div>
      </div>
      </div>
      <div className="pt-space-md mt-space-sm flex items-center justify-between">
      <span className="font-label-code text-caption text-secondary">Blank catalog</span>
      <button type="button" onClick={() => shell.openGap('import-items')} className="bg-surface-container-lowest hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium px-space-md py-1.5 rounded shadow-sm transition-all duration-150 flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">edit_document</span>
      <span>Configure manually</span>
      </button>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="flex gap-space-lg relative">
      <div className="flex flex-col items-center">
      <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold shadow-sm z-10">
                      3
                    </div>
      </div>
      <div className="flex-1 flex flex-col gap-space-md">
      <div>
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Pick a kit for your cars</h3>
      <span className="font-label-code text-caption text-secondary bg-surface-container px-2 py-0.5 rounded">Checklist Rule</span>
      </div>
      <p className="font-body-md text-body-md text-secondary mt-1">
                        Automatically bundle mandatory equipment checklists for your active fleet.
                      </p>
      </div>

      <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-md shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm">
      <span className="material-symbols-outlined text-[20px]">directions_car</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <span className="font-headline-sm text-[16px] text-on-surface font-semibold">Rideshare car kit</span>
      <span className="bg-surface-container-highest text-on-surface font-label-code text-[11px] px-2 py-0.2 rounded font-medium">Standard Spec</span>
      </div>
      <p className="font-caption text-caption text-secondary mt-0.5">
                              10 standard items + 1 optional fire extinguisher · Meets Jamaica Transport Authority & Roam safety standards
                            </p>
      </div>
      </div>
      <span className="font-label-code text-caption text-secondary bg-surface-container-lowest px-2 py-1 rounded shadow-sm self-start sm:self-auto">
                          JTA Compliant
                        </span>
      </div>

      <div className="bg-surface-container-lowest p-space-sm rounded flex flex-col sm:flex-row sm:items-center justify-between gap-space-md shadow-sm">
      <label className="flex items-center gap-space-md cursor-pointer select-none">
      <input defaultChecked className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer" type="checkbox"/>
      <span className="font-body-md text-body-md text-on-surface font-medium">
                            Assign to 2 cars ({live.primaryPlate}, {live.secondaryPlate})
                          </span>
      </label>
      <div className="flex items-center gap-space-sm">
      <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded">
      <span className="material-symbols-outlined text-[14px] text-secondary">directions_car</span>
      <span className="font-label-plate text-label-plate text-on-surface">{live.primaryPlate}</span>
      </div>
      <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded">
      <span className="material-symbols-outlined text-[14px] text-secondary">directions_car</span>
      <span className="font-label-plate text-label-plate text-on-surface">{live.secondaryPlate}</span>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-low px-space-xl py-space-lg flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm text-secondary">
      <span className="material-symbols-outlined text-[18px]">verified_user</span>
      <span className="font-caption text-caption">Telemetry sync locked to {live.hubName} node</span>
      </div>
      <button type="button" className="w-full sm:w-auto bg-primary hover:bg-surface-container-highest hover:text-on-surface text-on-primary font-headline-sm text-body-md font-semibold px-8 py-3 rounded-lg shadow-md transition-all duration-200 active:scale-95 flex items-center justify-center gap-space-sm" data-stitch-data-stitch-id="finish-setup-btn">
      <span>Finish setup</span>
      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </button>
      </div>
      </section>

      <section className="w-full max-w-[820px] bg-surface-container-low rounded-xl p-space-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-xl">
      <div className="flex items-start gap-space-lg flex-1">
      <div className="w-12 h-12 rounded-xl bg-surface-container-lowest shadow-sm flex-shrink-0 flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[26px]">rule</span>
      </div>
      <div className="flex flex-col gap-1">
      <div className="flex items-center gap-space-sm">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">
                      Count what you actually have so your numbers start right
                    </h3>
      <span className="font-label-code text-caption bg-surface-container-high px-2 py-0.5 rounded text-on-surface">Baseline Audit</span>
      </div>
      <p className="font-body-md text-body-md text-secondary">
                    A quick physical blind count establishes your baseline inventory without guessing. Discrepancies will be cleanly cataloged into your audit ledger.
                  </p>
      </div>
      </div>
      <div className="flex flex-col items-stretch sm:items-end gap-space-sm w-full md:w-auto flex-shrink-0">
      <button type="button" className="bg-primary hover:bg-surface-container-highest hover:text-on-surface text-on-primary font-body-md text-body-md font-semibold px-space-xl py-2.5 rounded-lg shadow-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px]">fact_check</span>
      <span>+ Start a count</span>
      </button>
      <button type="button" onClick={() => shell.openGap('opening-balances')} className="text-secondary hover:text-on-surface font-body-sm text-body-sm transition-colors text-center sm:text-right px-1">
                  I'll count later (enter opening balances manually)
                </button>
      </div>
      </section>

      <div className="w-full max-w-[820px] flex items-center justify-between px-space-sm text-secondary font-label-code text-caption">
      <div className="flex items-center gap-space-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
      <span>Roam Terminal Node: ROAM-KIN-HUB01</span>
      </div>
      <div>
      <span>Lat: 17.9714° N · Lon: 76.7936° W</span>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
