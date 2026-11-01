/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapApprovalDrawer(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="ApprovalDrawer">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full filter blur-[1px] opacity-40 pointer-events-none select-none transition-all">

        <div className="flex items-center justify-between mb-space-lg">
        <div className="flex items-center gap-space-md">
        <span className="font-headline-lg text-headline-lg text-on-surface">Asset Alerts & Variances</span>
        <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high font-label-code text-label-code text-on-surface-variant">7 pending reviews</span>
        </div>
        <div className="flex items-center gap-space-sm">
        <div className="h-9 px-space-md bg-surface-container rounded-lg flex items-center gap-space-sm text-body-sm font-body-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">filter_list</span>
        <span>Filter: Discrepancies > J$ 5,000</span>
        </div>
        <div className="h-9 px-space-md bg-primary text-on-primary rounded-lg flex items-center gap-space-sm font-body-sm text-body-sm font-semibold">
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>New Reconciliation</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-space-xl">
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-lg text-caption font-caption text-on-surface-variant uppercase tracking-wider">
        <span className="w-24">Reference</span>
        <span className="w-36">Timestamp</span>
        <span className="w-48">Scope & Item</span>
        <span className="w-32">Type</span>
        <span className="w-36 text-right">Impact Value</span>
        <span className="w-36">Status</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">Depot: Kingston Yard #01</span>
        </div>
        <div className="divide-y divide-surface-container-low">
        <div className="px-space-lg py-space-md flex items-center justify-between bg-surface-container-low/40">
        <div className="flex items-center gap-space-lg text-body-sm font-body-sm text-on-surface">
        <span className="w-24 font-label-code text-label-code text-on-surface-variant">WO-0003</span>
        <span className="w-36 font-label-code text-label-code text-on-surface-variant">01 Nov 08:20</span>
        <span className="w-48 font-semibold truncate">AST-0001 (Dashcam)</span>
        <span className="w-32">Write-off</span>
        <span className="w-36 text-right font-label-price text-label-price text-error">-J$ 45,998.85</span>
        <span className="w-36 flex items-center gap-1.5 text-on-tertiary-container"><span className="w-2 h-2 rounded-full bg-on-tertiary-container"></span>In Review</span>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
        </div>
        <div className="px-space-lg py-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-lg text-body-sm font-body-sm text-on-surface">
        <span className="w-24 font-label-code text-label-code text-on-surface-variant">CNT-1142</span>
        <span className="w-36 font-label-code text-label-code text-on-surface-variant">31 Oct 16:45</span>
        <span className="w-48 truncate">Main Store Bin C-12</span>
        <span className="w-32">Count Diff</span>
        <span className="w-36 text-right font-label-price text-label-price text-error">-J$ 960.00</span>
        <span className="w-36 flex items-center gap-1.5 text-secondary"><span className="w-2 h-2 rounded-full bg-secondary"></span>Pending Count</span>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
        </div>
        <div className="px-space-lg py-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-lg text-body-sm font-body-sm text-on-surface">
        <span className="w-24 font-label-code text-label-code text-on-surface-variant">ADJ-0904</span>
        <span className="w-36 font-label-code text-label-code text-on-surface-variant">30 Oct 11:15</span>
        <span className="w-48 truncate">Hydraulic Jack 3T</span>
        <span className="w-32">Adjustment</span>
        <span className="w-36 text-right font-label-price text-label-price text-on-surface">+J$ 12,400.00</span>
        <span className="w-36 flex items-center gap-1.5 text-secondary"><span className="w-2 h-2 rounded-full bg-secondary"></span>Authorized</span>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
        </div>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 top-28 left-64 bg-inverse-surface/30 backdrop-blur-[2px] z-50 flex justify-end transition-opacity duration-300" id="drawerBackdrop">

        <div className="w-[640px] max-w-full h-full bg-surface-container-lowest shadow-2xl flex flex-col z-50 overflow-hidden transform transition-transform duration-300" id="mainSlideDrawer">

        <div className="px-space-xl py-space-lg bg-surface-container-lowest flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-space-md">
        <div className="w-8 h-8 rounded-lg bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
        </div>
        <div>
        <div className="flex items-center gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Approval needed · Write-off</h2>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-caption font-caption font-semibold">
        <span className="material-symbols-outlined text-[13px] text-on-tertiary-container animate-spin" style="animation-duration: 4s;">schedule</span>
                        Needs approval
                      </span>
        </div>
        <p className="font-caption text-caption text-on-surface-variant mt-0.5">Asset Registry · Write-off Request Reference #WO-0003</p>
        </div>
        </div>
        <button type="button" aria-label="Close drawer" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" type="button">
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>

        <div className="flex-1 overflow-y-auto px-space-xl py-space-md flex flex-col gap-space-lg">

        <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm shadow-sm">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
        <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary font-label-code text-caption flex items-center justify-center font-bold">DT</div>
        <div>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Requested by Deeki T</span>
        <span className="text-caption font-caption text-on-surface-variant ml-1.5">· 1 Nov 2026, 08:20 AM EST</span>
        </div>
        </div>
        <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-caption font-label-code text-on-surface-variant font-medium">DEPOT-KINGSTON-01</span>
        </div>
        <div className="p-space-sm rounded-lg bg-tertiary-fixed/30 flex items-start gap-space-sm text-caption font-caption text-on-tertiary-fixed-variant leading-relaxed">
        <span className="material-symbols-outlined text-[16px] text-on-tertiary-container mt-0.5 flex-shrink-0">gavel</span>
        <span><strong className="font-semibold text-on-surface">Rule:</strong> Write-offs over <strong className="font-label-code text-on-surface">J$ 5,000.00</strong> require secondary authorization from an independent fleet manager or admin. The creator cannot approve their own submission.</span>
        </div>

        <div className="pt-space-xs">
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold block mb-1.5">Variant Schema Preview</span>
        <div className="grid grid-cols-4 gap-1 p-1 bg-surface-container-high/60 rounded-lg text-center font-body-sm text-body-sm">
        <button type="button" className="py-1 px-2 rounded bg-surface-container-lowest font-semibold text-on-surface shadow-sm transition-all flex items-center justify-center gap-1" type="button">
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
        <span>Write-off</span>
        </button>
        <button type="button" className="py-1 px-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-all" type="button">Adjustment</button>
        <button type="button" className="py-1 px-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-all" type="button">Count diff</button>
        <button type="button" className="py-1 px-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-all" type="button">Purchase Order</button>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-on-tertiary-container"></div>
        <div className="flex items-start justify-between">
        <div>
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Asset Identification</span>
        <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">Dash camera AST-0001</h3>
        <p className="font-label-code text-label-code text-on-surface-variant">SN: DC70-88412118 · Rev B5 Dual-Lens</p>
        </div>
        <div className="text-right">
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold block">Book Value (Loss)</span>
        <span className="font-label-price text-[20px] leading-6 font-bold text-error">J$ 45,998.85</span>
        <span className="text-caption font-caption text-on-surface-variant block mt-0.5">Quantity: 1 each</span>
        </div>
        </div>
        <div className="grid grid-cols-2 gap-space-md pt-space-xs">
        <div className="p-space-sm bg-surface-container-low rounded-lg">
        <span className="text-caption font-caption text-on-surface-variant block mb-1">Current Assigned Location</span>
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
        <span>Vehicle — 5179KZ</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant ml-6">Toyota Roomy 2019 (Fleet Van)</span>
        </div>
        <div className="p-space-sm bg-surface-container-low rounded-lg">
        <span className="text-caption font-caption text-on-surface-variant block mb-1">Taxonomy Classification</span>
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-error">
        <span className="material-symbols-outlined text-[18px]">report_problem</span>
        <span>Damaged beyond repair</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant ml-6">Category: Hardware Catastrophic</span>
        </div>
        </div>

        <div className="p-space-md bg-surface-container-low/70 rounded-lg flex flex-col gap-1">
        <div className="flex items-center justify-between text-caption font-caption">
        <span className="font-semibold text-on-surface uppercase tracking-wider">Requester Memo & Field Telemetry</span>
        <span className="text-on-surface-variant">Inspector: Damion C. (Lead Tech)</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                      "Internal sensor board cracked following windscreen impact on Spanish Town Rd. Camera no longer boots or pairs with telemetry node. Inspected by Lead Tech Damion C. Capacitor leakage verified on optical sub-array."
                    </p>
        </div>

        <div>
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold block mb-2">Attached Proof & Docket Reports (2 files)</span>
        <div className="grid grid-cols-2 gap-space-md">
        <div className="group relative rounded-lg overflow-hidden bg-surface-container-high h-28 shadow-sm cursor-pointer">
        <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Close up detailed macro photograph of a broken vehicular dash camera lens with severe radial spiderweb glass fractures and crushed plastic casing, industrial garage lighting on steel workbench, muted slate tones" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCaWQPdT15UF7DzinutHUg-qjULpnFnwCnOFP_h_r7qYTHrCuKn9TBjp1X3ZVXJ69gS0A7eYhJwvtOd1LVKHhmnpYha2roVxu4pm1zi0VxYfAFQBNGYcm9W0llm_YFii16EGcE_bIZkO7buA5Ac4dpOowsQAIP4QBX6iRIiXAu5llsMjeyqeWUOx6e7OzR_SCgzFf-vrLQpr7gVC7oYsXcRyyiVzcsyGLuoI__EUZ8"/>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent flex items-end p-2">
        <div className="flex items-center justify-between w-full text-on-primary">
        <span className="text-caption font-label-code text-[10px] truncate">IMG_8829_LENS_FRACTURE.HEIC</span>
        <span className="material-symbols-outlined text-[14px]">zoom_in</span>
        </div>
        </div>
        </div>
        <div className="group relative rounded-lg overflow-hidden bg-surface-container-high h-28 shadow-sm cursor-pointer">
        <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Scanned technical inspection worksheet docket with mechanical diagnostic diagrams, stamped by maintenance department with red inspection seal, clean crisp technical documentary aesthetic" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAFI8PI9LzKB8m-MsIOV8i_1cdWNwCBAJcr-pKfXl1cUlxHNa5wOFAO78wk_E5sbWPjPTBqU87kiAx_VPVbGTBCQKUNeIaMKUq7ZAQ7YRGgfwbh-AuFZBJPrIsPqli0QPsb5qEX2f2xVNqNzNv2XWi8UDOAXgBkfz-x-llIzbq9LpyJOzULw0201qt_DBUaR0t1LbsFru0nabcGFZPSkvTNf0DReTevyMJ8DEy7WNY"/>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent flex items-end p-2">
        <div className="flex items-center justify-between w-full text-on-primary">
        <span className="text-caption font-label-code text-[10px] truncate">DOC_KGN_DOCKET_441.PDF</span>
        <span className="material-symbols-outlined text-[14px]">description</span>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm shadow-sm">
        <div className="flex items-center gap-space-sm text-caption font-caption uppercase tracking-wider font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-on-surface">account_tree</span>
        <span>Ledger & Operational Impact (If Authorized)</span>
        </div>
        <div className="space-y-2 text-body-sm font-body-sm text-on-surface-variant pl-1">
        <div className="flex items-start gap-2">
        <span className="text-primary font-bold leading-none mt-1">•</span>
        <span><strong className="text-on-surface font-label-code">AST-0001</strong> lifecycle status moves irreversibly from <span className="px-1.5 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface">Installed</span> to <span className="px-1.5 py-0.5 rounded bg-error-container font-label-code text-caption text-on-error-container">Disposed / Scrapped</span>.</span>
        </div>
        <div className="flex items-start gap-2">
        <span className="text-primary font-bold leading-none mt-1">•</span>
        <span>Total fleet storeroom book value decreases by <strong className="font-label-price text-on-surface">J$ 45,998.85</strong> in Kingston Yard depot ledger.</span>
        </div>
        <div className="flex items-start gap-2">
        <span className="text-primary font-bold leading-none mt-1">•</span>
        <span>Recorded as permanent immutable write-off entry <strong className="text-on-surface font-label-code">WO-0003</strong> in Central Movements journal.</span>
        </div>
        <div className="flex items-start gap-2">
        <span className="text-primary font-bold leading-none mt-1">•</span>
        <span><strong className="text-on-surface font-label-code">5179KZ</strong> vehicle kit checklist flagged: <span className="text-error font-medium">Dash camera missing</span> (overall telemetry kit completeness drops to 60%).</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm">
        <div className="flex items-center justify-between mb-2">
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center gap-1">
        <span className="material-symbols-outlined text-[15px]">compare_arrows</span>
                      Cross-Variant Sample (Count Audit Context)
                    </span>
        <span className="text-caption font-label-code text-caption text-on-surface-variant">Ref: CNT-1142</span>
        </div>
        <div className="p-space-sm rounded-lg bg-surface-container-low text-caption font-caption text-on-surface-variant space-y-1">
        <p className="text-body-sm font-body-sm text-on-surface font-medium">Main store Kingston count audit variance preview:</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-label-code text-caption text-on-surface">
        <span>Lug wrench <strong className="text-error">(−2 · −J$ 5,610.00)</strong></span>
        <span>·</span>
        <span>Tyre pump <strong className="text-on-surface font-semibold">(+1 · +J$ 6,500.00)</strong></span>
        <span>·</span>
        <span>Oil filter <strong className="text-error">(−1 · −J$ 1,850.00)</strong></span>
        </div>
        <div className="pt-1 flex items-center justify-between text-body-sm font-body-sm">
        <span className="text-on-surface-variant">Audit Net Variance:</span>
        <span className="font-label-price text-label-price text-error font-bold">−J$ 960.00</span>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container-high/80 text-on-surface flex items-start gap-space-md shadow-sm">
        <span className="material-symbols-outlined text-[24px] text-on-surface-variant mt-0.5">lock</span>
        <div className="flex flex-col gap-0.5">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Self-Approval Governance Lock Engaged</span>
        <p className="text-caption font-caption text-on-surface-variant leading-relaxed">
                      You created this request (<strong className="text-on-surface">Deeki T</strong>). In compliance with internal asset audit protocols, approval must be granted by another supervisor with <code className="px-1 py-0.5 rounded bg-surface-container text-caption font-label-code text-on-surface">fleet_manager</code> or <code className="px-1 py-0.5 rounded bg-surface-container text-caption font-label-code text-on-surface">admin</code> credentials. Decision buttons below are disabled in your active session.
                    </p>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-space-sm opacity-90">
        <div className="flex items-center justify-between">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface font-semibold" htmlFor="rejectReason">Reviewer Justification</label>
        <span className="text-caption font-caption text-error font-medium">Mandatory if rejecting</span>
        </div>
        <textarea className="w-full p-space-sm rounded-lg bg-surface-container text-body-sm font-body-sm text-on-surface-variant placeholder:text-outline cursor-not-allowed resize-none" disabled="" id="rejectReason" placeholder="Provide clear operational reason if rejecting this request..." rows="2"></textarea>
        <div className="flex items-center gap-space-md pt-space-xs">
        <button type="button" className="flex-1 py-2.5 px-space-md rounded-lg bg-surface-container-low text-outline font-body-sm text-body-sm font-semibold cursor-not-allowed flex items-center justify-center gap-space-xs" disabled="" type="button">
        <span className="material-symbols-outlined text-[18px]">cancel</span>
        <span>Reject write-off</span>
        </button>
        <button type="button" className="flex-1 py-2.5 px-space-md rounded-lg bg-surface-container-high text-outline font-body-sm text-body-sm font-semibold cursor-not-allowed flex items-center justify-center gap-space-xs" disabled="" type="button">
        <span className="material-symbols-outlined text-[18px]">check_circle</span>
        <span>Approve write-off</span>
        </button>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-md bg-surface-container-low flex-shrink-0 flex items-center justify-between text-caption font-caption text-on-surface-variant">
        <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="material-symbols-outlined text-[15px] text-on-surface flex-shrink-0">history</span>
        <span className="truncate">
                    Requested <strong className="text-on-surface font-label-code">08:20 AM</strong> (Deeki T) · <span className="text-on-tertiary-container font-semibold">Waiting for 2nd Approver</span> · Approved by — · Rejected by —
                  </span>
        </div>
        <div className="flex items-center gap-1 text-on-surface font-label-code text-caption flex-shrink-0 pl-2">
        <span>SLA:</span>
        <span>< 24h</span>
        </div>
        </div>
        </div>
        </div>
        </div></div><aside className="fixed left-0 top-28 bottom-0 w-64 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex flex-col justify-between py-space-lg"><div className="flex flex-col gap-space-xs px-space-md"><div className="px-space-md py-space-xs text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Inventory & Asset Scope</div><nav className="flex flex-col gap-1" data-active-classes="bg-surface-container text-on-surface font-semibold"><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="inventory-catalog" href="#"><span className="material-symbols-outlined text-[20px]">category</span>Inventory Stock</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="parts-fitment-crossref" href="#"><span className="material-symbols-outlined text-[20px]">manufacturing</span>Fitment & Compatibility</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="work-orders-repairs" href="#"><span className="material-symbols-outlined text-[20px]">build</span>Work Orders</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="asset-depreciation-tracker" href="#"><span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>Asset Valuation</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="procurement-suppliers" href="#"><span className="material-symbols-outlined text-[20px]">storefront</span>Suppliers & POs</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="telemetry-diagnostics" href="#"><span className="material-symbols-outlined text-[20px]">sensors</span>Diagnostic Logs</a></nav></div><div className="px-space-lg pt-space-md"><div className="p-space-md rounded-lg bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="flex items-center justify-between text-caption font-caption text-on-surface-variant mb-1"><span>Active Depot Stock</span><span className="font-label-code text-label-code text-on-surface font-semibold">84.6%</span></div><div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full bg-primary rounded-full w-[84.6%]"></div></div><div className="mt-space-xs text-caption font-caption text-on-surface-variant">Warehouse A & Yard Kingston</div></div></div></aside>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
