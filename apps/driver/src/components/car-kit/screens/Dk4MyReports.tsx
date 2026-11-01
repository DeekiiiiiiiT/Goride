/** Ported from Stitch — do not simplify layout (audit §0.4). */
export function Dk4MyReports() {
  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="px-margin pt-space-md pb-space-xs bg-surface flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between">
      <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">My reports</h1>
      <span className="font-body-sm text-[13px] text-on-surface-variant font-medium">(2 open · 4 total)</span>
      </div>
      <p className="font-body-sm text-[13px] text-on-surface-variant">Track status and fleet repairs for vehicle equipment</p>
      </div>

      <div className="px-margin py-space-xs sticky top-16 z-20 bg-surface/95 backdrop-blur-md">
      <div className="grid grid-cols-3 p-1 rounded-xl bg-surface-container gap-1 shadow-sm" role="tablist">
      <button type="button" aria-selected="true" className="filter-tab py-2.5 px-space-xs rounded-lg font-label-button text-[14px] text-center transition-all bg-surface-container-lowest text-on-surface shadow-sm font-semibold" id="tab-all" onclick="filterReports('all')" role="tab" type="button">
              All <span className="text-[12px] opacity-75 font-normal ml-0.5">(4)</span>
      </button>
      <button type="button" aria-selected="false" className="filter-tab py-2.5 px-space-xs rounded-lg font-label-button text-[14px] text-center text-on-surface-variant transition-all hover:text-on-surface font-semibold" id="tab-open" onclick="filterReports('open')" role="tab" type="button">
              Open <span className="text-[12px] opacity-75 font-normal ml-0.5">(2)</span>
      </button>
      <button type="button" aria-selected="false" className="filter-tab py-2.5 px-space-xs rounded-lg font-label-button text-[14px] text-center text-on-surface-variant transition-all hover:text-on-surface font-semibold" id="tab-resolved" onclick="filterReports('resolved')" role="tab" type="button">
              Resolved <span className="text-[12px] opacity-75 font-normal ml-0.5">(2)</span>
      </button>
      </div>
      </div>

      <div className="px-margin pt-space-sm pb-28 flex flex-col gap-space-md" id="reports-container">

      <div className="report-card report-open rounded-xl bg-surface-container-lowest p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-space-sm transition-all cursor-pointer hover:border-amber-400 active:scale-[0.99]" data-status="open" onclick="openReportModal('warning-triangle')">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Warning triangle</span>
      <span className="font-label-code text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded font-medium">EMERG-04</span>
      </div>
      <span className="font-body-sm text-[13px] text-secondary font-semibold mt-0.5 flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">warning</span>
                  Missing
                </span>
      <span className="font-body-sm text-[12px] text-outline mt-0.5">1 Nov 2026 · 08:30 AM</span>
      </div>
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-label-status text-[12px] shrink-0 font-bold">
      <span className="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">hourglass_top</span>
                Reported
              </span>
      </div>

      <div className="p- space-xs p-2.5 rounded-xl bg-surface-container-low flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] font-label-status">
      <span className="text-on-surface-variant font-bold tracking-wide">STATUS: SENT → SEEN</span>
      <span className="text-emerald-700 font-semibold flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">visibility</span> Fleet reviewing
      </span>
      </div>
      <div className="flex items-center justify-between relative px-2 pt-1 pb-0.5">

      <div className="flex flex-col items-center z-10">
      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[12px]">
      <span className="material-symbols-outlined text-[14px] font-bold">check</span>
      </div>
      <span className="font-body-sm text-[11px] text-on-surface font-semibold mt-1">Sent</span>
      <span className="font-label-code text-[10px] text-outline">08:30 AM</span>
      </div>
      <div className="h-0.5 bg-emerald-600 flex-1 mx-1.5 -mt-4"></div>

      <div className="flex flex-col items-center z-10">
      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[12px]">
      <span className="material-symbols-outlined text-[14px] font-bold">visibility</span>
      </div>
      <span className="font-body-sm text-[11px] text-emerald-800 font-bold mt-1">Seen</span>
      <span className="font-label-code text-[10px] text-emerald-700 leading-none">09:10 AM</span>
      </div>
      <div className="h-0.5 bg-surface-container-highest flex-1 mx-1.5 -mt-4"></div>

      <div className="flex flex-col items-center z-10 opacity-60">
      <div className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant text-[12px]">
      <span className="material-symbols-outlined text-[13px]">pending</span>
      </div>
      <span className="font-body-sm text-[11px] text-on-surface-variant font-medium mt-1">Fixed</span>
      <span className="font-label-code text-[10px] text-outline leading-none">—</span>
      </div>
      </div>
      </div>

      <div className="flex items-center justify-between pt-0.5 text-emerald-700 hover:text-emerald-800 font-label-button text-[12px]">
      <span className="flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">photo_camera</span>
      <span>1 photo attached · Empty trunk bracket</span>
      </span>
      <span className="flex items-center font-bold">
      <span>View timeline</span>
      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </span>
      </div>
      </div>

      <div className="report-card report-open rounded-xl bg-surface-container-lowest p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-space-sm transition-all" data-status="open">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Tyre pump</span>
      <span className="font-label-code text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded font-medium">TOOL-09</span>
      </div>
      <span className="font-body-sm text-body-sm text-secondary font-semibold mt-0.5 flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">help_outline</span>
                  Missing
                </span>
      <span className="font-body-sm text-[12px] text-outline mt-0.5">1 Nov 2026 · 07:45 AM</span>
      </div>
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-label-status text-[12px] shrink-0 font-bold">
      <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                Waiting to send
              </span>
      </div>

      <div className="p-space-sm rounded-xl bg-surface-container flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline shrink-0">
      <span className="material-symbols-outlined text-[20px]">cloud_off</span>
      </div>
      <div className="flex flex-col">
      <span className="font-label-button text-[13px] text-on-surface font-bold">Saved locally on device</span>
      <span className="font-body-sm text-[12px] text-on-surface-variant leading-tight mt-0.5">Will send automatically when cellular connection is restored.</span>
      </div>
      </div>
      <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-[12px]">
      <span className="w-2 h-2 rounded-full bg-amber-600"></span>
      <span>Queued in Spanish Town South</span>
      </div>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-button text-[12px] hover:bg-surface-container-high active:scale-95 transition-all font-semibold" type="button">
                Retry now
              </button>
      </div>
      </div>

      <div className="report-card report-resolved rounded-xl bg-surface-container-lowest p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-space-sm transition-all" data-status="resolved">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Dash camera</span>
      <span className="font-label-code text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded font-medium">CAM-2118</span>
      </div>
      <span className="font-body-sm text-[13px] text-on-surface-variant font-medium mt-0.5 flex items-center gap-1">
      <span className="material-symbols-outlined text-[15px]">videocam_off</span>
                  Not working · 12 Mar 2026
                </span>
      <span className="font-body-sm text-[12px] text-outline mt-0.5">Report #RP-8492</span>
      </div>
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 text-white font-label-status text-[12px] shrink-0 font-bold shadow-sm">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Fixed
              </span>
      </div>

      <div className="p-space-sm rounded-xl bg-emerald-50/70 border border-emerald-100 flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[16px]">support_agent</span>
      </div>
      <div className="flex flex-col">
      <span className="font-label-button text-[12px] text-emerald-950 font-bold">Fleet team reply</span>
      <p className="font-body-sm text-[13px] text-emerald-900 leading-snug mt-0.5">
                    “Replaced the power cable. 14 Mar 2026”
                  </p>
      </div>
      </div>

      <div className="flex items-center justify-between border-t border-emerald-200/60 pt-2 text-[11px] text-emerald-800 font-medium">
      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Sent 12 Mar</span>
      <span>→</span>
      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Seen by fleet 13 Mar</span>
      <span>→</span>
      <span className="flex items-center gap-1 font-bold text-emerald-900"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Fixed 14 Mar</span>
      </div>
      </div>
      </div>

      <div className="report-card report-resolved rounded-xl bg-surface-container-lowest p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-space-sm transition-all" data-status="resolved">
      <div className="flex items-start justify-between gap-space-xs">
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Lug wrench</span>
      <span className="font-label-code text-[11px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded font-medium">TOOL-03</span>
      </div>
      <span className="font-body-sm text-[13px] text-on-surface-variant font-medium mt-0.5 flex items-center gap-1">
      <span className="material-symbols-outlined text-[15px]">build</span>
                  Damaged · 12 Oct 2026
                </span>
      <span className="font-body-sm text-[12px] text-outline mt-0.5">Report #RP-7930</span>
      </div>
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 text-white font-label-status text-[12px] shrink-0 font-bold shadow-sm">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Fixed
              </span>
      </div>

      <div className="p-space-sm rounded-xl bg-surface-container-low flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
      </div>
      <div className="flex flex-col">
      <span className="font-label-button text-[12px] text-on-surface font-bold">Exchange completed</span>
      <p className="font-body-sm text-[13px] text-on-surface-variant leading-snug mt-0.5">
                  Replacement heavy-duty telescopic wrench issued at Kingston base inventory bay on 14 Oct 2026.
                </p>
      </div>
      </div>
      </div>

      <div className="hidden p-space-xl rounded-xl bg-surface-container-lowest flex flex-col items-center text-center gap-space-sm shadow-sm" id="empty-state">
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-emerald-600">
      <span className="material-symbols-outlined text-[32px]">task_alt</span>
      </div>
      <div className="flex flex-col">
      <span className="font-headline-sm text-headline-sm text-on-surface">All caught up!</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant max-w-[240px] mt-1">
                No reports found under this view. Everything on your vehicle checklist is verified.
              </span>
      </div>
      </div>
      </div>

      <div className="fixed bottom-20 left-0 right-0 px-margin pointer-events-none z-40">
      <div className="max-w-md mx-auto pointer-events-auto">
      <button type="button" aria-label="Report a problem" className="w-full h-14 bg-[#059669] hover:bg-[#047857] text-white font-label-button text-[16px] rounded-xl shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all" type="button">
      <span className="material-symbols-outlined text-[22px]">add_circle</span>
      <span>Report a problem</span>
      </button>
      </div>
      </div>
      </div>

      <div className="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center p-0 sm:p-4" id="report-modal">
      <div className="bg-surface-container-lowest w-full max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">

      <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between sticky top-0 bg-surface-container-lowest z-10">
      <div className="flex items-center gap-2">
      <span className="font-headline-sm text-[18px] text-on-surface font-bold">Report Details</span>
      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">Reported</span>
      </div>
      <button type="button" aria-label="Close modal" className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors" onclick="closeReportModal()" type="button">
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>

      <div className="p-5 flex flex-col gap-4">

      <div className="flex items-start justify-between">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Warning triangle</h3>
      <p className="font-body-sm text-[13px] text-secondary font-semibold mt-0.5">Missing from trunk spare wheel well</p>
      <span className="font-body-sm text-[12px] text-outline">Reported 1 Nov 2026 · 08:30 AM · ID #RP-9102</span>
      </div>
      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
      <span className="material-symbols-outlined text-[24px]">warning</span>
      </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col gap-3">
      <span className="text-[12px] font-label-status uppercase tracking-wider text-on-surface font-bold flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px] text-emerald-600">linear_scale</span>
                  Full Status Timeline
                </span>
      <div className="flex flex-col gap-3 relative pl-3 before:absolute before:left-[19px] before:top-2 before:bottom-3 before:w-0.5 before:bg-outline-variant/40">

      <div className="flex items-start gap-3 relative z-10">
      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[14px] font-bold">check</span>
      </div>
      <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
      <span className="font-label-button text-[13px] text-on-surface font-bold">Sent</span>
      <span className="text-[11px] text-outline font-label-code">1 Nov, 08:30 AM</span>
      </div>
      <span className="font-body-sm text-[12px] text-on-surface-variant">Report logged from mobile device via Kingston hub network</span>
      </div>
      </div>

      <div className="flex items-start gap-3 relative z-10">
      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
      <span className="material-symbols-outlined text-[14px] font-bold">visibility</span>
      </div>
      <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
      <span className="font-label-button text-[13px] text-emerald-800 font-bold">Seen by fleet</span>
      <span className="text-[11px] text-emerald-700 font-label-code font-bold">1 Nov, 09:10 AM</span>
      </div>
      <span className="font-body-sm text-[12px] text-on-surface-variant">Reviewed by Duty Dispatcher Sarah M. Marked for replenishment.</span>
      </div>
      </div>

      <div className="flex items-start gap-3 relative z-10 opacity-70">
      <div className="w-6 h-6 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center shrink-0 border border-outline-variant/50">
      <span className="material-symbols-outlined text-[13px]">pending</span>
      </div>
      <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
      <span className="font-label-button text-[13px] text-on-surface-variant font-medium">Fixed</span>
      <span className="text-[11px] text-outline font-label-code">Scheduled</span>
      </div>
      <span className="font-body-sm text-[12px] text-on-surface-variant">Replacement kit prepared for handover at Spanish Town base depot.</span>
      </div>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-2">
      <span className="text-[12px] font-label-status uppercase tracking-wider text-outline font-bold">Attached Evidence Photo</span>
      <div className="relative rounded-xl overflow-hidden bg-surface-container border border-outline-variant/30 h-44 flex items-center justify-center group">
      <img alt="Vehicle trunk spare compartment photo showing missing warning triangle slot" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdSemuj3KUZ_ZLzKzy1AAv5seYgn7yDCzJSi60aWZ24tc_MYbvIY1LHITk63T7nFx_vZmsk3M1qGsevwJa-iFtp5Ul8gHDd1RnrASxmGMREc7rJQiy3IU1lSFLaNkybSSZH0eyN0oryF3MpZDRFLrCrSkTlc1YyUDyD5_oWjVKSUHkDql9yNrZ_jI060w9p4BJTmzUMIXOgQ_jH2A-KQuA2FT8QsMxDHYUtsZMGyA"/>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white text-[12px]">
      <span className="font-medium flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">photo_camera</span> IMG_20261101_0829.jpg</span>
      <span className="bg-black/40 px-2 py-0.5 rounded font-label-code text-[11px]">Trunk floor</span>
      </div>
      </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
      <button type="button" className="flex-1 py-3 rounded-xl bg-surface-container text-on-surface font-label-button text-[14px] hover:bg-surface-container-high transition-colors text-center" onclick="closeReportModal()" type="button">
                  Close
                </button>
      <button type="button" className="flex-1 py-3 rounded-xl bg-[#059669] text-white font-label-button text-[14px] hover:bg-[#047857] transition-colors text-center shadow-md flex items-center justify-center gap-1" type="button">
      <span className="material-symbols-outlined text-[16px]">chat</span>
      <span>Message Fleet</span>
      </button>
      </div>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
