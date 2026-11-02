/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useState } from 'react';

const ISSUE_OPTIONS = ['Damaged', 'Missing', 'Not working'] as const;
import type { DriverCarKitPayload } from '../../../services/driverInventoryApi';
import { carKitVehicleLabel } from '../carKitDisplay';

export function Dk2ReportSheet({ kit, onClose, onSend }: { kit?: DriverCarKitPayload | null; onClose?: () => void; onSend?: () => void }) {
  const vehicleLabel = carKitVehicleLabel(kit);
  const [reportNotes, setReportNotes] = useState('');
  const [issueType, setIssueType] = useState<(typeof ISSUE_OPTIONS)[number]>('Not working');
  const [hasPhoto, setHasPhoto] = useState(true);
  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div aria-hidden="true" className="px-gutter py-space-md opacity-40 pointer-events-none select-none">
      <div className="bg-white border border-slate-200 rounded-xl p-space-md mb-space-md shadow-sm">
      <div className="flex items-center justify-between mb-space-xs">
      <span className="font-headline-sm text-headline-sm text-slate-900 font-bold">Weekly Car Kit</span>
      <span className="font-label-code text-label-code text-emerald-700 bg-emerald-100 font-bold px-space-xs py-0.5 rounded">4/5 Ready</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full bg-emerald-600 rounded-full w-4/5"></div>
      </div>
      </div>
      <div className="flex flex-col gap-space-sm">
      <div className="bg-white border border-slate-200 p-space-md rounded-xl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-emerald-600">tire_repair</span>
      <span className="font-body-md text-body-md text-slate-800 font-medium">Jack & Spare Tire</span>
      </div>
      <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      </div>
      <div className="bg-white border border-slate-200 p-space-md rounded-xl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-emerald-600">medical_services</span>
      <span className="font-body-md text-body-md text-slate-800 font-medium">First Aid Box</span>
      </div>
      <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      </div>
      <div className="bg-white border border-rose-300 p-space-md rounded-xl flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-emerald-600">videocam</span>
      <span className="font-body-md text-body-md text-slate-800 font-medium">Dash Camera</span>
      </div>
      <span className="material-symbols-outlined text-rose-600">error</span>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300" id="modalBackdrop"></div>

      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[92vh] bg-white rounded-t-[28px] shadow-2xl transition-transform duration-300 ease-out transform translate-y-0 overflow-hidden border-t border-slate-200" id="bottomSheet">

      <div className="w-full flex items-center justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none" id="sheetHandle">
      <div className="w-12 h-1.5 rounded-full bg-slate-300"></div>
      </div>

      <div className="px-gutter pt-2 pb-3 flex items-start justify-between flex-shrink-0 border-b border-slate-100">
      <div className="flex flex-col min-w-0 pr-space-xs">
      <h2 className="font-headline-md text-[20px] font-bold text-slate-900 tracking-tight leading-tight truncate">Report a problem · Dash camera</h2>
      <div className="flex items-center gap-2 mt-1.5">
      <span className="inline-flex items-center gap-1 font-label-code text-[12px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
      <span className="material-symbols-outlined text-[14px] text-slate-500">directions_car</span>
      {vehicleLabel}
      </span>
      </div>
      </div>
      <button type="button" aria-label="Close dialog" className="w-10 h-10 -mr-1 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors flex-shrink-0" id="closeModalBtn" onClick={() => onClose?.()}>
      <span className="material-symbols-outlined text-[22px]">close</span>
      </button>
      </div>

      <div className="px-gutter py-4 flex-1 overflow-y-auto space-y-5 overscroll-contain">

      <div>
      <label className="block font-body-sm text-sm font-bold text-slate-900 mb-2">
                  Select issue type <span className="text-rose-600">*</span>
      </label>
      <div aria-label="Issue type" className="grid grid-cols-3 gap-2" role="radiogroup">

      <button type="button" aria-checked="false" className="issue-chip h-12 min-h-[48px] px-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-1.5 transition-all hover:bg-slate-100 active:scale-[0.98]" data-option="Damaged" role="radio" type="button" onClick={() => setIssueType('Damaged')}>
      <span className="material-symbols-outlined text-[18px] text-slate-500">broken_image</span>
      <span className="truncate">Damaged</span>
      </button>

      <button type="button" aria-checked="false" className="issue-chip h-12 min-h-[48px] px-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-1.5 transition-all hover:bg-slate-100 active:scale-[0.98]" data-option="Missing" role="radio" type="button" onClick={() => setIssueType('Missing')}>
      <span className="material-symbols-outlined text-[18px] text-slate-500">inventory_2</span>
      <span className="truncate">Missing</span>
      </button>

      <button type="button" aria-checked="true" className="issue-chip h-12 min-h-[48px] px-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm ring-1 ring-emerald-600/20 active:scale-[0.98]" data-option="Not working" role="radio" type="button" onClick={() => setIssueType('Not working')}>
      <span className="material-symbols-outlined text-[18px] text-emerald-600 font-bold">check</span>
      <span className="truncate">Not working</span>
      </button>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-body-sm text-sm font-bold text-slate-900">
                Photo proof
              </label>
      <div className="relative w-full rounded-2xl border-2 border-dashed border-emerald-400/80 bg-slate-50/70 p-3 sm:p-4">
      <div className="flex items-center gap-3.5">

      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex-shrink-0 bg-slate-900">
      <img alt="Car dashcam with damaged cable and cracked screen" className="w-full h-full object-cover" data-alt="High contrast outdoor photo of a car dashboard camera with a shattered lens glass and detached power socket, shot in bright direct tropical sunlight." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBl0fMCbF-zIjYjFl9YXxXXmr3QkvqHQAIa2o7xtbrRIJqCHyhMjaKu6xN2lQxMcIYGwFiwnOiVVq2QRxpMrN1XcWSWO9vIf6FRMbWXMYD_T9M1mmhOI5GSiW6Swb_AhYBU2aHA15pkSQfsqngoASvPiPXlwK46dEUdH2sFnF5A-1dVgsrsHG05gB5avRlADmIE8_E_leOeadc-oB1a5PRFRIZ-rTVGmzfhebNm130"/>

      <div className="absolute bottom-1 left-1 bg-slate-900/85 text-white p-1 rounded-md flex items-center justify-center">
      <span className="material-symbols-outlined text-[13px]">photo_camera</span>
      </div>

      <button type="button" aria-label="Remove attached photo" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors shadow-sm" type="button" onClick={() => setHasPhoto(false)}>
      <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
      </div>

      <div className="flex flex-col justify-center min-w-0">
      <div className="inline-flex items-center gap-1.5 text-emerald-700 font-bold text-sm">
      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      <span>dashcam_proof.jpg</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5">Attached just now · 1.4 MB</p>
      <button type="button" className="mt-2 inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 text-xs font-semibold hover:underline w-fit" onClick={() => setHasPhoto(true)}>
      <span className="material-symbols-outlined text-[15px]">autorenew</span>
                    Replace photo
                  </button>
      </div>
      </div>
      </div>

      <p className="text-xs text-slate-500 font-medium flex items-center gap-1 pl-0.5">
      <span className="material-symbols-outlined text-[15px] text-emerald-600">verified</span>
                A photo helps the fleet fix it faster.
              </p>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-body-sm text-sm font-bold text-slate-900" htmlFor="reportNotes">
                What happened? <span className="font-normal text-slate-500">(optional)</span>
      </label>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-600 focus-within:border-emerald-600 transition-all">
      <textarea className="w-full bg-transparent font-body-md text-sm sm:text-base text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none" id="reportNotes" placeholder="e.g. Screen flickers when the car starts" rows={3} value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} />
      </div>
      </div>

      <div className="bg-slate-100 border border-slate-200/80 p-3.5 rounded-xl flex items-start gap-2.5">
      <span className="material-symbols-outlined text-emerald-700 text-[20px] flex-shrink-0 mt-0.5">info</span>
      <p className="font-body-sm text-xs sm:text-sm text-slate-600 leading-snug">
                A report alerts the fleet manager to review. It doesn't change your weekly checklist until reviewed.
              </p>
      </div>

      <div className="pt-2 space-y-2.5 pb-2">

      <button type="button" className="w-full h-[52px] min-h-[50px] rounded-xl bg-emerald-600 text-white font-label-button text-base font-semibold shadow-md hover:bg-emerald-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2" id="submitReportBtn" type="button" onClick={() => onSend?.()}>
      <span className="material-symbols-outlined text-[20px]">send</span>
      <span>Send report</span>
      </button>

      <div className="flex items-center justify-between px-1 pt-1">
      <span className="text-xs text-slate-500 font-medium">Demo button states</span>
      <button type="button" className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline" id="toggleStateBtn" type="button" onClick={() => {}}>
                  Simulate "Sending" state
                </button>
      </div>

      <div className="hidden p-2.5 rounded-xl bg-slate-100 border border-slate-200 transition-all" id="sendingStateDemoBox">
      <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5 font-medium">
      <span>Sending State (Preview)</span>
      <span className="text-[11px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Disabled</span>
      </div>
      <button type="button" aria-disabled="true" className="w-full h-[50px] rounded-xl bg-emerald-600/70 text-white/90 font-semibold text-sm flex items-center justify-center gap-2 cursor-not-allowed shadow-inner" disabled="" type="button">
      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      <span>Sending report... (cannot be tapped twice)</span>
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
