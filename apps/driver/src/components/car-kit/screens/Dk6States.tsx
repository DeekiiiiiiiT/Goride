import { useEffect } from 'react';
import type { CarKitDk6View } from '../carKitNavigation';
import type { DriverCarKitPayload } from '../../../services/driverInventoryApi';
import { carKitVehicleLabel } from '../carKitDisplay';

const VIEW_IDS: Record<CarKitDk6View, string> = {
  loading: 'view-loading',
  nocar: 'view-nocar',
  nokit: 'view-nokit',
  loadfailed: 'view-loadfailed',
  sendfailed: 'view-sendfailed',
};

/** Ported from Stitch — do not simplify layout (audit §0.4). */
export function Dk6States({
  activeState,
  onRetry,
  showInspector = false,
  kit,
  failedDraft,
  sendErrorRef,
  onResend,
}: {
  activeState?: CarKitDk6View;
  onRetry?: () => void;
  showInspector?: boolean;
  kit?: DriverCarKitPayload | null;
  failedDraft?: { itemLabel: string; issueLabel: string; note?: string } | null;
  sendErrorRef?: string | null;
  onResend?: () => void;
}) {
  const vehiclePlate = carKitVehicleLabel(kit);
  const draftItem = failedDraft?.itemLabel ?? 'Kit item';
  const draftIssue = failedDraft?.issueLabel ?? 'Reported issue';
  const draftNote = failedDraft?.note?.trim() || 'No note saved with this report.';
  const errorRef = sendErrorRef?.trim() || 'SEND_FAILED';
  const odometerLabel =
    kit?.odometerKm != null ? `${Number(kit.odometerKm).toLocaleString('en-JM')} km` : '—';
  useEffect(() => {
    if (!activeState) return;
    const activeId = VIEW_IDS[activeState];
    Object.values(VIEW_IDS).forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      if (id === activeId) {
        node.classList.remove('hidden');
        node.classList.add('flex');
      } else {
        node.classList.add('hidden');
        node.classList.remove('flex');
      }
    });
  }, [activeState]);

  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">
      <div className={`w-full bg-surface-container-high px-margin py-space-sm shadow-sm sticky top-16 z-30${showInspector ? '' : ' hidden'}`}>
      <div className="flex items-center justify-between mb-space-xs">
      <span className="font-label-status text-label-status text-on-surface-variant flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
              PROTOTYPE STATE INSPECTOR
            </span>
      <span className="font-label-code text-[11px] px-2 py-0.5 rounded-full bg-surface-container-lowest text-primary font-bold">390px VIEW</span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1" id="state-tab-container">
      <button type="button" className="state-tab px-3 py-1.5 rounded-full font-label-status text-[12px] whitespace-nowrap bg-primary text-on-primary transition-all flex items-center gap-1 shadow-sm" id="tab-loading" onClick={() => {}}>
      <span className="material-symbols-outlined text-[14px]">hourglass_top</span> Loading
            </button>
      <button type="button" className="state-tab px-3 py-1.5 rounded-full font-label-status text-[12px] whitespace-nowrap bg-surface-container-lowest text-on-surface-variant transition-all flex items-center gap-1 hover:text-on-surface" id="tab-nocar" onClick={() => {}}>
      <span className="material-symbols-outlined text-[14px]">no_crash</span> No Car
            </button>
      <button type="button" className="state-tab px-3 py-1.5 rounded-full font-label-status text-[12px] whitespace-nowrap bg-surface-container-lowest text-on-surface-variant transition-all flex items-center gap-1 hover:text-on-surface" id="tab-nokit" onClick={() => {}}>
      <span className="material-symbols-outlined text-[14px]">inventory_2</span> No Kit Set Up
            </button>
      <button type="button" className="state-tab px-3 py-1.5 rounded-full font-label-status text-[12px] whitespace-nowrap bg-surface-container-lowest text-on-surface-variant transition-all flex items-center gap-1 hover:text-on-surface" id="tab-loadfailed" onClick={() => {}}>
      <span className="material-symbols-outlined text-[14px]">wifi_off</span> Load Failed
            </button>
      <button type="button" className="state-tab px-3 py-1.5 rounded-full font-label-status text-[12px] whitespace-nowrap bg-surface-container-lowest text-on-surface-variant transition-all flex items-center gap-1 hover:text-on-surface" id="tab-sendfailed" onClick={() => {}}>
      <span className="material-symbols-outlined text-[14px]">sync_problem</span> Send Failed
            </button>
      </div>
      </div>
      <div className="px-margin py-space-md w-full max-w-[420px] mx-auto">

      <div className="state-view flex flex-col gap-space-md animate-fade" id="view-loading">
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
      <div className="h-6 w-32 bg-surface-container-highest rounded-md animate-pulse"></div>
      <div className="h-5 w-16 bg-surface-container-highest rounded-full animate-pulse"></div>
      </div>
      <div className="h-4 w-48 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex items-center gap-space-lg">
      <div className="relative w-20 h-20 rounded-full bg-surface-container-highest flex-shrink-0 animate-pulse flex items-center justify-center">
      <div className="w-14 h-14 rounded-full bg-surface-container-lowest"></div>
      </div>
      <div className="flex flex-col gap-2.5 flex-1 min-w-0">
      <div className="h-5 w-28 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-3.5 w-full bg-surface-container-high rounded animate-pulse"></div>
      <div className="h-3.5 w-3/4 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      </div>
      <div className="flex items-center justify-between pt-1">
      <div className="h-4 w-24 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-4 w-16 bg-surface-container-highest rounded animate-pulse"></div>
      </div>
      <div className="flex flex-col gap-space-sm">
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-surface-container-highest animate-pulse"></div>
      <div className="flex flex-col gap-2">
      <div className="h-4 w-32 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-3 w-20 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      </div>
      <div className="w-6 h-6 rounded-md bg-surface-container-highest animate-pulse"></div>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-surface-container-highest animate-pulse"></div>
      <div className="flex flex-col gap-2">
      <div className="h-4 w-36 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-3 w-24 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      </div>
      <div className="w-6 h-6 rounded-md bg-surface-container-highest animate-pulse"></div>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-surface-container-highest animate-pulse"></div>
      <div className="flex flex-col gap-2">
      <div className="h-4 w-28 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-3 w-16 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      </div>
      <div className="w-6 h-6 rounded-md bg-surface-container-highest animate-pulse"></div>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-surface-container-highest animate-pulse"></div>
      <div className="flex flex-col gap-2">
      <div className="h-4 w-40 bg-surface-container-highest rounded animate-pulse"></div>
      <div className="h-3 w-20 bg-surface-container-high rounded animate-pulse"></div>
      </div>
      </div>
      <div className="w-6 h-6 rounded-md bg-surface-container-highest animate-pulse"></div>
      </div>
      </div>
      </div>

      <div className="state-view hidden flex flex-col gap-space-md" id="view-nocar">
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-outline text-xl">directions_car</span>
      <span className="font-headline-sm text-[16px] text-on-surface">No vehicle assigned</span>
      </div>
      <span className="font-label-status text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider">Unassigned</span>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl p-space-xl shadow-sm flex flex-col items-center text-center mt-2">
      <div className="w-32 h-32 rounded-full bg-surface-container flex items-center justify-center mb-space-md relative overflow-hidden">
      <svg className="w-20 h-20 text-outline stroke-current fill-none stroke-[1.5]" stroke-dasharray="3 3" viewbox="0 0 24 24">
      <path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0"></path>
      <path d="M5 17H3v-6l2-5h9l4 5h3v6h-2M9 17h6"></path>
      <path d="M14 6l3 5H9V6h5z"></path>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-high/40 to-transparent"></div>
      </div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">No car assigned</h2>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-[280px] mb-space-lg">
                No car is assigned to you right now. Your kit will show here when you get a car.
              </p>
      <div className="flex flex-col gap-space-xs w-full">
      <button type="button" className="w-full h-[52px] rounded-xl bg-primary text-on-primary font-label-button text-label-button flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform" onClick={() => onRetry?.()}>
      <span className="material-symbols-outlined text-[20px]">refresh</span>
                  Refresh status
                </button>
      <button type="button" className="w-full h-[52px] rounded-xl bg-surface-container-high text-on-surface font-label-button text-label-button flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" onClick={() => {}}>
      <span className="material-symbols-outlined text-[20px]">support_agent</span>
                  Contact fleet manager
                </button>
      </div>
      </div>
      <div className="p-space-md rounded-xl bg-surface-container flex items-start gap-3">
      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">info</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                Shift handovers usually register within 3 minutes of dispatcher key handoff.
              </p>
      </div>
      </div>

      <div className="state-view hidden flex flex-col gap-space-md" id="view-nokit">
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="px-2 py-1 rounded-lg bg-surface-container-highest shadow-sm flex-shrink-0">
      <span className="font-label-plate text-[16px] text-on-surface">{vehiclePlate}</span>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-headline-sm text-[16px] text-on-surface truncate">Honda Fit 2018</span>
      <span className="font-body-sm text-[12px] text-on-surface-variant">Compact Fleet · White</span>
      </div>
      </div>
      <span className="font-label-status text-[11px] px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider">Assigned</span>
      </div>
      <div className="bg-surface-container-lowest rounded-2xl p-space-xl shadow-sm flex flex-col items-center text-center">
      <div className="w-28 h-28 rounded-2xl bg-surface-container-low flex items-center justify-center mb-space-md shadow-inner">
      <div className="w-16 h-16 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[40px]">inventory</span>
      </div>
      </div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">Kit not configured</h2>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-[280px] mb-space-lg">
                Your fleet hasn't set up a kit for this car yet.
              </p>
      <button type="button" className="w-full h-[52px] rounded-xl bg-primary text-on-primary font-label-button text-label-button flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform mb-space-xs" onClick={() => {}}>
      <span className="material-symbols-outlined text-[20px]">add_circle</span>
                Report something in the car
              </button>
      <p className="font-body-sm text-[12px] text-outline mt-1">
                Missing tools, documents, or accessories can still be logged directly.
              </p>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
      <div className="flex items-center justify-between mb-space-xs">
      <span className="font-headline-sm text-[15px] text-on-surface">Car Quick Specs</span>
      <span className="font-label-code text-[12px] text-on-surface-variant">VIN: **4092</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
      <div className="p-2.5 rounded-lg bg-surface-container-low">
      <span className="font-body-sm text-[12px] text-on-surface-variant block">Fuel Level</span>
      <span className="font-label-button text-[14px] text-on-surface">85% full</span>
      </div>
      <div className="p-2.5 rounded-lg bg-surface-container-low">
      <span className="font-body-sm text-[12px] text-on-surface-variant block">Odometer</span>
      <span className="font-label-button text-[14px] text-on-surface">{odometerLabel}</span>
      </div>
      </div>
      </div>
      </div>

      <div className="state-view hidden flex flex-col gap-space-md" id="view-loadfailed">

      <div className="rounded-xl bg-secondary p-space-md text-on-secondary shadow-md flex items-start justify-between gap-3" id="load-failed-banner">
      <div className="flex items-start gap-2.5">
      <span className="material-symbols-outlined text-[22px] flex-shrink-0 mt-0.5">wifi_off</span>
      <div className="flex flex-col">
      <span className="font-headline-sm text-[15px] leading-tight">Couldn't load your kit.</span>
      <span className="font-body-sm text-[13px] text-on-secondary/90 mt-0.5">Check your signal and try again.</span>
      </div>
      </div>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-on-secondary text-secondary font-label-button text-[13px] whitespace-nowrap active:scale-95 transition-transform flex-shrink-0" data-car-kit-action="retry-load" onClick={() => onRetry?.()}>
                Try again
              </button>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm opacity-60">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
      <div className="px-2 py-0.5 rounded-md bg-surface-container-highest">
      <span className="font-label-plate text-[14px] text-on-surface">{vehiclePlate}</span>
      </div>
      <span className="font-headline-sm text-[15px] text-on-surface">Toyota Probox</span>
      </div>
      <span className="font-label-status text-[11px] text-outline">Offline cached</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-error-container text-error flex items-center justify-center mb-space-sm">
      <span className="material-symbols-outlined text-[36px]">cloud_off</span>
      </div>
      <h3 className="font-headline-sm text-[18px] text-on-surface mb-1">Network timeout</h3>
      <p className="font-body-md text-body-sm text-on-surface-variant max-w-[260px] mb-space-md">
                Unable to synchronize car kit catalog from fleet server.
              </p>
      <button type="button" className="w-full h-[52px] rounded-xl bg-primary text-on-primary font-label-button text-label-button flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform" onClick={() => onRetry?.()}>
      <span className="material-symbols-outlined text-[20px]">sync</span>
                Retry connection
              </button>
      </div>
      <div className="p-space-md rounded-xl bg-surface-container-low flex items-center justify-between">
      <span className="font-body-sm text-on-surface-variant">Last synced: Today at 07:15 AM</span>
      <span className="font-label-code text-[11px] text-primary">v2.4-JA</span>
      </div>
      </div>

      <div className="state-view hidden flex flex-col gap-space-md" id="view-sendfailed">

      <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-md flex flex-col gap-space-sm">
      <div className="flex items-center justify-between pb-1">
      <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-secondary text-2xl">report_problem</span>
      <span className="font-headline-sm text-[18px] text-on-surface">Report Item Fault</span>
      </div>
      <span className="font-label-status text-[12px] px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-semibold">Unsent</span>
      </div>

      <div className="rounded-xl bg-secondary p-space-md text-on-secondary shadow-sm flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[22px] flex-shrink-0 mt-0.5">error</span>
      <div className="flex flex-col">
      <span className="font-headline-sm text-[15px] leading-tight">Couldn't send report.</span>
      <span className="font-body-sm text-[13px] text-on-secondary/90 mt-0.5">Your report is still here — try again.</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between pt-1">
      <span className="font-label-code text-[11px] text-on-secondary/80">Ref: {errorRef}</span>
      <button type="button" className="px-3.5 py-1.5 rounded-lg bg-on-secondary text-secondary font-label-button text-[13px] active:scale-95 transition-transform font-bold" onClick={() => onResend?.()}>
                    Try again
                  </button>
      </div>
      </div>

      <div className="p-space-sm rounded-lg bg-surface-container-low flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
      <span className="font-body-sm text-[12px] text-on-surface-variant font-medium">
                  Duplicate prevention active — retry never sends twice.
                </span>
      </div>

      <div className="rounded-xl bg-surface-container p-space-md flex flex-col gap-2">
      <div className="flex items-center justify-between">
      <span className="font-label-status text-[12px] text-on-surface-variant uppercase">Preserved Draft Payload</span>
      <span className="font-label-code text-[12px] text-on-surface font-semibold">{vehiclePlate}</span>
      </div>
      <div className="flex items-center gap-3 py-1">
      <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[20px]">build</span>
      </div>
      <div className="flex flex-col">
      <span className="font-headline-sm text-[15px] text-on-surface">{draftItem}</span>
      <span className="font-body-sm text-[13px] text-secondary font-semibold">Marked: {draftIssue}</span>
      </div>
      </div>
      <div className="p-2.5 rounded-lg bg-surface-container-lowest text-on-surface-variant font-body-sm text-[13px]">
                  {draftNote}
                </div>
      </div>

      <div className="flex gap-2 pt-2">
      <button type="button" className="flex-1 h-[52px] rounded-xl bg-surface-container-high text-on-surface font-label-button text-label-button flex items-center justify-center active:scale-[0.98] transition-transform" onClick={() => {}}>
                  Edit note
                </button>
      <button type="button" className="flex-[1.5] h-[52px] rounded-xl bg-primary text-on-primary font-label-button text-label-button flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-transform" onClick={() => onResend?.()}>
      <span className="material-symbols-outlined text-[18px]">send</span>
                  Resend now
                </button>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
