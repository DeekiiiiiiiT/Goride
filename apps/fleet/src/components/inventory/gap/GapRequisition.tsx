/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapRequisition(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Requisition">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl relative">

        <div className="flex flex-col gap-space-sm mb-space-xl">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <a className="flex items-center gap-1 hover:text-on-surface transition-colors" href="#">
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
        <span>Inventory & Assets</span>
        </a>
        <span>/</span>
        <span className="text-on-surface font-semibold">Stock Requisitions</span>
        <span>/</span>
        <span className="font-label-code text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface">HUB-KIN-STORE</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Requisitions & Material Requests</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
                    Internal staging pipeline for fleet drivers, master technicians, and scheduled vehicles before stock release from the Kingston Main Depot.
                  </p>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="bg-surface-container px-space-md py-1.5 rounded flex items-center gap-space-sm">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span className="font-label-code text-caption text-on-surface">Store Queue: Active</span>
        </div>
        <button type="button" className="bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold px-space-lg py-2 rounded shadow-sm flex items-center gap-space-xs transition-all" id="openModalBtn">
        <span className="material-symbols-outlined text-[16px]">add</span>
        <span>New request</span>
        </button>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-xl">
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Queue Allocation</span>
        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">5 Items</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
        <span>2 units pending physical count</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Awaiting Auth</span>
        <span className="material-symbols-outlined text-[18px]">gavel</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">J$ 18,450</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-error">
        <span className="material-symbols-outlined text-[12px] text-error">priority_high</span>
        <span>1 request exceeds driver threshold</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Fulfillment Velocity</span>
        <span className="material-symbols-outlined text-[18px]">timer</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">22.4 min</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span>Req-to-dock cycle time</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Depot Status</span>
        <span className="material-symbols-outlined text-[18px]">warehouse</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-code text-headline-sm text-on-surface font-bold">Bay C · Isle 04</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span>Staging bay load: 40% capacity</span>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden flex flex-col">

        <div className="p-space-lg bg-surface-container-lowest flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">

        <div className="flex items-center gap-1 bg-surface-container p-1 rounded">
        <button type="button" className="px-space-md py-1 rounded bg-surface-container-lowest shadow-sm font-body-sm text-body-sm font-semibold text-on-surface">
                    All requests <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">6</span>
        </button>
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container-lowest/50 font-body-sm text-body-sm text-on-surface-variant transition-colors">
                    Open <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">2</span>
        </button>
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container-lowest/50 font-body-sm text-body-sm text-on-surface-variant transition-colors">
                    Approved <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">1</span>
        </button>
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container-lowest/50 font-body-sm text-body-sm text-on-surface-variant transition-colors">
                    Issued <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">2</span>
        </button>
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container-lowest/50 font-body-sm text-body-sm text-on-surface-variant transition-colors">
                    Rejected <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">1</span>
        </button>
        </div>
        <div className="flex items-center gap-space-sm w-full md:w-auto">
        <div className="relative flex-1 md:w-64">
        <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-on-surface-variant">search</span>
        <input className="w-full bg-surface-container-low pl-8 pr-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:bg-surface-container-lowest transition-all" placeholder="Filter ref, vehicle, or driver..." type="text"/>
        </div>
        <button type="button" className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors">
        <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>
        </div>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-left">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-lg">Ref</th>
        <th className="py-space-md px-space-lg">For (Target)</th>
        <th className="py-space-md px-space-lg">Items Requested</th>
        <th className="py-space-md px-space-lg">Requested By</th>
        <th className="py-space-md px-space-lg">Status</th>
        <th className="py-space-md px-space-lg">Needed By</th>
        <th className="py-space-md px-space-lg text-right">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">

        <tr className="hover:bg-surface-container-lowest/80 transition-colors">
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="font-label-code text-label-code text-on-surface font-semibold">RQ-0004</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">STD-ORD</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
        <div>
        <span className="font-label-plate text-label-plate text-on-surface">5179KZ</span>
        <span className="block font-caption text-caption text-on-surface-variant">Toyota Roomy (2021)</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-lg">
        <div className="text-on-surface font-medium">2 items</div>
        <div className="font-caption text-caption text-on-surface-variant truncate max-w-xs">
                          Warning triangle reflector, Tyre pump heavy-duty
                        </div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="text-on-surface">Marlon Samuels</div>
        <div className="font-caption text-caption text-on-surface-variant">Fleet Driver #814</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-caption text-caption font-semibold bg-tertiary-fixed text-on-tertiary-fixed">
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                          Needs approval
                        </span>
        <span className="block font-caption text-[10px] text-on-surface-variant mt-0.5">Budget limit exceeded</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="text-on-surface font-medium">Tomorrow 07:00 AM</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">Shift start</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap text-right">
        <button type="button" className="px-space-md py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors">
                          Review
                        </button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-lowest/80 transition-colors bg-surface-container-low/30">
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="font-label-code text-label-code text-on-surface font-semibold">RQ-0003</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">EXP-ORD</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
        <div>
        <span className="font-label-plate text-label-plate text-on-surface">1505LM</span>
        <span className="block font-caption text-caption text-on-surface-variant">Honda Fit (2020)</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-lg">
        <div className="text-on-surface font-medium">1 item</div>
        <div className="font-caption text-caption text-on-surface-variant truncate max-w-xs">
                          First-aid kit (fleet-spec vehicle type)
                        </div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="text-on-surface">K. Patterson</div>
        <div className="font-caption text-caption text-on-surface-variant">Store Lead · Main Hub</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-caption text-caption font-semibold bg-surface-container-highest text-on-surface">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          Approved
                        </span>
        <span className="block font-caption text-[10px] text-on-surface-variant mt-0.5">Cleared by Auth #02</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="text-on-surface font-medium">Today 02:00 PM</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">Ready at Dock 1</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap text-right">
        <button type="button" className="px-space-md py-1 rounded bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold transition-colors shadow-sm flex items-center gap-1 ml-auto">
        <span className="material-symbols-outlined text-[14px]">output</span>
        <span>Issue now</span>
        </button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-lowest/80 transition-colors">
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="font-label-code text-label-code text-on-surface font-semibold">RQ-0002</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">TOOL-CK</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
        <div>
        <span className="text-on-surface font-medium">Deeki T</span>
        <span className="block font-caption text-caption text-on-surface-variant">Field Ops Dispatch</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-lg">
        <div className="text-on-surface font-medium">1 item</div>
        <div className="font-caption text-caption text-on-surface-variant truncate max-w-xs">
                          OBD-II Wireless Diagnostic Scanner Pro
                        </div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="text-on-surface">Deeki T</div>
        <div className="font-caption text-caption text-on-surface-variant">Field Ops Specialist</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-caption text-caption font-semibold bg-surface-container-high text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                          Issued
                        </span>
        <span className="block font-caption text-[10px] text-on-surface-variant mt-0.5">Custody logged</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="text-on-surface">28 Oct 2026</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">Dispatched 10:14 AM</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap text-right">
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors">
                          View Movement
                        </button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-lowest/80 transition-colors">
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="font-label-code text-label-code text-on-surface font-semibold">RQ-0001</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">ASSET-ADD</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
        <div>
        <span className="font-label-plate text-label-plate text-on-surface">5179KZ</span>
        <span className="block font-caption text-caption text-on-surface-variant">Toyota Roomy (2021)</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-lg">
        <div className="text-on-surface font-medium">1 item</div>
        <div className="font-caption text-caption text-on-surface-variant truncate max-w-xs">
                          Dual-channel HD Dash Camera GPS Unit
                        </div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="text-on-surface">Marlon Samuels</div>
        <div className="font-caption text-caption text-on-surface-variant">Fleet Driver #814</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-caption text-caption font-semibold bg-error-container text-on-error-container">
        <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                          Rejected
                        </span>
        <span className="block font-caption text-[10px] text-on-surface-variant mt-0.5">Duplicate serial request</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="text-on-surface">25 Oct 2026</span>
        <span className="block font-caption text-[10px] text-on-surface-variant">Closed by Lead</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap text-right">
        <button type="button" className="px-space-md py-1 rounded hover:bg-surface-container text-error font-body-sm text-body-sm font-medium transition-colors">
                          View reason
                        </button>
        </td>
        </tr>
        </tbody>
        </table>
        </div>

        <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md text-on-surface-variant font-caption text-caption">
        <div className="flex items-center gap-space-sm">
        <span>Showing 4 of 6 active requests</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-code">Filter: None</span>
        </div>
        <div className="flex items-center gap-space-xs font-label-code">
        <button type="button" className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" disabled="">Prev</button>
        <span className="px-2 py-1 bg-surface-container-lowest rounded font-bold text-on-surface">01</span>
        <button type="button" className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors">Next</button>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md overflow-y-auto" id="modalBackdrop">
        <div className="w-full max-w-[740px] bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden my-space-lg transition-transform duration-200" id="modalCard">

        <div className="px-space-xl py-space-lg bg-surface-container-low flex items-start justify-between">
        <div>
        <div className="flex items-center gap-space-xs mb-1">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Store Checkout Pipeline</span>
        <span className="text-outline-variant">/</span>
        <span className="font-label-code text-caption text-on-surface">FORM-RQ-NEW</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">New requisition</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      Request parts or accessories for a vehicle or staff member before dispatch from Kingston Main.
                    </p>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container transition-colors" id="closeModalBtn">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <form className="p-space-xl flex flex-col gap-space-lg" id="requisitionForm" onsubmit="event.preventDefault();">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>For (Recipient Target)</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Required</span>
        </label>

        <div className="bg-surface-container p-1 rounded flex gap-1 mb-2">
        <button type="button" className="flex-1 py-1 px-2 rounded bg-surface-container-lowest font-body-sm text-body-sm font-semibold text-on-surface shadow-sm text-center" type="button">
                          Vehicle
                        </button>
        <button type="button" className="flex-1 py-1 px-2 rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors text-center" type="button">
                          Staff member
                        </button>
        </div>

        <div className="relative">
        <select className="w-full bg-surface-container-low px-3 py-2 rounded font-body-md text-body-md text-on-surface outline-none appearance-none cursor-pointer focus:bg-surface-container transition-colors">
        <option selected="" value="5179KZ">Vehicle 5179KZ (Toyota Roomy · Kingston Hub)</option>
        <option value="1505LM">Vehicle 1505LM (Honda Fit · Montego Fleet)</option>
        <option value="8821AB">Vehicle 8821AB (Nissan NV200 · Cargo)</option>
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-on-surface-variant text-[18px]">expand_more</span>
        </div>
        <div className="flex items-center gap-1 font-caption text-caption text-on-surface-variant mt-1">
        <span className="material-symbols-outlined text-[12px]">directions_car</span>
        <span>Assigned to: Marlon Samuels (Primary Driver)</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>Needed by Date & Time</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Jamaica (EST)</span>
        </label>
        <div className="relative mt-8">
        <div className="flex items-center bg-surface-container-low rounded px-3 py-2">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">event</span>
        <input className="w-full bg-transparent font-label-code text-label-code text-on-surface outline-none" type="text" value="2 Nov 2026, 08:00 AM"/>
        </div>
        </div>
        <div className="flex items-center gap-1 font-caption text-caption text-on-surface-variant mt-1">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        <span>Scheduled before morning route departure</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm pt-space-xs">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Items Requested</span>
        <span className="font-caption text-caption text-on-surface-variant">Landed store valuation applies</span>
        </div>
        <div className="bg-surface-container-low rounded overflow-hidden">
        <div className="divide-y divide-surface-container">

        <div className="p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest">
        <div className="flex-1">
        <div className="flex items-center gap-space-xs">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Warning triangle reflector</span>
        <span className="font-label-code text-[11px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">SFT-TRG-01</span>
        </div>
        <div className="flex items-center gap-space-xs mt-1">
        <span className="material-symbols-outlined text-[14px] text-on-surface">check_circle</span>
        <span className="font-caption text-caption text-on-surface">28 in stock at Main store</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-price text-caption text-on-surface-variant">J$ 3,100 landed/ea</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="flex items-center bg-surface-container-low rounded px-2 py-1">
        <span className="font-caption text-caption text-on-surface-variant mr-2">Qty</span>
        <input className="w-12 bg-transparent text-center font-label-code text-label-code font-bold text-on-surface outline-none" max="28" min="1" type="number" value="1"/>
        <span className="font-caption text-caption text-on-surface-variant ml-1">each</span>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-error transition-colors p-1" type="button">
        <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        </div>
        </div>

        <div className="p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest">
        <div className="flex-1">
        <div className="flex items-center gap-space-xs">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Tyre pump heavy-duty 12V</span>
        <span className="font-label-code text-[11px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">ACC-TYP-01</span>
        </div>
        <div className="flex items-center gap-space-xs mt-1">
        <span className="material-symbols-outlined text-[14px] text-on-tertiary-container">warning</span>
        <span className="font-caption text-caption text-on-tertiary-container font-medium">2 in stock at Main store (Low inventory threshold)</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-price text-caption text-on-surface-variant">J$ 8,400 landed/ea</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="flex items-center bg-surface-container-low rounded px-2 py-1">
        <span className="font-caption text-caption text-on-surface-variant mr-2">Qty</span>
        <input className="w-12 bg-transparent text-center font-label-code text-label-code font-bold text-on-surface outline-none" max="2" min="1" type="number" value="1"/>
        <span className="font-caption text-caption text-on-surface-variant ml-1">each</span>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-error transition-colors p-1" type="button">
        <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        </div>
        </div>
        </div>

        <div className="p-space-md bg-surface-container-low flex items-center justify-between">
        <button type="button" className="inline-flex items-center gap-1.5 font-body-sm text-body-sm font-semibold text-on-surface hover:text-on-surface-variant transition-colors" type="button">
        <span className="material-symbols-outlined text-[16px]">add_circle</span>
        <span>+ Add another item</span>
        </button>
        <div className="font-label-price text-caption text-on-surface-variant">
                          Estimated value: <span className="text-on-surface font-bold">J$ 11,500</span>
        </div>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>Reason / Work order context</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Audit Trail Documentation</span>
        </label>
        <textarea className="w-full bg-surface-container-low p-space-md rounded font-body-sm text-body-sm text-on-surface outline-none focus:bg-surface-container transition-colors resize-none" placeholder="Provide reason or reference incident/maintenance report..." rows="3">Replacing damaged triangle from incident report R-0012 and adding required pump for Kingston rideshare compliance.</textarea>
        </div>

        <div className="bg-surface-container-low rounded p-space-md flex items-start gap-space-md">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px] text-on-surface">info</span>
        </div>
        <div className="flex-1 text-on-surface font-body-sm text-body-sm leading-relaxed">
        <span className="font-semibold text-on-surface">What will change: </span>
        <span className="text-on-surface-variant">
                        2 items will be reserved for Vehicle 5179KZ once approved. Nothing leaves the Main store until an authorized storekeeper clicks <span className="font-semibold text-on-surface">Issue now</span>.
                      </span>
        </div>
        </div>

        <div className="pt-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption">
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
        <span>Logged by K. Patterson (Auth #02)</span>
        </div>
        <div className="flex items-center gap-space-md">
        <button type="button" className="px-space-lg py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors" id="cancelModalBtn" type="button">
                        Cancel
                      </button>
        <button type="button" className="px-space-xl py-2 rounded bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold transition-all shadow-sm flex items-center gap-1.5" id="submitRequestBtn" type="button">
        <span className="material-symbols-outlined text-[16px]">send</span>
        <span>Send request</span>
        </button>
        </div>
        </div>
        </form>
        </div>
        </div>
        </div>
        </div>
        </div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
