/** Ported from Stitch — do not simplify layout (audit §0.4). */
import type { DriverCarKitItem, DriverCarKitPayload } from '../../../services/driverInventoryApi';
import {
  carKitItemCounts,
  carKitProgressOffset,
  carKitSummaryTitle,
  carKitVehicleLabel,
} from '../carKitDisplay';
import { Dk1KitItemRows } from '../Dk1KitItemRows';

export function Dk1MyCarKit({
  kit,
  onReportItem,
  onPreShiftInspection,
  onUpdateStatus,
}: {
  kit?: DriverCarKitPayload | null;
  onReportItem?: (itemName: string | null) => void;
  onPreShiftInspection?: () => void;
  onUpdateStatus?: (item: DriverCarKitItem) => void;
}) {
  const vehicleLabel = carKitVehicleLabel(kit);
  const { present, total, missing, reported } = carKitItemCounts(kit);
  const progressOffset = carKitProgressOffset(present, total);
  const summaryTitle = carKitSummaryTitle(kit);
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
      <div className="flex items-center gap-2">
      {onPreShiftInspection ? (
        <button
          type="button"
          className="font-body-sm text-body-sm font-semibold text-primary underline min-h-[44px] px-2"
          onClick={onPreShiftInspection}
        >
          Pre-shift inspection
        </button>
      ) : null}
      <div className="bg-surface-container-lowest px-space-xs py-0.5 rounded-lg shadow-sm">
      <span className="font-label-code text-label-code text-on-surface uppercase tracking-wider">{vehicleLabel}</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center gap-space-md">

      <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
      <circle className="text-surface-container-high" cx="36" cy="36" fill="transparent" r="30" stroke="currentColor" stroke-width="6"></circle>
      <circle className="text-primary" cx="36" cy="36" fill="transparent" r="30" stroke="currentColor" stroke-dasharray="188.5" stroke-dashoffset={progressOffset} stroke-linecap="round" stroke-width="6"></circle>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <span className="font-label-plate text-label-plate text-on-surface leading-none">{present}<span className="text-on-surface-variant font-body-sm text-body-sm">/{total || '—'}</span></span>
      </div>
      </div>
      <div className="flex flex-col min-w-0">
      <span className="font-headline-sm text-headline-sm text-on-surface leading-tight">{summaryTitle}</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
                  {total > 0
                    ? `Your car has ${present} of ${total} kit items. ${missing + reported} are not in the car — the fleet knows.`
                    : 'No kit items loaded yet.'}
                </p>
      </div>
      </div>
      <div className="bg-surface-container-low rounded-lg px-space-sm py-2 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">{checkInLabel}</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between">
      <span className="font-label-status text-label-status text-on-surface-variant uppercase tracking-wider">Required Inventory</span>
      <span className="font-body-sm text-body-sm font-semibold text-primary">{total > 0 ? `${present}/${total} present` : '—'}</span>
      </div>

      {kit?.items?.length ? (
        <Dk1KitItemRows items={kit.items} onReport={onReportItem} onUpdateStatus={onUpdateStatus} />
      ) : null}

      {kit?.extras?.length ? (
      <div className="flex flex-col gap-space-xs mt-1 px-space-md pb-space-sm">
      <span className="font-label-status text-label-status text-on-surface-variant uppercase tracking-wider px-1">Also in this car</span>
      {kit.extras.map((extra) => (
      <div key={extra.id ?? extra.name} className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 text-on-surface">
      <span className="material-symbols-outlined text-[20px]">layers</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">{extra.name}</span>
      {extra.description ? (
      <span className="font-body-sm text-body-sm text-on-surface-variant">{extra.description}</span>
      ) : null}
      </div>
      </div>
      {extra.badge ? (
      <span className="px-space-xs py-1 rounded-full bg-surface-container text-on-surface font-label-status text-label-status">{extra.badge}</span>
      ) : null}
      </div>
      ))}
      </div>
      ) : null}

      {!kit?.items?.length ? (
      <div className="p-space-md text-center font-body-sm text-on-surface-variant">
      No kit items loaded for this vehicle yet.
      </div>
      ) : null}
      </div>

      <button type="button" onClick={() => onReportItem?.(null)} className="w-full min-h-[52px] bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-button text-label-button rounded-xl flex items-center justify-center gap-2 shadow-sm active:bg-surface-container transition-colors mt-2">
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
    </div>
  );
}
