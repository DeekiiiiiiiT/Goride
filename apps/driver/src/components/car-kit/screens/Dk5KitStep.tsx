/** Ported from Stitch — do not simplify layout (audit §0.4). */
import type { DriverCarKitPayload } from '../../../services/driverInventoryApi';
import { carKitItemCounts, carKitVehicleLabel } from '../carKitDisplay';

export function Dk5KitStep({
  kit,
  onConfirmAll,
  onReportIssue,
  busy = false,
}: {
  kit?: DriverCarKitPayload | null;
  onConfirmAll?: () => void;
  onReportIssue?: () => void;
  busy?: boolean;
}) {
  const vehicleLabel = carKitVehicleLabel(kit);
  const { present, total } = carKitItemCounts(kit);
  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full px-margin pb-space-xl">

      <div className="flex flex-col gap-space-xs pt-space-xs pb-space-sm">
      <div className="flex items-center justify-between">
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Step 4 of 5 · Weekly check-in</span>
      <span className="font-label-code text-label-code text-primary bg-surface-container-high px-space-xs py-0.5 rounded-lg">80% COMPLETE</span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 h-1.5 w-full">
      <div className="bg-primary rounded-full h-full" title="Step 1: Odometer"></div>
      <div className="bg-primary rounded-full h-full" title="Step 2: Exterior"></div>
      <div className="bg-primary rounded-full h-full" title="Step 3: Interior"></div>
      <div className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(0,105,72,0.35)]" title="Step 4: Kit check"></div>
      <div className="bg-surface-container-high rounded-full h-full" title="Step 5: Submit"></div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-md">
      <div className="flex items-start gap-space-sm">
      <div className="w-10 h-10 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[24px]">inventory_2</span>
      </div>
      <div className="flex flex-col">
      <h2 className="font-headline-sm text-headline-sm text-on-surface leading-tight">Is everything in your kit?</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Quick 30-second check for {vehicleLabel}.</p>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm mb-space-md">
      <div className="bg-surface-container-low px-space-md py-space-xs flex items-center justify-between">
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">Present in Vehicle ({present} Items)</span>
      <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
      </div>
      <div className="divide-none flex flex-col p-space-xs">

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">tire_repair</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Spare tyre</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk sub-floor</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">precision_manufacturing</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Car jack</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk side-bin</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">build</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Lug wrench</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Jack clip</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">smartphone</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Phone holder</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Console mount</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">videocam</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Dash camera •••• 2118</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Windshield</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">toll</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Toll tag</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Windshield transponder</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">credit_card</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Fuel card</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Glove box</span>
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm mb-space-lg">
      <div className="bg-surface-container px-space-md py-space-xs flex items-center justify-between">
      <div className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-tertiary text-[18px]">history</span>
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">Prior Open Reports (3)</span>
      </div>
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Logged</span>
      </div>
      <div className="flex flex-col p-space-xs opacity-75">

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-outline shrink-0">
      <span className="material-symbols-outlined text-[20px]">air</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-medium text-outline line-through">Tyre pump</span>
      <span className="font-body-sm text-body-sm text-outline">Under driver seat</span>
      </div>
      </div>
      <span className="bg-surface-container text-outline px-space-xs py-1 rounded-full font-label-status text-label-status flex items-center gap-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                Already reported (Missing)
              </span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-outline shrink-0">
      <span className="material-symbols-outlined text-[20px]">medical_services</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-medium text-outline line-through">First-aid kit</span>
      <span className="font-body-sm text-body-sm text-outline">Door pocket (L)</span>
      </div>
      </div>
      <span className="bg-surface-container text-outline px-space-xs py-1 rounded-full font-label-status text-label-status flex items-center gap-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                Already reported (Restock pending)
              </span>
      </div>

      <div className="flex items-center justify-between min-h-[52px] px-space-sm py-2">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-outline shrink-0">
      <span className="material-symbols-outlined text-[20px]">warning</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-medium text-outline line-through">Warning triangle</span>
      <span className="font-body-sm text-body-sm text-outline">Trunk strap</span>
      </div>
      </div>
      <span className="bg-surface-container text-outline px-space-xs py-1 rounded-full font-label-status text-label-status flex items-center gap-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                Already reported (Pending replacement)
              </span>
      </div>
      </div>
      <div className="px-space-md py-space-xs bg-surface-container-low flex items-center gap-1.5">
      <span className="material-symbols-outlined text-outline text-[16px]">info</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant italic">Items already reported to fleet are automatically skipped.</p>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm pt-space-xs">

      <button
        type="button"
        className="w-full h-[52px] min-h-[52px] bg-primary-container active:bg-primary text-on-primary-container rounded-xl flex items-center justify-center gap-space-xs font-label-button text-label-button shadow-md transition-all disabled:opacity-60"
        id="btn-confirm-all"
        disabled={busy}
        onClick={() => onConfirmAll?.()}
      >
      <span className="material-symbols-outlined text-[22px]">check_circle</span>
      <span>Yes, it's all there</span>
      </button>

      <button
        type="button"
        className="w-full h-[52px] min-h-[52px] bg-surface-container-lowest text-on-surface rounded-xl flex items-center justify-center gap-space-xs font-label-button text-label-button shadow-sm hover:bg-surface-container-low transition-all"
        id="btn-open-issue-sheet"
        onClick={() => onReportIssue?.()}
      >
      <span className="material-symbols-outlined text-secondary text-[22px]">error_outline</span>
      <span>No — something's missing or broken</span>
      </button>
      </div>

      <div className="fixed inset-0 z-50 bg-inverse-surface/65 hidden flex-col justify-end backdrop-blur-[2px]" id="issue-modal">
      <div className="w-full max-w-md mx-auto bg-surface-container-lowest rounded-t-2xl shadow-2xl flex flex-col max-h-[751px] overflow-hidden transform translate-y-full transition-transform duration-300" id="modal-panel">

      <div className="p-space-md pb-space-xs flex flex-col bg-surface-container-low">
      <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mb-space-xs"></div>
      <div className="flex items-center justify-between">
      <div className="flex flex-col">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Select items with a problem</h3>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Check all that are missing or damaged</span>
      </div>
      <button type="button" aria-label="Close dialog" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors" id="btn-close-modal" onClick={() => onClose?.()}>
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      </div>

      <div className="overflow-y-auto px-space-md py-space-sm flex flex-col gap-1.5 flex-1">
      <div className="text-xs font-label-code text-on-surface-variant uppercase tracking-wider py-1">Active Kit Items</div>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">tire_repair</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Spare tyre</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk sub-floor</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Spare tyre"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">precision_manufacturing</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Car jack</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Trunk side-bin</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Car jack"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">build</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Lug wrench</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Jack clip</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Lug wrench"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">smartphone</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Phone holder</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Console mount</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Phone holder"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">videocam</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Dash camera •••• 2118</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Windshield</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Dash camera"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">toll</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Toll tag</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Windshield transponder</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Toll tag"/>
      </label>

      <label className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">credit_card</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Fuel card</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Glove box</span>
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value="Fuel card"/>
      </label>

      <div className="text-xs font-label-code text-outline uppercase tracking-wider pt-space-xs pb-1">Already Reported (Locked)</div>
      <div className="flex items-center justify-between min-h-[48px] px-space-sm py-2 rounded-xl bg-surface-container/60 opacity-60">
      <span className="font-body-sm text-body-sm text-outline">Tyre pump</span>
      <span className="font-label-code text-xs text-outline bg-surface-container-high px-2 py-0.5 rounded">SKIPPED</span>
      </div>
      <div className="flex items-center justify-between min-h-[48px] px-space-sm py-2 rounded-xl bg-surface-container/60 opacity-60">
      <span className="font-body-sm text-body-sm text-outline">First-aid kit</span>
      <span className="font-label-code text-xs text-outline bg-surface-container-high px-2 py-0.5 rounded">SKIPPED</span>
      </div>
      <div className="flex items-center justify-between min-h-[48px] px-space-sm py-2 rounded-xl bg-surface-container/60 opacity-60">
      <span className="font-body-sm text-body-sm text-outline">Warning triangle</span>
      <span className="font-label-code text-xs text-outline bg-surface-container-high px-2 py-0.5 rounded">SKIPPED</span>
      </div>
      </div>

      <div className="p-space-md bg-surface-container-low flex flex-col gap-space-xs">
      <button type="button" className="w-full h-[52px] bg-secondary active:bg-secondary-container text-on-secondary rounded-xl flex items-center justify-center gap-space-xs font-label-button text-label-button shadow-md disabled:opacity-40 disabled:pointer-events-none transition-all" disabled="" id="btn-proceed-faults" type="button">
      <span className="material-symbols-outlined text-[20px]">flag</span>
      <span id="btn-proceed-label">Report Selected Items</span>
      </button>
      </div>
      </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-space-md py-space-xs rounded-full shadow-lg font-body-sm text-body-sm hidden items-center gap-2 z-50" id="toast-notify">
      <span className="material-symbols-outlined text-primary-fixed text-[18px]">check_circle</span>
      <span id="toast-text">Kit verified! Advancing to Step 5...</span>
      </div>
      </div>
      </div>
    </div>
  );
}
