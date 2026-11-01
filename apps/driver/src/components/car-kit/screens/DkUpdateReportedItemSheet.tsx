/** Ported from Stitch — driver update reported item (audit R16). */
import type { DriverReportRow } from '../../../services/driverInventoryApi';

export function DkUpdateReportedItemSheet({
  report,
  offline,
  onClose,
}: {
  report: DriverReportRow;
  offline?: boolean;
  onClose?: () => void;
}) {
  const urgent = report.issue === 'not_working';
  const fixed = report.status === 'fixed';
  return (
    <div className="driver-car-kit-stitch fixed inset-0 z-[60] flex flex-col justify-end bg-inverse-surface/65">
      <div className="max-h-[92vh] overflow-y-auto rounded-t-2xl bg-surface shadow-xl">
                <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="px-gutter pt-space-xs pb-space-xs flex items-center justify-between gap-space-xs overflow-x-auto bg-surface-container-high/60 no-scrollbar">
        <div className="flex items-center gap-1.5 flex-nowrap">
        <span className="font-label-status text-[11px] uppercase tracking-wider text-on-surface-variant font-bold pr-1">Scenario:</span>
        <button type="button" className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-on-primary shadow-sm whitespace-nowrap transition-all" id="btn-state-main"  type="button">
                Active Update
              </button>
        <button type="button" className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-lowest text-on-surface whitespace-nowrap shadow-sm transition-all" id="btn-state-urgent"  type="button">
                Urgent Safety
              </button>
        <button type="button" className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-lowest text-on-surface whitespace-nowrap shadow-sm transition-all" id="btn-state-offline"  type="button">
                Offline Signal
              </button>
        <button type="button" className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-lowest text-on-surface whitespace-nowrap shadow-sm transition-all" id="btn-state-sent"  type="button">
                Sent Toast
              </button>
        <button type="button" className="px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container-lowest text-on-surface whitespace-nowrap shadow-sm transition-all" id="btn-state-closed"  type="button">
                Fixed (Closed)
              </button>
        </div>
        </div>

        <div className="px-gutter py-space-md opacity-40 pointer-events-none select-none filter blur-[1px]">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-sm">
        <div className="flex items-center justify-between mb-space-xs">
        <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Vehicle Kit Audit</span>
        <span className="font-label-code text-label-code bg-surface-container px-2 py-0.5 rounded">REG 5179KZ</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">4 of 5 verified roadworthy items in trunk & cab</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-sm flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
        <span className="material-symbols-outlined">car_repair</span>
        </div>
        <div>
        <p className="font-headline-sm text-[16px] text-on-surface font-semibold">Hydraulic Jack</p>
        <span className="font-body-sm text-xs text-primary font-bold">In the car</span>
        </div>
        </div>
        <span className="material-symbols-outlined text-primary text-[28px]">check_circle</span>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm mb-space-sm flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
        <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center text-secondary">
        <span className="material-symbols-outlined">warning</span>
        </div>
        <div>
        <p className="font-headline-sm text-[16px] text-on-surface font-semibold">Warning Triangle</p>
        <span className="font-body-sm text-xs text-secondary font-bold">Reported missing</span>
        </div>
        </div>
        <span className="material-symbols-outlined text-secondary text-[28px]">error</span>
        </div>
        </div>

        <div className="fixed inset-0 bg-[#0f172a]/65 z-40 transition-opacity backdrop-blur-[2px]"></div>

        <section aria-labelledby="sheet-title" className="relative z-50 mt-auto bg-surface-container-lowest rounded-t-[28px] shadow-[0_-8px_32px_rgba(15,23,42,0.2)] flex flex-col max-w-full overflow-hidden">

        <div className="pt-3 pb-2 flex justify-center w-full cursor-grab">
        <div className="w-12 h-1.5 bg-outline-variant/70 rounded-full"></div>
        </div>

        <div className="px-gutter pt-1 pb-space-sm flex items-start justify-between">
        <div className="min-w-0 pr-space-xs">
        <div className="flex items-center gap-1.5 mb-0.5">
        <span className="material-symbols-outlined text-tertiary-container text-[20px]" style="font-variation-settings: 'FILL' 1;">warning</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight" id="sheet-title">
                    Update your report
                  </h2>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-on-surface">Warning triangle</span>
        <span>·</span>
        <span>Missing</span>
        <span>·</span>
        <span className="text-outline">Reported 1 Nov 2026</span>
        </p>
        </div>
        <button type="button" aria-label="Close sheet" className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors flex-shrink-0 -mr-1"  type="button">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="px-gutter pb-space-lg flex flex-col gap-space-md max-h-[636px] overflow-y-auto">

        <div className="hidden bg-tertiary-fixed text-on-tertiary-fixed rounded-xl p-space-sm flex items-start gap-space-xs shadow-sm" id="offline-banner">
        <span className="material-symbols-outlined text-tertiary-container text-[22px] flex-shrink-0 mt-0.5">wifi_off</span>
        <div className="min-w-0">
        <p className="font-label-status text-label-status uppercase tracking-wider font-bold">Saved — waiting to send</p>
        <p className="font-body-sm text-body-sm leading-snug mt-0.5">Weak connection detected along Highway 2000. Your update is stored locally and will sync automatically when signal returns.</p>
        </div>
        </div>

        <div className="bg-secondary text-on-secondary rounded-2xl p-space-md shadow-sm flex flex-col gap-space-xs" id="urgent-banner">
        <div className="flex items-start gap-space-xs">
        <div className="w-8 h-8 rounded-full bg-surface-container-lowest/20 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-on-secondary text-[20px]" style="font-variation-settings: 'FILL' 1;">emergency</span>
        </div>
        <div className="min-w-0 flex-1">
        <p className="font-label-button text-[15px] font-bold text-on-secondary leading-snug">
                      Safety item — do not drive without it
                    </p>
        <p className="font-body-sm text-body-sm text-on-secondary/90 leading-tight mt-1">
                      Fleet safety notice applies when configured by your operator.
                    </p>
        </div>
        </div>
        <div className="flex items-center justify-between gap-space-sm pt-space-xs">
        <span className="font-label-code text-label-code text-on-secondary font-bold">876-555-0100</span>
        <a className="min-h-[44px] px-space-md bg-surface-container-lowest text-secondary rounded-lg font-label-button text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all" href="tel:8765550100">
        <span className="material-symbols-outlined text-[18px]">call</span>
                    Call fleet now
                  </a>
        </div>
        </div>

        <div className="hidden bg-primary-fixed text-on-primary-fixed rounded-2xl p-space-md shadow-sm flex items-start gap-space-sm" id="sent-banner">
        <span className="material-symbols-outlined text-primary text-[28px] flex-shrink-0" style="font-variation-settings: 'FILL' 1;">check_circle</span>
        <div className="min-w-0 flex-1">
        <p className="font-label-button text-[16px] text-on-primary-fixed font-bold leading-tight">Update sent to fleet team</p>
        <p className="font-body-sm text-body-sm text-on-primary-fixed-variant mt-0.5">Timeline updated: "You: I found it · Today 08:20 AM"</p>
        <div className="mt-space-xs flex items-center gap-2">
        <span className="font-label-status text-[11px] px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-bold">Ticket #REP-5179</span>
        <span className="font-body-sm text-xs text-on-primary-fixed-variant">Awaiting fleet log closure</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm flex flex-col gap-space-sm bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface-container-low">
        <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
        <span className="bg-tertiary-fixed text-on-tertiary-fixed font-label-status text-label-status px-2.5 py-1 rounded-full flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-tertiary-container animate-pulse"></span>
                      Reported
                    </span>
        <span className="font-body-sm text-xs font-semibold text-on-surface-variant">Sent → Seen by fleet</span>
        </div>
        <span className="font-label-code text-label-code text-xs text-outline font-bold">5179KZ</span>
        </div>

        <div className="bg-surface-container-low rounded-xl p-space-sm flex items-start gap-space-sm">
        <div className="w-8 h-8 rounded-lg bg-primary-fixed-dim/40 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-[18px]">support_agent</span>
        </div>
        <div className="min-w-0">
        <div className="flex items-center justify-between gap-1">
        <p className="font-label-button text-xs font-bold text-primary">Fleet Dispatcher</p>
        <span className="font-body-sm text-[11px] text-outline">2 Nov · 09:10 AM</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface leading-snug mt-0.5">
                      "Replacement warning triangle on courier to Downtown Hub. Call us if you find the original kit under back seats."
                    </p>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm" id="standard-options-container">
        <label className="font-label-status text-label-status uppercase tracking-wider text-on-surface-variant font-bold">
                  What is the current status?
                </label>

        <div aria-checked="false" className="min-h-[56px] cursor-pointer rounded-2xl p-space-md bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-all flex items-start justify-between gap-space-sm" id="card-choice-found"  role="radio" tabIndex="0">
        <div className="flex items-start gap-space-sm min-w-0">
        <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
        <span className="material-symbols-outlined text-[22px]">saved_search</span>
        </div>
        <div className="min-w-0">
        <p className="font-label-button text-[16px] text-on-surface font-semibold">I found it</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug mt-0.5">
                        It's back in the car. The fleet will close the defect report.
                      </p>
        </div>
        </div>
        <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 mt-1" id="radio-dot-found">
        <div className="w-2.5 h-2.5 rounded-full bg-transparent"></div>
        </div>
        </div>

        <div aria-checked="true" className="cursor-pointer rounded-2xl p-space-md bg-primary-fixed/20 shadow-md transition-all flex flex-col gap-space-sm" id="card-choice-replacement"  role="radio" tabIndex="0">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex items-start gap-space-sm min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center flex-shrink-0 shadow-sm">
        <span className="material-symbols-outlined text-[22px]">swap_horiz</span>
        </div>
        <div className="min-w-0">
        <div className="flex items-center gap-2">
        <p className="font-label-button text-[16px] text-primary font-bold">I got a replacement</p>
        <span className="bg-primary text-on-primary font-label-status text-[11px] px-2 py-0.2 rounded-full font-bold">Active</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug mt-0.5">
                          You replaced it yourself. Add a photo of the new one for inspection log.
                        </p>
        </div>
        </div>
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1" id="radio-dot-replacement">
        <span className="material-symbols-outlined text-on-primary text-[16px] font-bold">check</span>
        </div>
        </div>

        <div className="pt-space-xs flex flex-col gap-space-sm" id="replacement-photo-box">
        <div className="p-space-sm bg-surface-container-lowest rounded-xl flex items-center justify-between gap-space-sm shadow-sm">
        <div className="flex items-center gap-space-sm min-w-0">
        <div className="w-[72px] h-[72px] rounded-lg bg-surface-container-high overflow-hidden flex-shrink-0 relative group">
        <img className="w-full h-full object-cover" data-alt="High-contrast close-up smartphone photograph taken in bright Kingston daylight showing a brand-new orange reflective roadside warning triangle in its clear plastic protective carrying case resting on a clean vehicle seat, sharp utilitarian inspection photo." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzLB4TNYU-j9LSW36e4hR2BVzdWHqfzb-NOD4pSw-VxLyeamr2S_Qnjq-F9dn016qJL5gjbc5Os22Oog_IrdkaBuMdzNAkpv6GKxPDaxQRCZQdPSJGlSU64SXtVg32Hon1fDV0wN-d9XZGLrTgI-UvC1DdL-nxK9EdFY-bSF6P1kc3r-QouVAGU3GAXtJ_cNrqVBRKAU0iTsyvSBooPmxesvRncbVrJLDQiXuEkEw"/>
        <div className="absolute bottom-0 inset-x-0 bg-primary/90 text-on-primary text-[10px] font-bold text-center py-0.5">
                            VERIFIED
                          </div>
        </div>
        <div className="min-w-0">
        <div className="flex items-center gap-1 text-primary">
        <span className="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
        <span className="font-label-button text-xs font-bold">Photo attached</span>
        </div>
        <p className="font-label-code text-xs text-on-surface font-semibold truncate mt-0.5">triangle_replacement_01.jpg</p>
        <p className="font-body-sm text-[12px] text-outline">Clear reflective surface verified</p>
        </div>
        </div>
        <button type="button" className="h-10 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-button text-xs font-semibold flex items-center gap-1 flex-shrink-0 active:scale-95 transition-all"  type="button">
        <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                        Retake
                      </button>
        </div>

        <div>
        <label className="font-body-sm text-xs font-semibold text-on-surface-variant block mb-1" htmlFor="source-input">
                        Where did you get it? (optional)
                      </label>
        <input className="w-full h-[48px] px-space-sm rounded-xl bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-sm" id="source-input" placeholder="e.g. Bought at Shell Spanish Town Road" type="text" value="Bought at Shell Spanish Town Road"/>
        </div>
        </div>
        </div>

        <div aria-checked="false" className="min-h-[56px] cursor-pointer rounded-2xl p-space-md bg-surface-container-lowest shadow-sm hover:bg-surface-container-low transition-all flex items-start justify-between gap-space-sm" id="card-choice-missing"  role="radio" tabIndex="0">
        <div className="flex items-start gap-space-sm min-w-0">
        <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
        <span className="material-symbols-outlined text-[22px]">hourglass_empty</span>
        </div>
        <div className="min-w-0">
        <p className="font-label-button text-[16px] text-on-surface font-semibold">Still missing</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug mt-0.5">
                        Remind the fleet it's still not in the vehicle. Keep defect open.
                      </p>
        </div>
        </div>
        <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 mt-1" id="radio-dot-missing">
        <div className="w-2.5 h-2.5 rounded-full bg-transparent"></div>
        </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-space-xs">
        <label className="font-label-status text-label-status uppercase tracking-wider text-on-surface-variant font-bold" htmlFor="driver-notes">
                    Anything else to tell dispatch? (optional)
                  </label>
        <textarea className="w-full p-space-sm rounded-xl bg-surface-container-lowest font-body-sm text-body-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary shadow-sm resize-none" id="driver-notes" placeholder="e.g. Checked trunk side pocket and spare tire compartment, nil found." rows="2"></textarea>
        </div>
        </div>

        <div className="hidden flex-col gap-space-md" id="closed-container">
        <div className="bg-primary-fixed/30 rounded-2xl p-space-md shadow-sm flex flex-col items-center text-center gap-space-xs">
        <div className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center mb-1 shadow-sm">
        <span className="material-symbols-outlined text-[32px]" style="font-variation-settings: 'FILL' 1;">task_alt</span>
        </div>
        <span className="bg-primary text-on-primary font-label-status text-xs px-3 py-1 rounded-full uppercase tracking-wider font-bold">
                    Status: Fixed & Closed
                  </span>
        <h3 className="font-headline-sm text-[20px] font-bold text-on-surface mt-1">This report is officially resolved</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[320px]">
                    Vehicle 5179KZ now has a certified warning triangle on record. Confirmed by Dispatch Supervisor at 10:45 AM.
                  </p>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm flex flex-col gap-space-xs">
        <p className="font-label-button text-sm font-bold text-on-surface">Need to report another kit defect?</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                    If other road items (jack, lug wrench, spare tire) need replacement or repair, open a fresh inspection ticket.
                  </p>
        <button type="button" className="min-h-[48px] mt-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-label-button text-sm font-bold flex items-center justify-center gap-2 transition-all"  type="button">
        <span className="material-symbols-outlined text-[20px]">add_circle</span>
                    Report a different item
                  </button>
        </div>
        </div>
        </div>

        <div className="px-gutter pt-space-xs pb-space-md bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex flex-col gap-space-xs">
        <div className="flex flex-col gap-space-xs" id="action-buttons-active">
        <button type="button" className="w-full min-h-[52px] bg-primary text-on-primary rounded-xl font-label-button text-label-button font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-primary-container active:scale-[0.99] transition-all" id="btn-submit-update"  type="button">
        <span className="material-symbols-outlined text-[20px]">send</span>
                  Send update to fleet
                </button>
        <p className="font-body-sm text-[12px] text-center text-outline leading-tight px-space-xs">
                  Updates alert dispatch immediately. Does not alter official fleet inventory records.
                </p>
        </div>
        <div className="hidden flex-col gap-space-xs" id="action-buttons-closed">
        <button type="button" className="w-full min-h-[52px] bg-surface-container hover:bg-surface-container-high text-on-surface rounded-xl font-label-button text-label-button font-bold flex items-center justify-center gap-2 transition-all"  type="button">
                  Done & return to kit
                </button>
        </div>
        </div>
        </section>


        </div></div>
        {fixed ? (
          <p className="px-margin pb-space-md font-body-sm text-on-surface-variant">This report is closed.</p>
        ) : null}
        {offline ? (
          <p className="px-margin pb-space-md font-body-sm text-amber-800">Offline — updates queue when you reconnect.</p>
        ) : null}
        {urgent && !fixed ? (
          <p className="px-margin pb-space-md font-body-sm text-error">Urgent safety item — fleet has been notified.</p>
        ) : null}
        {onClose ? (
          <button type="button" className="mx-margin mb-space-lg w-[calc(100%-2rem)] rounded-lg bg-primary py-3 font-body-sm text-on-primary" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
