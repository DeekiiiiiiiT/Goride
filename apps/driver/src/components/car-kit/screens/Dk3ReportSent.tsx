/** Ported from Stitch — do not simplify layout (audit §0.4). */
export function Dk3ReportSent() {
  return (
    <div className="driver-car-kit-stitch inventory-stitch-root">
      <div className="inventory-stitch-main">

      <div className="flex flex-col flex-1" id="view-online">

      <div className="flex flex-col items-center text-center my-2">
      <div className="w-20 h-20 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center shadow-sm text-emerald-600 mb-3 animate-[pulse_2.5s_infinite]">
      <span className="material-symbols-outlined text-[44px]" style="font-variation-settings: 'FILL' 1, 'wght' 700;">check_circle</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Report sent</h2>
      <p className="text-slate-500 text-sm mt-1 max-w-xs leading-relaxed">
                The fleet team will look at it. You'll see updates here.
              </p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm my-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
      <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
      <span className="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">done_all</span>
                    Delivered
                  </span>
      </div>
      <span className="font-mono text-xs font-bold text-slate-500 tracking-wide">REF: #RP-8842</span>
      </div>
      <div className="flex items-start gap-3">

      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
      <img alt="Dashcam defect photo" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCmLN44X87tuWazRTrbRJitrq0W6YomuY1fEycUPq1oKTX7Q2WEXFMr-aXK0qutznz46RBUjNOP95i_AdICv2LS7DvNXNZewvxIaMZHZYH1BFIPRd8swnGIhS6Aw58RsybTYpqLs-gWdqj2GCXVEhqhiBGtGB3_-x8v08qP0BuOv38f65v_SyaqiCgBVQXLoIxj_CXfTuWCTmnjVKNKM_uO08hMQ4ZkHDXe9YuotZs"/>
      <div className="absolute bottom-0 inset-x-0 bg-slate-900/60 backdrop-blur-xs py-0.5 text-[9px] text-white text-center font-medium">Photo</div>
      </div>
      <div className="flex flex-col flex-1 min-w-0 justify-center">
      <h3 className="text-base font-bold text-slate-900 truncate">Dash camera</h3>
      <div className="flex items-center gap-1.5 mt-0.5">
      <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
      <span className="text-xs font-semibold text-red-600">Not working</span>
      </div>
      <div className="flex items-center gap-1 text-slate-500 text-xs mt-1.5">
      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
      <span>1 Nov 2026 · 08:20 AM</span>
      </div>
      </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Resolution Progress</div>
      <div className="relative pl-7 space-y-4">

      <div className="absolute left-3 top-2.5 bottom-2.5 w-0.5 bg-slate-200 -translate-x-1/2"></div>

      <div className="relative flex items-start gap-2.5">
      <div className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-4 ring-white shadow-xs">
      <span className="material-symbols-outlined text-[15px]" style="font-variation-settings: 'FILL' 1, 'wght' 700;">check</span>
      </div>
      <div>
      <p className="text-xs font-bold text-slate-900">Sent</p>
      <p className="text-[11px] text-slate-500">Delivered directly to dispatch queue</p>
      </div>
      </div>

      <div className="relative flex items-start gap-2.5">
      <div className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center ring-4 ring-white">
      <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
      </div>
      <div>
      <div className="flex items-center gap-1.5">
      <p className="text-xs font-bold text-slate-900">Seen by fleet</p>
      <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-amber-50 text-amber-700 rounded border border-amber-200">Pending</span>
      </div>
      <p className="text-[11px] text-slate-500">Fleet reviewer notified · typically under 2 hrs</p>
      </div>
      </div>

      <div className="relative flex items-start gap-2.5">
      <div className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center ring-4 ring-white">
      <span className="material-symbols-outlined text-[14px]">build</span>
      </div>
      <div>
      <p className="text-xs font-semibold text-slate-500">Fixed / Restocked</p>
      <p className="text-[11px] text-slate-400">Scheduled for replacement at next service hub</p>
      </div>
      </div>
      </div>
      </div>
      <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5">
      <span className="material-symbols-outlined text-emerald-600 text-[18px] flex-shrink-0 mt-0.5">verified_user</span>
      <p className="text-[11px] leading-relaxed text-slate-600">
      <span className="font-semibold text-slate-800">Zero Driver Liability:</span> This issue is officially logged. You are cleared for shift inspection and won't be charged.
                </p>
      </div>
      </div>

      <div className="mt-auto pt-3 pb-safe">
      <button type="button" className="w-full min-h-[48px] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-base flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]" onclick="window.history.back()">
      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      <span>Back to my kit</span>
      </button>
      </div>
      </div>

      <div className="hidden flex-col flex-1" id="view-offline">

      <div className="flex flex-col items-center text-center my-2">
      <div className="w-20 h-20 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center shadow-sm text-amber-600 mb-3">
      <span className="material-symbols-outlined text-[44px]">schedule</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Saved — waiting to send</h2>
      <p className="text-slate-500 text-sm mt-1 max-w-xs leading-relaxed">
                We'll send it as soon as you're back online.
              </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 my-3 flex items-start gap-3 text-amber-900">
      <span className="material-symbols-outlined text-amber-600 text-[22px] flex-shrink-0 mt-0.5">signal_cellular_connected_no_internet_4_bar</span>
      <div className="text-xs leading-relaxed">
      <p className="font-bold text-amber-900">No cellular connection</p>
      <p className="text-amber-800 mt-0.5">Don't close Roam Driver. The report will safely upload automatically once a stable signal is detected.</p>
      </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col gap-3.5 my-2">
      <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Offline status: Queued locally
                </span>
      <span className="text-xs text-slate-400 font-mono">Item #2 of 2</span>
      </div>
      <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
      <span className="material-symbols-outlined text-[26px]">tire_repair</span>
      </div>
      <div className="flex flex-col min-w-0 flex-1">
      <h3 className="text-base font-bold text-slate-900 truncate">Tyre pump</h3>
      <div className="flex items-center gap-1.5 mt-0.5">
      <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
      <span className="text-xs font-semibold text-red-600">Missing</span>
      <span className="text-slate-300">·</span>
      <span className="text-xs font-medium text-slate-600">Saved on phone</span>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">Stored at 08:22 AM · Ready for sync</p>
      </div>
      </div>
      <div className="pt-2 flex items-center gap-2">
      <button type="button" className="flex-1 min-h-[48px] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98]" id="offline-retry-btn" onclick="triggerRetryAnimation()">
      <span className="material-symbols-outlined text-[18px]" id="offline-retry-icon">sync</span>
      <span id="offline-retry-label">Retry now</span>
      </button>
      <button type="button" className="min-h-[48px] h-12 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold text-sm flex items-center justify-center gap-1 transition" onclick="cancelQueuedReport()">
      <span className="material-symbols-outlined text-[18px]">close</span>
      <span>Dismiss</span>
      </button>
      </div>
      </div>

      <div className="mt-auto pt-3 pb-safe">
      <button type="button" className="w-full min-h-[48px] h-12 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-base flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]" onclick="window.history.back()">
      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      <span>Back to my kit</span>
      </button>
      </div>
      </div>
      </div>
    </div>
  );
}
