/** Ported from Stitch — do not simplify layout (audit §0.4). */
import type { DriverCarKitPayload } from '../../../services/driverInventoryApi';
import {
  carKitItemCounts,
  carKitProgressOffset,
  carKitVehicleLabel,
} from '../carKitDisplay';

export function Dk1MyCarKit({ kit }: { kit?: DriverCarKitPayload | null }) {
  const vehicleLabel = carKitVehicleLabel(kit);
  const { present, total } = carKitItemCounts(kit);
  const progressOffset = carKitProgressOffset(present, total);
  const missing = Math.max(0, total - present);
  const checkInLabel = kit?.lastCheckInAt
    ? `Weekly check-in completed ${new Date(kit.lastCheckInAt).toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'No weekly check-in recorded yet';
  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className="px-margin pt-space-xs pb-space-lg flex flex-col gap-space-md">
      <div className="flex flex-col gap-space-xs">
      <a className="inline-flex items-center gap-1.5 py-1 text-on-surface-variant hover:text-on-surface transition-colors self-start" href="#">
      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      <span className="font-body-sm text-body-sm font-semibold">Back to Vehicle</span>
      </a>
      <div className="flex flex-wrap items-baseline justify-between gap-space-xs">
      <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">My car kit</h1>
      <div className="bg-surface-container-lowest px-space-xs py-0.5 rounded-lg shadow-sm">
      <span className="font-label-code text-label-code text-on-surface uppercase tracking-wider">{vehicleLabel}</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center gap-space-md">

      <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
      <svg className="w-20 h-20 -rotate-90" viewbox="0 0 72 72">
      <circle className="text-surface-container-high" cx="36" cy="36" fill="transparent" r="30" stroke="currentColor" stroke-width="6"></circle>
      <circle className="text-primary" cx="36" cy="36" fill="transparent" r="30" stroke="currentColor" stroke-dasharray="188.5" stroke-dashoffset={progressOffset} stroke-linecap="round" stroke-width="6"></circle>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <span className="font-label-plate text-label-plate text-on-surface leading-none">{present}<span className="text-on-surface-variant font-body-sm text-body-sm">/{total || '—'}</span></span>
      </div>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-headline-sm text-headline-sm text-on-surface leading-tight">Ready for the road</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                  {total > 0
                    ? `Your car has ${present} of ${total} kit items. ${missing} are not in the car — the fleet knows.`
                    : 'No kit items loaded yet.'}
                </p>
      </div>
      </div>
      <div className="bg-surface-container-low rounded-lg px-space-sm py-2 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-[18px]" style="font-variation-settings: 'FILL' 1;">verified</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">{checkInLabel}</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between">
      <span className="font-label-status text-label-status text-on-surface-variant uppercase tracking-wider">Required Inventory</span>
      <span className="font-body-sm text-body-sm font-semibold text-primary">10 Checked</span>
      </div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <circle cx="12" cy="12" r="9"></circle>
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 3v5m0 8v5M3 12h5m8 0h5"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Spare tyre</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk sub-floor compartment</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  In the car
                </span>
      </div>
      <div className="flex justify-end pt-1">
      <button type="button" className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Report a problem
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <path d="m14 7 3-3m0 0 3 3m-3-3v8"></path>
      <path d="M4 20h16"></path>
      <path d="M6 20l6-9 6 9"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Car jack</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk side-bin</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  In the car
                </span>
      </div>
      <div className="flex justify-end pt-1">
      <button type="button" className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Report a problem
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Lug wrench</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Jack bracket clip</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  In the car
                </span>
      </div>
      <div className="flex justify-end pt-1">
      <button type="button" className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Report a problem
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <rect height="18" rx="2" width="12" x="6" y="3"></rect>
      <path d="M12 18h.01M9 7h6"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Phone holder</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Center console mount</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  In the car
                </span>
      </div>
      <div className="flex justify-end pt-1">
      <button type="button" className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Report a problem
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
      <circle cx="12" cy="13" r="3"></circle>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Dash camera •••• 2118</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Rearview mirror bracket</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-primary font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  In the car
                </span>
      </div>
      <div className="flex justify-end pt-1">
      <button type="button" className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Report a problem
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-low">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <rect height="12" rx="2" width="14" x="5" y="3"></rect>
      <path d="M12 15v6m-4 0h8M9 7h6"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Tyre pump</span>
      <span className="font-body-sm text-body-sm text-error font-medium">Reported 28 Oct · Fleet informed</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-error font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">cancel</span>
                  Not in this car
                </span>
      </div>
      <div className="flex items-center justify-between pt-1">
      <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px] text-tertiary">schedule</span>
                  Replacement en route
                </span>
      <button type="button" className="font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Update status
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-low">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <rect height="14" rx="2" width="18" x="3" y="6"></rect>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M12 10v6m-3-3h6"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">First-aid kit</span>
      <span className="font-body-sm text-body-sm text-error font-medium">Reported 28 Oct · Restock pending</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-error font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">cancel</span>
                  Not in this car
                </span>
      </div>
      <div className="flex items-center justify-between pt-1">
      <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px] text-tertiary">inventory_2</span>
                  Hub collection ready
                </span>
      <button type="button" className="font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Update status
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-low">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
      <line x1="12" x2="12" y1="9" y2="13"></line>
      <line x1="12" x2="12.01" y1="17" y2="17"></line>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Warning triangle</span>
      <span className="font-body-sm text-body-sm text-error font-medium">Reported 28 Oct · Pending replacement</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container-lowest text-error font-label-status text-label-status flex items-center gap-1 flex-shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[16px]">cancel</span>
                  Not in this car
                </span>
      </div>
      <div className="flex items-center justify-between pt-1">
      <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px] text-tertiary">priority_high</span>
                  Urgent safety item
                </span>
      <button type="button" className="font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center" type="button">
                  Update status
                </button>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <rect height="14" rx="2" width="20" x="2" y="5"></rect>
      <line x1="2" x2="22" y1="10" y2="10"></line>
      <circle cx="7" cy="15" r="1"></circle>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Toll tag</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Managed by fleet</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container text-on-surface-variant font-label-status text-label-status flex items-center gap-1 flex-shrink-0">
      <span className="material-symbols-outlined text-[16px]">link</span>
                  Linked
                </span>
      </div>
      </div>
      <div className="h-px bg-surface-container-high mx-space-md"></div>

      <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24">
      <rect height="14" rx="2" width="20" x="2" y="5"></rect>
      <line x1="2" x2="22" y1="10" y2="10"></line>
      <path d="M16 15h2"></path>
      </svg>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Fuel card</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Managed by fleet</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container text-on-surface-variant font-label-status text-label-status flex items-center gap-1 flex-shrink-0">
      <span className="material-symbols-outlined text-[16px]">link</span>
                  Linked
                </span>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-xs mt-1">
      <span className="font-label-status text-label-status text-on-surface-variant uppercase tracking-wider px-1">Also in this car</span>
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface">
      <span className="material-symbols-outlined text-[20px]">layers</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Car mats</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Front & rear cabin protection</span>
      </div>
      </div>
      <span className="px-space-xs py-1 rounded-full bg-surface-container text-on-surface font-label-status text-label-status">
                Standard fit
              </span>
      </div>
      </div>

      <button type="button" className="w-full min-h-[52px] bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-button text-label-button rounded-xl flex items-center justify-center gap-2 shadow-sm active:bg-surface-container transition-colors mt-2" type="button">
      <span className="material-symbols-outlined text-[22px]">add</span>
            Report something else
          </button>

      <div className="flex items-center justify-center gap-2 text-center py-2 text-on-surface-variant font-body-sm text-body-sm">
      <span className="material-symbols-outlined text-[18px]">support_agent</span>
      <span>Need depot assistance? Call Fleet Support 24/7</span>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
