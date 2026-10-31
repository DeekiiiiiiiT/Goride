import type { ReactNode } from "react";
import type { FleetCar } from "../CarStep";
import type { Fp7ViewModel } from "../findPartsViewModels";

export type Fp7FormState = {
  qty: number;
  note: string;
  vehicle: string;
  workOrder: string;
  targetPrice: string;
  urgency: string;
  sent: string;
  cars: FleetCar[];
};

export type Fp7Actions = {
  onClose: () => void;
  onDone: () => void;
  onViewActivity: () => void;
  onDecQty: () => void;
  onIncQty: () => void;
  onQtyChange: (qty: number) => void;
  onNoteChange: (note: string) => void;
  onVehicleChange: (vehicleId: string) => void;
  onWorkOrderChange: (value: string) => void;
  onTargetPriceChange: (value: string) => void;
  onUrgency: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function Fp7Screen({ actions, data, form }: { actions: Fp7Actions; data: Fp7ViewModel; form: Fp7FormState }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="max-w-[1440px] mx-auto px-margin-desktop py-space-xl"><div className="flex flex-col w-full relative">

<div className="w-full flex flex-col gap-space-lg select-none opacity-40 pointer-events-none filter blur-[1.5px] transition-all">

<div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
<div className="flex items-center gap-space-sm font-label-code text-caption text-on-surface-variant">
<span>FLEET OPS</span>
<span>/</span>
<span>VEHICLE OPERATIONS</span>
<span>/</span>
<span className="text-on-surface font-semibold">PARTS CATALOGUE</span>
<span>/</span>
<span className="px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface font-label-plate text-caption">{data.plate}</span>
</div>
<div className="flex items-center gap-space-sm">
<div className="px-space-md py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm flex items-center gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
<span>{data.partName} {data.partNumber}</span>
</div>
<div className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-body-sm flex items-center gap-space-xs">
<span className="material-symbols-outlined text-[18px]">add</span>
<span>New Requisition</span>
</div>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-4 gap-space-md">
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
<div>
<div className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Active Inventory</div>
<div className="font-headline-lg text-headline-lg font-semibold mt-1">1,408</div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">{data.hubLabel} Hub Central</div>
</div>
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined">inventory_2</span>
</div>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
<div>
<div className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Stock Deficits</div>
<div className="font-headline-lg text-headline-lg font-semibold text-error mt-1">14</div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">Critical replacements</div>
</div>
<div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-on-error-container">
<span className="material-symbols-outlined">warning</span>
</div>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
<div>
<div className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Open RFQs</div>
<div className="font-headline-lg text-headline-lg font-semibold mt-1">7</div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">{data.pendingRepliesLabel}</div>
</div>
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined">request_quote</span>
</div>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
<div>
<div className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Avg Lead Time</div>
<div className="font-headline-lg text-headline-lg font-semibold mt-1">18 hrs</div>
<div className="font-label-code text-caption text-on-surface-variant mt-0.5">Urban Corridor delivery</div>
</div>
<div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined">bolt</span>
</div>
</div>
</div>

<div className="flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<span className="font-headline-sm text-headline-sm">Search Results</span>
<span className="px-space-sm py-0.5 rounded-full bg-surface-container-high font-label-code text-caption">3 matching suppliers</span>
</div>
<div className="flex items-center gap-space-sm text-on-surface-variant font-body-sm">
<span>{data.sortLabel}</span>
<span className="material-symbols-outlined text-[16px]">expand_more</span>
</div>
</div>

<div className="grid grid-cols-1 gap-space-sm">
{data.suppliers.map((supplier, index) => (
<div key={supplier.id} className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md relative overflow-hidden">
<div className={`absolute left-0 top-0 bottom-0 w-1.5 ${index === 0 ? "bg-primary" : "bg-secondary"}`}></div>
<div className="flex items-center gap-space-lg pl-space-xs flex-1">
<div>
<div className="flex items-center gap-space-sm">
<span className="font-label-code text-body-sm font-semibold text-primary">{supplier.name}</span>
</div>
<div className="font-headline-sm text-body-lg font-medium text-on-surface mt-0.5">{data.partName}</div>
<div className="font-body-sm text-on-surface-variant mt-1 flex items-center gap-space-md">
<span>Direct compatibility: {data.vehicleLabel} ({data.plate})</span>
<span>•</span>
<span>{supplier.meta}</span>
</div>
</div>
</div>
<div className="flex items-center gap-space-xl">
<div className="text-right">
<div className="font-label-price text-headline-sm text-on-surface">{supplier.priceLabel}</div>
<div className="font-caption text-caption text-on-surface-variant">Landed inc. GCT</div>
</div>
<button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm font-medium" onClick={actions.onSend}>Request Quote</button>
</div>
</div>
))}
</div>
</div>
</div>

<div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity"></div>

<div className="fixed inset-0 z-50 flex items-center justify-center p-space-md sm:p-space-lg overflow-y-auto pointer-events-auto">
<div className="w-full max-w-[520px] rounded-xl bg-surface-container-lowest shadow-2xl p-space-lg sm:p-6 my-auto flex flex-col gap-space-lg relative transition-all duration-200" id="quoteModalWrapper">

<div className="flex items-start justify-between gap-space-md">
<div className="flex flex-col">
<div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant uppercase tracking-wider mb-1">
<span className="material-symbols-outlined text-[15px]">send_time_extension</span>
<span>RFQ DISPATCH · PO-2024-884</span>
</div>
<h2 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">Request a quote</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
            Suppliers will be notified immediately. Quotes appear in Your parts activity.
          </p>
</div>
<button aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors flex items-center justify-center text-on-surface shrink-0" id="modalCloseBtn" type="button" onClick={actions.onClose}>
<span className="material-symbols-outlined text-[20px]">close</span>
</button>
</div>

<div className="rounded-lg bg-surface-container-low p-space-md flex items-start gap-space-md">
<div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center shadow-sm shrink-0">
<span className="material-symbols-outlined text-[22px] text-primary">filter_alt</span>
</div>
<div className="flex flex-col min-w-0 flex-1">
<div className="flex items-center gap-space-xs flex-wrap">
<span className="font-label-code text-body-sm font-semibold text-on-surface">{data.partNumber}</span>
<span className="text-on-surface-variant">•</span>
<span className="font-body-sm text-body-sm font-medium text-on-surface">Oil filter</span>
</div>
<div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 flex items-center gap-1.5 flex-wrap">
<span>For {data.vehicleLabel}</span>
<span>·</span>
<span className="font-label-plate text-caption px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface font-bold tracking-wider">{data.plate}</span>
<span>({data.trimLabel || "None yet"})</span>
</div>
<div className="font-caption text-caption text-on-surface-variant mt-1.5 flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">storefront</span>
<span className="truncate">Supplier target: {data.hubLabel} verified suppliers</span>
</div>
</div>
</div>

<form className="flex flex-col gap-space-md" id="quoteRequestForm">

<div className="flex flex-col gap-1.5">
<label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
<span>Quantity needed</span>
<span className="font-label-code text-caption text-on-surface-variant">MIN: 1 · MAX: 24</span>
</label>
<div className="flex items-center gap-space-md">
<div className="inline-flex items-center bg-surface-container-low rounded-lg p-1">
<button aria-label="Decrease quantity" className="w-8 h-8 rounded-md bg-surface-container-lowest hover:bg-surface-variant text-on-surface font-label-code text-body-md font-bold flex items-center justify-center transition-colors shadow-sm active:scale-95" id="qtyDecBtn" type="button" onClick={actions.onDecQty}>
<span className="material-symbols-outlined text-[18px]">remove</span>
</button>
<input className="w-14 text-center bg-transparent font-label-code text-body-lg font-bold text-on-surface focus:outline-none" id="qtyInput" type="number" min={1} max={24} value={form.qty} onChange={(e) => actions.onQtyChange(Number(e.target.value) || 1)} />
<button aria-label="Increase quantity" className="w-8 h-8 rounded-md bg-surface-container-lowest hover:bg-surface-variant text-on-surface font-label-code text-body-md font-bold flex items-center justify-center transition-colors shadow-sm active:scale-95" id="qtyIncBtn" type="button" onClick={actions.onIncQty}>
<span className="material-symbols-outlined text-[18px]">add</span>
</button>
</div>
<div className="flex items-center gap-1.5 font-caption text-caption text-on-surface-variant">
<span className="material-symbols-outlined text-[15px] text-primary">warehouse</span>
<span>Current shelf balance: <strong className="font-semibold text-on-surface font-label-code">{data.shelfBalance}</strong> in {data.hubLabel} hub.</span>
</div>
</div>
</div>

<div className="flex flex-col gap-1.5">
<label className="font-body-sm text-body-sm font-semibold text-on-surface">Urgency level</label>
<div className="grid grid-cols-3 gap-space-xs p-1 rounded-lg bg-surface-container-low font-body-sm text-body-sm">
<button className="urgency-pill py-2 px-space-xs rounded-md text-center text-on-surface-variant hover:text-on-surface font-medium transition-all" type="button" onClick={() => actions.onUrgency("low")}>
              Low
            </button>
<button className="urgency-pill py-2 px-space-xs rounded-md text-center bg-surface-container-lowest text-on-surface font-semibold shadow-sm transition-all" type="button" onClick={() => actions.onUrgency("normal")}>
              Normal
            </button>
<button className="urgency-pill py-2 px-space-xs rounded-md text-center text-on-surface-variant hover:text-on-surface font-medium transition-all relative flex items-center justify-center gap-1" type="button" onClick={() => actions.onUrgency("urgent")}>
<span>Urgent</span>
<span className="px-1.5 py-0.2 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-caption text-[10px] font-bold">24h</span>
</button>
</div>
<div className="font-caption text-caption text-on-surface-variant flex items-center gap-1" id="urgencyNotice">
<span className="material-symbols-outlined text-[14px]">schedule</span>
<span>Standard dispatch window (24–48 hours reply target)</span>
</div>
</div>

<div className="flex flex-col gap-1.5">
<label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between" htmlFor="vehicleSelect">
<span>Assign to vehicle</span>
<span className="font-caption text-caption text-on-surface-variant">Work order (optional)</span>
</label>
<div className="relative">
<select className="w-full h-10 px-space-md pr-10 rounded-lg bg-surface-container-low text-on-surface font-body-sm appearance-none focus:outline-none focus:bg-surface-container transition-colors cursor-pointer" id="vehicleSelect" value={form.vehicle} onChange={(e) => actions.onVehicleChange(e.target.value)}>
{form.cars.map((row) => (
<option key={row.vehicleId} value={row.vehicleId}>{[row.year, row.make, row.model].filter(Boolean).join(" ")} · {row.licensePlate || row.vehicleId}</option>
))}
<option value="STOCK">Not for a specific car (Fleet stock order)</option>
</select>
<span className="material-symbols-outlined absolute right-3 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">unfold_more</span>
</div>
<input className="mt-2 w-full h-10 px-space-md rounded-lg bg-surface-container-low text-on-surface font-body-sm" type="text" placeholder="Work order reference" value={form.workOrder} onChange={(e) => actions.onWorkOrderChange(e.target.value)} />
</div>

<div className="flex flex-col gap-1.5">
<label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between" htmlFor="orderNote">
<span>Note <span className="font-caption text-caption text-on-surface-variant font-normal">(optional)</span></span>
<span className="font-label-code text-caption text-on-surface-variant" id="charCount">{form.note.length}/140</span>
</label>
<textarea className="w-full p-space-md rounded-lg bg-surface-container-low text-on-surface font-body-sm resize-none focus:outline-none focus:bg-surface-container transition-colors leading-relaxed" id="orderNote" maxLength={140} placeholder="e.g. Need before Friday's service, or specify preferred brand." rows={2} value={form.note} onChange={(e) => actions.onNoteChange(e.target.value)} />
</div>

<div className="flex items-center justify-between gap-space-md pt-space-xs mt-space-xs">
<button className="px-space-lg py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm font-medium transition-colors" id="cancelBtn" type="button" onClick={actions.onCancel}>
            Cancel
          </button>
<button className="px-space-xl py-2.5 rounded-lg bg-primary hover:bg-surface-tint active:scale-95 text-on-primary font-body-sm font-semibold transition-all shadow-md flex items-center gap-space-sm" id="sendQuoteBtn" type="button" onClick={actions.onSend}>
<span>Send request</span>
<span className="material-symbols-outlined text-[18px]">send</span>
</button>
</div>
</form>

<div className="hidden absolute inset-0 bg-surface-container-lowest rounded-xl p-space-xl flex-col items-center justify-center text-center gap-space-md z-20 transition-all" id="successPanel">
<div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface shadow-sm">
<span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
</div>
<div className="flex flex-col gap-1 max-w-sm">
<div className="font-label-code text-caption text-on-surface-variant uppercase tracking-wider">STATUS: TRANSMITTED</div>
<h3 className="font-headline-lg text-headline-lg font-bold text-on-surface">Quote requested</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-snug">
            We'll show the supplier replies in <span className="font-semibold text-on-surface">Your parts activity</span>. Notifications routed to {data.hubLabel} hub.
          </p>
</div>
<div className="w-full max-w-xs p-space-md rounded-lg bg-surface-container-low text-left font-label-code text-caption flex flex-col gap-1 my-1">
<div className="flex justify-between text-on-surface-variant">
<span>REQUISITION:</span>
<span className="text-on-surface font-semibold">{data.quoteRef}</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>QUANTITY:</span>
<span className="text-on-surface font-semibold" id="confirmedQty">{data.shelfBalance}</span>
</div>
<div className="flex justify-between text-on-surface-variant">
<span>ASSIGNED TO:</span>
<span className="text-on-surface font-semibold" id="confirmedVehicle">{data.plate}</span>
</div>
</div>
<div className="flex items-center gap-space-md w-full max-w-xs mt-2">
<button className="flex-1 py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm font-semibold transition-colors" id="doneBtn" type="button" onClick={actions.onDone}>
            Done
          </button>
<button className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-body-sm font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm" id="viewActivityBtn" type="button" onClick={actions.onViewActivity}>
<span>Activity</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
</div>
</div>
</div>
</div>
</div></div>
    </div>
  );
}
