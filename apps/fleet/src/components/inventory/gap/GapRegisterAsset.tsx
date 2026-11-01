/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapRegisterAsset(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="RegisterAsset">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full filter blur-[2px] opacity-40 select-none pointer-events-none pb-12">
        <div className="flex items-center justify-between mb-space-lg">
        <div>
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Kingston Depot · Asset Registry</span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">Serialized Equipment & High-Value Assets</h1>
        </div>
        <div className="flex gap-space-sm">
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container-high text-on-surface text-body-sm font-body-sm">Export Ledger</button>
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary text-body-sm font-body-sm flex items-center gap-1">
        <span className="material-symbols-outlined text-[18px]">add</span> Register asset
                </button>
        </div>
        </div>
        <div className="grid grid-cols-4 gap-space-md mb-space-lg">
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-1">
        <span className="text-caption font-caption text-on-surface-variant uppercase">Tracked Assets</span>
        <span className="font-headline-xl text-headline-xl text-on-surface font-label-code">142</span>
        <span className="text-caption font-caption text-on-surface-variant">Active telemetry devices</span>
        </div>
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-1">
        <span className="text-caption font-caption text-on-surface-variant uppercase">Book Value</span>
        <span className="font-headline-xl text-headline-xl text-on-surface font-label-price">J$ 6.84M</span>
        <span className="text-caption font-caption text-on-surface-variant">Depreciated valuation</span>
        </div>
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-1">
        <span className="text-caption font-caption text-on-surface-variant uppercase">In Depot Storage</span>
        <span className="font-headline-xl text-headline-xl text-on-surface font-label-code">38</span>
        <span className="text-caption font-caption text-on-surface-variant">Ready for deployment</span>
        </div>
        <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-1">
        <span className="text-caption font-caption text-on-surface-variant uppercase">Due Inspection</span>
        <span className="font-headline-xl text-headline-xl text-on-surface font-label-code">7</span>
        <span className="text-caption font-caption text-error">Requires check within 14d</span>
        </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden p-space-lg">
        <div className="flex justify-between items-center pb-space-md">
        <span className="font-headline-sm text-headline-sm">Active Serial Registry</span>
        <div className="h-8 w-64 bg-surface-container-low rounded-lg"></div>
        </div>
        <div className="space-y-3">
        <div className="h-10 bg-surface-container-low rounded"></div>
        <div className="h-10 bg-surface-container rounded"></div>
        <div className="h-10 bg-surface-container-low rounded"></div>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/40 backdrop-blur-sm overflow-y-auto">

        <div className="relative w-full max-w-[768px] bg-surface-container-lowest rounded-xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">

        <div className="px-space-xl pt-space-xl pb-space-lg flex items-start justify-between bg-surface-container-lowest">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="px-2 py-0.5 rounded bg-surface-container text-caption font-caption text-on-surface-variant uppercase tracking-wider font-semibold">Hardware Intake</span>
        <span className="text-caption font-caption text-on-surface-variant font-label-code">AST-REG-FORM</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface mt-1">Register asset</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Track one expensive device by its serial number.</p>
        </div>
        <button type="button" aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors" type="button">
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>

        <form className="px-space-xl py-space-sm flex flex-col gap-space-xl max-h-[calc(88vh-140px)] overflow-y-auto" onsubmit="event.preventDefault()">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-xl">

        <div className="flex flex-col gap-space-lg">

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Catalog Item</span>
        <span className="text-caption font-caption text-on-tertiary-container lowercase font-normal">serial-tracked</span>
        </label>
        <div className="relative">
        <select className="w-full h-10 px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm cursor-pointer">
        <option selected="">Dash camera — Dual-Lens 1080p Telematics</option>
        <option>GPS Tracker — Queclink GV300 CAN</option>
        <option>OBD-II Bluetooth Gateway — Teltonika FMB003</option>
        <option>Rugged Driver Tablet — Samsung Active4 Pro 10.1"</option>
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant pointer-events-none">unfold_more</span>
        </div>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Asset Tag</span>
        <span className="text-caption font-caption text-on-surface-variant">Sequence assigned</span>
        </label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-code text-label-code text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" type="text" value="AST-0002"/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">tag</span>
        </div>
        <p className="text-caption font-caption text-on-surface-variant">Auto-generated tag sequence</p>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Serial Number <span className="text-error">*</span></span>
        <span className="inline-flex items-center gap-1 text-caption font-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-label-code">
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                          Checked · Valid serial
                        </span>
        </label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-code text-label-code text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm font-semibold tracking-wide" required="" type="text" value="DC70-88412118"/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">qr_code_scanner</span>
        </div>
        </div>

        <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5">verified_user</span>
        <div className="flex flex-col text-caption font-caption">
        <span className="font-semibold text-on-surface">Duplicate protection active</span>
        <span>If entered serial exists, system triggers alert: <span className="font-label-code text-error bg-error-container/30 px-1 py-0.5 rounded">"This serial is already registered as AST-0001 on 5179KZ"</span> and halts submission.</span>
        </div>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>IMEI / Cellular ID</span>
        <span className="text-caption font-caption text-on-surface-variant">Optional</span>
        </label>
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-code text-label-code text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" placeholder="e.g. 864209041234567" type="text"/>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Purchase Cost</label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-price text-label-price text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm font-bold" type="text" value="J$ 45,998.85"/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">receipt_long</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">Landed cost incl. GCT (General Consumption Tax)</span>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Verification Documents</label>
        <div className="p-space-lg rounded-xl bg-surface-container-low/70 hover:bg-surface-container-low transition-colors cursor-pointer flex flex-col items-center justify-center text-center group">
        <div className="w-10 h-10 rounded-full bg-surface-container-lowest flex items-center justify-center mb-1 group-hover:scale-105 transition-transform shadow-sm">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">cloud_upload</span>
        </div>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Add receipt or photo</span>
        <span className="text-caption font-caption text-on-surface-variant max-w-[220px] mt-0.5">Drop inspection photo, warranty PDF, or intake packing invoice</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-lg">

        <div className="flex flex-col gap-space-sm">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Where is it now</label>
        <div className="space-y-2">

        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-2">
        <label className="flex items-center gap-space-sm cursor-pointer">
        <input checked="" className="w-4 h-4 text-primary accent-primary cursor-pointer" name="asset_location" type="radio"/>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">In store — Main store — Kingston</span>
        </label>
        <div className="pl-6 flex items-center gap-space-sm">
        <span className="text-caption font-caption text-on-surface-variant whitespace-nowrap">Storage Bin:</span>
        <div className="relative w-full">
        <select className="w-full h-8 px-2.5 pr-7 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-body-sm appearance-none focus:outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer">
        <option selected="">Bin A-04 (High-value telematics rack)</option>
        <option>Bin A-05 (Sensors & LoRa nodes)</option>
        <option>Bin B-01 (In-transit staging shelf)</option>
        <option>Bin C-02 (Secure electronics lockbox)</option>
        </select>
        <span className="material-symbols-outlined absolute right-2 top-2 text-[14px] text-on-surface-variant pointer-events-none">expand_more</span>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container-low/50 hover:bg-surface-container-low transition-colors flex items-center gap-space-sm cursor-pointer">
        <input className="w-4 h-4 text-primary accent-primary cursor-pointer" name="asset_location" type="radio"/>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm text-on-surface">Installed on vehicle</span>
        <span className="text-caption font-caption text-on-surface-variant font-label-plate">5179KZ · Toyota Roomy (2019)</span>
        </div>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-2 gap-space-md">
        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Warranty ends</label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" type="text" value="1 Nov 2027"/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">calendar_today</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">12 months from purchase</span>
        </div>
        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Next inspection</label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" type="text" value="1 Feb 2027"/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">event_repeat</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">every 90 days</span>
        </div>
        </div>

        <div className="rounded-xl bg-surface-container-low overflow-hidden">
        <button type="button" className="w-full px-space-md py-2.5 flex items-center justify-between text-left hover:bg-surface-container transition-colors" onclick="const p = this.nextElementSibling; p.classList.toggle('hidden'); const ic = this.querySelector('.chevron-icon'); ic.classList.toggle('rotate-90');" type="button">
        <div className="flex items-center gap-1.5 font-body-sm text-body-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] transition-transform duration-150 rotate-90 chevron-icon">chevron_right</span>
        <span>Connected device & telemetry</span>
        <span className="text-caption font-caption text-on-surface-variant font-normal">(Optional)</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-caption font-caption font-label-code text-on-surface">3 fields active</span>
        </button>
        <div className="px-space-md pb-space-md pt-1 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-body-sm">
        <span className="text-caption font-caption text-on-surface-variant">Provider</span>
        <input className="w-48 h-8 px-2.5 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary" type="text" value="70mai / Roam Telematics"/>
        </div>
        <div className="flex items-center justify-between text-body-sm">
        <span className="text-caption font-caption text-on-surface-variant">Device ID</span>
        <input className="w-48 h-8 px-2.5 rounded bg-surface-container-lowest font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-semibold" type="text" value="DEV-70M-9912"/>
        </div>
        <div className="flex items-center justify-between text-body-sm">
        <span className="text-caption font-caption text-on-surface-variant">Firmware</span>
        <input className="w-48 h-8 px-2.5 rounded bg-surface-container-lowest font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" type="text" value="v2.14.0-carib"/>
        </div>
        </div>
        </div>

        <div className="rounded-xl bg-surface-container-low overflow-hidden">
        <button type="button" className="w-full px-space-md py-2.5 flex items-center justify-between text-left hover:bg-surface-container transition-colors" onclick="const p = this.nextElementSibling; p.classList.toggle('hidden'); const ic = this.querySelector('.chevron-icon'); ic.classList.toggle('rotate-90');" type="button">
        <div className="flex items-center gap-1.5 font-body-sm text-body-sm font-semibold text-on-surface">
        <span className="material-symbols-outlined text-[18px] transition-transform duration-150 rotate-90 chevron-icon">chevron_right</span>
        <span>Insurance & coverage</span>
        <span className="text-caption font-caption text-on-surface-variant font-normal">(Optional)</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-caption font-caption font-label-code text-on-surface">GG-FLT</span>
        </button>
        <div className="px-space-md pb-space-md pt-1 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-body-sm">
        <span className="text-caption font-caption text-on-surface-variant">Insurer</span>
        <input className="w-48 h-8 px-2.5 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary" type="text" value="Guardian General Jamaica"/>
        </div>
        <div className="flex items-center justify-between text-body-sm">
        <span className="text-caption font-caption text-on-surface-variant">Policy No</span>
        <input className="w-48 h-8 px-2.5 rounded bg-surface-container-lowest font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-semibold" type="text" value="GG-FLT-2026-881"/>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-2">
        <div className="flex items-center justify-between">
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface font-semibold flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history_edu</span>
                      Ledger Impact Preview (What will change)
                    </span>
        <span className="text-caption font-caption text-on-surface-variant font-label-code">TRANSACTION #AST-REG-0002</span>
        </div>
        <ul className="space-y-1.5 text-body-sm font-body-sm text-on-surface-variant pl-1">
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span><span className="font-semibold text-on-surface">Dash camera DC70-88412118</span> is added as <span className="font-label-code text-on-surface font-semibold">AST-0002</span>, In store at Main store (<span className="font-label-code text-on-surface">Bin A-04</span>).</span>
        </li>
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span>Total asset ledger valuation increases by <span className="font-label-price text-on-surface font-semibold">J$ 45,998.85</span>.</span>
        </li>
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span>Logged as immutable transaction <span className="font-label-code text-on-surface font-semibold">AST-REG-0002</span> in Movements ledger.</span>
        </li>
        </ul>
        </div>
        </form>

        <div className="px-space-xl py-space-md bg-surface-container-lowest flex items-center justify-between mt-auto">
        <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors" type="button">
                  Cancel
                </button>
        <div className="flex items-center gap-space-md">
        <span className="text-caption font-caption text-on-surface-variant flex items-center gap-1 hidden sm:inline-flex">
        <span className="material-symbols-outlined text-[14px]">shield</span>
                    Audit signature recorded
                  </span>
        <button type="button" className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-md" type="button">
        <span className="material-symbols-outlined text-[18px]">lock</span>
        <span>Register asset</span>
        </button>
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
