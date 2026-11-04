/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useCallback, useState } from 'react';
import type { DriverCarKitPayload } from '../../../services/driverInventoryApi';
import { carKitItemCounts, carKitVehicleLabel } from '../carKitDisplay';

export function Dk5KitStep({
  kit,
  onConfirmAll,
  onReportIssue,
  onClose,
  onReportSelected,
  busy = false,
}: {
  kit?: DriverCarKitPayload | null;
  onConfirmAll?: () => void;
  onReportIssue?: () => void;
  onClose?: () => void;
  onReportSelected?: (itemLabels: string[]) => void;
  busy?: boolean;
}) {
  const vehicleLabel = carKitVehicleLabel(kit);
  const { present, total } = carKitItemCounts(kit);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [selectedFaults, setSelectedFaults] = useState<Set<string>>(() => new Set());

  const toggleFault = useCallback((value: string, checked: boolean) => {
    setSelectedFaults((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }, []);

  const closeIssueModal = useCallback(() => {
    setIssueModalOpen(false);
    onClose?.();
  }, [onClose]);

  const openIssueModal = useCallback(() => {
    setSelectedFaults(new Set());
    setIssueModalOpen(true);
    onReportIssue?.();
  }, [onReportIssue]);

  const reportSelected = useCallback(() => {
    const labels = [...selectedFaults];
    if (!labels.length) return;
    onReportSelected?.(labels);
    setIssueModalOpen(false);
  }, [onReportSelected, selectedFaults]);

  const canReportSelected = selectedFaults.size >= 1;
  const reportDisabledReason = canReportSelected
    ? undefined
    : 'Select at least one kit item with a problem';

  const kitItems = kit?.items ?? [];
  const presentInVehicle = kitItems.filter((item) => item.status === 'present' || item.status === 'linked');
  const missingInVehicle = kitItems.filter((item) => item.status === 'missing');
  const reportedKitItems = kitItems.filter((item) => item.status === 'reported');
  const priorOpenCount = kit?.openReportCount ?? reportedKitItems.length;
  const selectableKitItems = kitItems.filter((item) => item.status !== 'linked' && item.status !== 'reported');

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
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">Present in Vehicle ({presentInVehicle.length} Items)</span>
      <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
      </div>
      <div className="divide-none flex flex-col p-space-xs">
      {presentInVehicle.length === 0 ? (
      <div className="px-space-sm py-space-md text-center font-body-sm text-on-surface-variant">No kit items to verify.</div>
      ) : (
      <>
      {presentInVehicle.map((item) => (
      <div key={item.id ?? item.name} className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
      <span className="material-symbols-outlined text-[20px]">inventory_2</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">{item.name}</span>
      {item.locationHint ? (
      <span className="font-body-sm text-body-sm text-on-surface-variant">{item.locationHint}</span>
      ) : null}
      </div>
      </div>
      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
      </div>
      ))}

      {missingInVehicle.length > 0 ? (
      <>
      <div className="bg-surface-container px-space-md py-space-xs flex items-center justify-between mt-2">
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">Not in vehicle ({missingInVehicle.length})</span>
      <span className="material-symbols-outlined text-error text-[18px]">error</span>
      </div>
      {missingInVehicle.map((item) => (
      <div key={`missing-${item.id ?? item.name}`} className="flex items-center justify-between min-h-[52px] px-space-sm py-2 hover:bg-surface-container-low rounded-lg transition-colors">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-error-container flex items-center justify-center text-error shrink-0">
      <span className="material-symbols-outlined text-[20px]">cancel</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">{item.name}</span>
      {item.locationHint ? (
      <span className="font-body-sm text-body-sm text-on-surface-variant">{item.locationHint}</span>
      ) : null}
      </div>
      </div>
      <span className="font-label-status text-label-status text-error">Missing</span>
      </div>
      ))}
      </>
      ) : null}
      </>
      )}
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm mb-space-lg">
      <div className="bg-surface-container px-space-md py-space-xs flex items-center justify-between">
      <div className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-tertiary text-[18px]">history</span>
      <span className="font-label-code text-label-code text-on-surface-variant uppercase tracking-wider">Prior open reports ({priorOpenCount})</span>
      </div>
      <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">Logged</span>
      </div>
      <div className="flex flex-col p-space-xs opacity-75">
      {reportedKitItems.length === 0 ? (
      <div className="px-space-sm py-space-md font-body-sm text-on-surface-variant">No open reports on this kit.</div>
      ) : (
      reportedKitItems.map((item) => (
      <div key={item.id ?? item.name} className="flex items-center justify-between min-h-[52px] px-space-sm py-2">
      <div className="flex items-center gap-space-sm">
      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-outline shrink-0">
      <span className="material-symbols-outlined text-[20px]">flag</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-medium text-outline line-through">{item.name}</span>
      {item.locationHint ? (
      <span className="font-body-sm text-body-sm text-outline">{item.locationHint}</span>
      ) : null}
      </div>
      </div>
      <span className="bg-surface-container text-outline px-space-xs py-1 rounded-full font-label-status text-label-status flex items-center gap-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                Already reported
              </span>
      </div>
      ))
      )}
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
        onClick={() => openIssueModal()}
      >
      <span className="material-symbols-outlined text-secondary text-[22px]">error_outline</span>
      <span>No — something's missing or broken</span>
      </button>
      </div>

      <div className={`fixed inset-0 z-50 bg-inverse-surface/65 ${issueModalOpen ? 'flex' : 'hidden'} flex-col justify-end backdrop-blur-[2px]`} id="issue-modal">
      <div className={`w-full max-w-md mx-auto bg-surface-container-lowest rounded-t-2xl shadow-2xl flex flex-col max-h-[751px] overflow-hidden transform ${issueModalOpen ? 'translate-y-0' : 'translate-y-full'} transition-transform duration-300`} id="modal-panel">

      <div className="p-space-md pb-space-xs flex flex-col bg-surface-container-low">
      <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mb-space-xs"></div>
      <div className="flex items-center justify-between">
      <div className="flex flex-col">
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Select items with a problem</h3>
      <span className="font-body-sm text-body-sm text-on-surface-variant">Check all that are missing or damaged</span>
      </div>
      <button type="button" aria-label="Close dialog" className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors" id="btn-close-modal" onClick={() => closeIssueModal()}>
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      </div>

      <div className="overflow-y-auto px-space-md py-space-sm flex flex-col gap-1.5 flex-1">
      <div className="text-xs font-label-code text-on-surface-variant uppercase tracking-wider py-1">Active Kit Items</div>

      {selectableKitItems.length === 0 ? (
      <p className="font-body-sm text-body-sm text-on-surface-variant px-space-sm py-2">No kit items available to flag.</p>
      ) : (
      selectableKitItems.map((item) => {
        const value = item.name;
        return (
      <label key={item.id ?? item.name} className="flex items-center justify-between min-h-[52px] px-space-sm py-2 rounded-xl bg-surface hover:bg-surface-container-low cursor-pointer transition-colors">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">inventory_2</span>
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">{item.name}</span>
      {item.locationHint ? (
      <span className="font-body-sm text-body-sm text-on-surface-variant">{item.locationHint}</span>
      ) : null}
      </div>
      </div>
      <input className="w-6 h-6 rounded-md accent-primary cursor-pointer" name="kit_fault" type="checkbox" value={value} checked={selectedFaults.has(value)} onChange={(e) => toggleFault(value, e.target.checked)}/>
      </label>
        );
      })
      )}

      <div className="text-xs font-label-code text-outline uppercase tracking-wider pt-space-xs pb-1">Already Reported (Locked)</div>
      {reportedKitItems.length === 0 ? (
      <p className="font-body-sm text-body-sm text-outline px-space-sm py-1">No items locked from prior reports.</p>
      ) : (
      reportedKitItems.map((item) => (
      <div key={item.id ?? item.name} className="flex items-center justify-between min-h-[48px] px-space-sm py-2 rounded-xl bg-surface-container/60 opacity-60">
      <span className="font-body-sm text-body-sm text-outline">{item.name}</span>
      <span className="font-label-code text-xs text-outline bg-surface-container-high px-2 py-0.5 rounded">SKIPPED</span>
      </div>
      ))
      )}
      </div>

      <div className="p-space-md bg-surface-container-low flex flex-col gap-space-xs">
      <button
        type="button"
        className="w-full h-[52px] bg-secondary active:bg-secondary-container text-on-secondary rounded-xl flex items-center justify-center gap-space-xs font-label-button text-label-button shadow-md disabled:opacity-40 disabled:pointer-events-none transition-all"
        disabled={!canReportSelected}
        title={reportDisabledReason}
        id="btn-proceed-faults"
        onClick={() => reportSelected()}
      >
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
