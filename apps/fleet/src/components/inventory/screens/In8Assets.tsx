/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { firstAssetSerial, formatPlate, strField } from '../inventoryData';
export function In8Assets() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const featuredAsset = live.assets[0];
  const featuredSerial = firstAssetSerial(live.assets);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-lg"><div className="flex flex-col w-full gap-space-lg">

      <div className="relative overflow-hidden rounded-lg bg-surface-container-high p-space-md shadow-sm transition-all duration-300" data-stitch-data-stitch-id="telemetry-banner">
      <div className="flex items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md min-w-0">
      <div className="w-8 h-8 rounded flex items-center justify-center bg-surface-container-lowest shrink-0 text-on-surface">
      <span className="material-symbols-outlined text-[20px]">verified_user</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-space-md gap-y-0.5 min-w-0">
      <p className="font-body-sm text-body-sm text-on-surface">
      <span className="font-semibold text-on-surface">Fleet Safety Standard:</span> Fire extinguishers and telematics hardware require annual statutory certification. Track them by serial number for automated Kingston depot audit logs.
                </p>
      <a className="font-body-sm text-body-sm font-semibold text-on-surface underline underline-offset-2 hover:opacity-75 transition-opacity" href="#">Learn inspection workflow</a>
      </div>
      </div>
      <button type="button" className="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0" >
      <span className="material-symbols-outlined text-lg">close</span>
      </button>
      </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md pb-space-xs">
      <div className="flex flex-col gap-space-xs max-w-2xl">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-caption text-secondary uppercase tracking-wider">{live.hubShort} · JM-FLEET-SYS</span>
      <span className="text-outline-variant">•</span>
      <span className="font-label-code text-caption text-surface-tint">Depot Node #01</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
              Real-time custody ledger, location telemetry, and statutory asset coverage across Kingston operational fleet.
            </p>
      </div>

      <div className="flex items-center flex-wrap gap-space-xs shrink-0">
      <button type="button" className="w-9 h-9 rounded flex items-center justify-center bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors shadow-sm" title="Settings">
      <span className="material-symbols-outlined text-lg">settings</span>
      </button>
      <button type="button" className="w-9 h-9 rounded flex items-center justify-center bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors shadow-sm" title="More Operations">
      <span className="material-symbols-outlined text-lg">more_horiz</span>
      </button>
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-semibold transition-colors shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base">download</span>
      <span>Receive Stock</span>
      </button>
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-semibold transition-transform active:scale-95 shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base">local_shipping</span>
      <span>Issue Asset</span>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-low p-1 rounded-lg w-full overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Overview</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Stock</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Vehicle kits</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm bg-primary text-on-primary font-semibold shadow-sm flex items-center gap-space-xs" href="#">
      <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
      <span>Assets</span>
      </a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Movements</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Purchasing</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors" href="#">Counts</a>
      <a className="px-space-md py-1.5 rounded font-body-sm text-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs" href="#">
      <span>Alerts</span>
      <span className="px-1.5 py-0.2 rounded-full bg-error text-on-error font-label-code text-caption font-bold">5</span>
      </a>
      </div>
      </div>

      <div className="flex flex-col gap-space-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-xs">
      <span>Assets — items tracked by serial number</span>
      <span className="font-label-code text-caption text-secondary bg-surface-container-high px-space-xs py-0.5 rounded font-medium">2 Total</span>
      </h2>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">
                Individual device telemetry, warranty expiration, and maintenance lifecycle
              </p>
      </div>
      <div className="flex items-center gap-space-sm flex-wrap">
      <div className="relative min-w-[240px]">
      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">search</span>
      <input className="w-full bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm pl-8 pr-3 py-1.5 rounded-lg shadow-sm outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20" placeholder="Search serial, asset or car..." type="text"/>
      </div>
      <button type="button" onClick={() => shell.openModal('register-asset')} className="h-9 px-space-md rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-semibold transition-colors shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base">add</span>
      <span>Register asset</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto pb-1">
      <button type="button" className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm">
      <span>All</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container-highest/20 font-bold">2</span>
      </button>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-secondary hover:text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm transition-colors">
      <span>Installed</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">1</span>
      </button>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-secondary hover:text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm transition-colors">
      <span>In store</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">1</span>
      </button>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-secondary hover:text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm transition-colors">
      <span>In repair</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">0</span>
      </button>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-secondary hover:text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm transition-colors">
      <span>Faulty</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">0</span>
      </button>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-secondary hover:text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm transition-colors">
      <span>Warranty ending</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">0</span>
      </button>
      </div>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
      <th className="py-3 px-space-md font-semibold">Serial / Identifier</th>
      <th className="py-3 px-space-md font-semibold">Item & Model</th>
      <th className="py-3 px-space-md font-semibold">Status</th>
      <th className="py-3 px-space-md font-semibold">Where / Assigned Car</th>
      <th className="py-3 px-space-md font-semibold">Installed</th>
      <th className="py-3 px-space-md font-semibold">Warranty ends</th>
      <th className="py-3 px-space-md font-semibold">Next inspection</th>
      <th className="py-3 px-space-md font-semibold">Device health</th>
      <th className="py-3 px-space-md font-semibold text-right">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-md align-middle">
      <div className="flex items-center gap-space-xs">
      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-caption font-semibold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
      <span>No serial yet</span>
      </span>
      <button type="button" className="text-on-surface font-body-sm text-caption underline font-semibold hover:text-secondary underline-offset-2">
                        Add serial
                      </button>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Dash camera</span>
      <span className="font-label-code text-caption text-on-surface-variant font-medium">ELC-DCM-01 · Dual-Lens 1080p</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-caption text-caption font-medium">
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      <span>Installed</span>
      </span>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-secondary text-base">directions_car</span>
      <span className="font-body-sm text-body-sm text-on-surface">{formatPlate(strField(featuredAsset ?? {}, 'vehicle_plate', live.primaryPlate))}</span>
      <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-label-plate text-caption text-on-surface font-bold">{live.primaryPlate}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-on-surface">
                    06 Jan 2026
                  </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-outline-variant">
                    —
                  </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-outline-variant">
                    —
                  </td>
      <td className="py-space-md px-space-md align-middle">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-caption text-caption font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
      <span>Not connected</span>
      </span>
      </td>
      <td className="py-space-md px-space-md align-middle text-right">
      <div className="relative inline-block text-left">
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" >
      <span className="material-symbols-outlined text-base">more_horiz</span>
      </button>
      <div className="hidden absolute right-0 mt-1 w-44 rounded-lg bg-surface-container-lowest shadow-xl z-20 py-1 text-left" data-stitch-data-stitch-id="menu-row-1">
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">visibility</span> View details
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">tag</span> Add serial
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">swap_horiz</span> Move asset
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-error hover:bg-error-container/30" href="#">
      <span className="material-symbols-outlined text-sm">warning</span> Report issue
                        </a>
      </div>
      </div>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-md align-middle">
      <a className="font-label-code text-label-code font-semibold text-on-surface hover:underline flex items-center gap-1 group" href="#">
      <span className="material-symbols-outlined text-sm text-surface-tint group-hover:text-on-surface">qr_code_2</span>
      <span>{featuredSerial}</span>
      </a>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Dash camera</span>
      <span className="font-label-code text-caption text-on-surface-variant font-medium">ELC-DCM-01 · Telematics Edition</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-caption text-caption font-medium">
      <span className="w-2 h-2 rounded-full bg-secondary"></span>
      <span>In store</span>
      </span>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-secondary text-base">warehouse</span>
      <span className="font-body-sm text-body-sm text-on-surface">Main store — Kingston</span>
      <span className="font-label-code text-caption text-secondary bg-surface-container px-1 rounded">JM-KIN-ST01</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-outline-variant">
                    —
                  </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-on-surface">
      <div className="flex flex-col">
      <span>06 Jan 2027</span>
      <span className="font-caption text-caption text-surface-tint">in 66 days</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-on-surface">
                    15 Dec 2026
                  </td>
      <td className="py-space-md px-space-md align-middle">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-secondary font-caption text-caption font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-surface-tint"></span>
      <span>Standby</span>
      </span>
      </td>
      <td className="py-space-md px-space-md align-middle text-right">
      <div className="relative inline-block text-left">
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" >
      <span className="material-symbols-outlined text-base">more_horiz</span>
      </button>
      <div className="hidden absolute right-0 mt-1 w-44 rounded-lg bg-surface-container-lowest shadow-xl z-20 py-1 text-left" data-stitch-data-stitch-id="menu-row-2">
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">visibility</span> View details
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">swap_horiz</span> Issue to Car
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low" href="#">
      <span className="material-symbols-outlined text-sm">assignment_turned_in</span> Log Inspection
                        </a>
      <a className="flex items-center gap-2 px-3 py-1.5 font-body-sm text-body-sm text-error hover:bg-error-container/30" href="#">
      <span className="material-symbols-outlined text-sm">build</span> Maintenance Flag
                        </a>
      </div>
      </div>
      </td>
      </tr>
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-space-xs">
      <span>Showing 2 of 2 operational assets</span>
      <span className="text-outline-variant">•</span>
      <span className="font-label-code text-caption">Depot partition: REGION_01_KIN</span>
      </div>
      <div className="flex items-center gap-space-xs">
      <button type="button" className="px-space-md py-1 rounded bg-surface-container text-secondary text-caption font-semibold cursor-not-allowed opacity-50">Previous</button>
      <span className="px-2 font-label-code text-caption font-semibold text-on-surface">Page 1 of 1</span>
      <button type="button" className="px-space-md py-1 rounded bg-surface-container text-secondary text-caption font-semibold cursor-not-allowed opacity-50">Next</button>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Device Custody</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">memory</span>
      </span>
      </div>
      <div className="mt-space-md">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-headline-lg text-headline-lg font-bold text-on-surface">1</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Tracked Device</span>
      </div>
      <div className="mt-space-xs flex items-center gap-1 text-on-tertiary-container font-label-code text-caption font-medium">
      <span className="material-symbols-outlined text-sm">info</span>
      <span>1 Unserialized pending tag</span>
      </div>
      </div>
      <div className="mt-space-md w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
      <div className="bg-primary h-full w-1/2"></div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Compliance Index</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">rule</span>
      </span>
      </div>
      <div className="mt-space-md">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-headline-lg text-headline-lg font-bold text-on-surface">100%</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Compliant</span>
      </div>
      <div className="mt-space-xs flex items-center gap-1 text-surface-tint font-label-code text-caption font-medium">
      <span className="material-symbols-outlined text-sm">check_circle</span>
      <span>Next cycle: 15 Dec 2026</span>
      </div>
      </div>
      <div className="mt-space-md w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
      <div className="bg-surface-tint h-full w-full"></div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Underwritten Protection</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">shield</span>
      </span>
      </div>
      <div className="mt-space-md">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-headline-lg text-headline-lg font-bold text-on-surface font-label-price">J$ 45,998.85</span>
      </div>
      <div className="mt-space-xs flex items-center gap-1 text-secondary font-label-code text-caption font-medium">
      <span className="material-symbols-outlined text-sm">schedule</span>
      <span>Active local underwriter coverage</span>
      </div>
      </div>
      <div className="mt-space-md flex items-center justify-between font-caption text-caption text-on-surface-variant">
      <span>Depot: Kingston Central</span>
      <span className="font-label-code font-semibold text-on-surface">JM-JMD FX Active</span>
      </div>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
