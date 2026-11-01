/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapVendorEditor(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="VendorEditor">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">

        <div className="relative w-full overflow-hidden bg-surface pb-16">
        <div className="max-w-[1440px] mx-auto px-margin-desktop pt-8">

        <div className="flex items-center justify-between pb-4">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors group" href="#">
        <span className="material-symbols-outlined text-[16px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span>Purchasing</span>
        <span className="text-outline-variant">/</span>
        <span className="text-on-surface font-medium">Vendors & Suppliers</span>
        </a>

        <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-1 rounded text-on-surface-variant font-label-code text-caption">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
        <span>Hub Kingston-01 · Procurement Protocol v4.2</span>
        </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg pb-6">
        <div>
        <div className="flex items-center gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Vendors & Suppliers</h1>
        <span className="bg-surface-container-high px-2 py-0.5 rounded text-on-surface font-label-code text-caption font-semibold">12 Registered</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">Approved parts vendors, service shops, and logistics partners for Kingston Hub operations.</p>
        </div>

        <div className="flex items-center gap-space-sm">
        <button type="button" className="inline-flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-body-sm text-body-sm shadow-sm transition-colors" type="button">
        <span className="material-symbols-outlined text-[18px]">file_download</span>
        <span>Export Registry</span>
        </button>
        <button type="button" className="inline-flex items-center gap-space-xs px-space-lg py-2 rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-semibold shadow-sm transition-all active:scale-95" id="open-drawer-btn" type="button">
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>New vendor</span>
        </button>
        </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-6">
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
        <div>
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">Active Accounts</span>
        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">9</span>
        </div>
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">storefront</span>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
        <div>
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">Live Open POs</span>
        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">4</span>
        </div>
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">receipt_long</span>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
        <div>
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">Avg Lead Window</span>
        <span className="font-headline-sm text-headline-sm text-on-surface font-label-code">4.8 Days</span>
        </div>
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">schedule</span>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between">
        <div>
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider block">Landed YTD Volume</span>
        <span className="font-headline-sm text-headline-sm text-on-surface font-label-price">J$ 342,850</span>
        </div>
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">payments</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded shadow-sm p-space-md mb-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md">
        <div className="flex flex-1 items-center gap-space-md flex-wrap">

        <div className="relative flex-1 min-w-[280px]">
        <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">search</span>
        <input className="w-full pl-9 pr-4 py-2 bg-surface-container-low text-on-surface rounded text-body-sm font-body-sm placeholder:text-on-surface-variant/70 focus:outline-none focus:bg-surface-container-lowest transition-colors" placeholder="Search vendor name, phone, category, code..." type="text"/>
        </div>

        <div className="flex items-center gap-space-xs flex-wrap">
        <button type="button" className="px-3 py-1.5 rounded-full text-caption font-caption bg-primary text-on-primary font-semibold" type="button">
                      All (12)
                    </button>
        <button type="button" className="px-3 py-1.5 rounded-full text-caption font-caption bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" type="button">
                      Active (9)
                    </button>
        <button type="button" className="px-3 py-1.5 rounded-full text-caption font-caption bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" type="button">
                      Parts & Accessories
                    </button>
        <button type="button" className="px-3 py-1.5 rounded-full text-caption font-caption bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" type="button">
                      Tyres & Wheels
                    </button>
        </div>
        </div>

        <div className="flex items-center justify-end gap-space-md pt-2 lg:pt-0">
        <label className="flex items-center gap-space-sm cursor-pointer select-none">
        <span className="font-body-sm text-body-sm text-on-surface-variant">Show archived</span>
        <div className="relative">
        <input className="sr-only peer" id="toggle-archived" type="checkbox"/>
        <div className="w-8 h-4.5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-primary peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
        </div>
        </label>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider select-none">
        <th className="py-3 px-space-lg font-semibold">Name & Code</th>
        <th className="py-3 px-space-md font-semibold">Phone</th>
        <th className="py-3 px-space-md font-semibold">What they supply</th>
        <th className="py-3 px-space-md font-semibold text-center">Delivers in</th>
        <th className="py-3 px-space-md font-semibold text-center">Open POs</th>
        <th className="py-3 px-space-md font-semibold">Last Order</th>
        <th className="py-3 px-space-md font-semibold">Status</th>
        <th className="py-3 px-space-lg text-right font-semibold">Actions</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low text-body-sm font-body-sm text-on-surface">

        <tr className="hover:bg-surface-container/60 transition-colors group cursor-pointer" onclick="toggleDrawer(true)">
        <td className="py-3.5 px-space-lg">
        <div className="flex items-center gap-space-sm">
        <div className="w-8 h-8 rounded bg-primary-container text-on-primary flex items-center justify-center font-label-code text-caption font-bold">
                              KA
                            </div>
        <div>
        <div className="font-headline-sm text-body-md font-semibold text-on-surface flex items-center gap-1.5">
        <span>Kingston Auto Supplies</span>
        <span className="material-symbols-outlined text-[14px] text-surface-tint" title="Verified Roam Fleet Supplier">verified</span>
        </div>
        <span className="font-label-code text-caption text-on-surface-variant">VEN-KGN-01</span>
        </div>
        </div>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-body-sm text-on-surface">
                          876-555-0142
                        </td>
        <td className="py-3.5 px-space-md max-w-xs">
        <div className="truncate text-on-surface" title="Tyres, Batteries, Service kits">
                            Tyres, Batteries, Service kits
                          </div>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface">
        <span className="material-symbols-outlined text-[13px] text-on-surface-variant">timer</span>
                            5 days
                          </span>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-price text-caption font-semibold">
                            1 open PO
                          </span>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-caption text-on-surface-variant">
                          28 Oct 2026
                        </td>
        <td className="py-3.5 px-space-md">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-caption text-caption text-on-surface font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            Active
                          </span>
        </td>
        <td className="py-3.5 px-space-lg text-right" onclick="event.stopPropagation()">
        <div className="flex items-center justify-end gap-1">
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" onclick="toggleDrawer(true)" title="Edit Vendor" type="button">
        <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" title="Vendor Ledger" type="button">
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/60 transition-colors group">
        <td className="py-3.5 px-space-lg">
        <div className="flex items-center gap-space-sm">
        <div className="w-8 h-8 rounded bg-surface-container-high text-on-surface flex items-center justify-center font-label-code text-caption font-bold">
                              CT
                            </div>
        <div>
        <div className="font-headline-sm text-body-md font-semibold text-on-surface">Car Toys Jamaica</div>
        <span className="font-label-code text-caption text-on-surface-variant">VEN-CTJ-02</span>
        </div>
        </div>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-body-sm text-on-surface">
                          876-555-0199
                        </td>
        <td className="py-3.5 px-space-md max-w-xs">
        <div className="truncate text-on-surface" title="Phone mounts, Dashcams, In-cabin accessories">
                            Phone mounts, Dashcams, In-cabin accessories
                          </div>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface">
        <span className="material-symbols-outlined text-[13px] text-on-surface-variant">timer</span>
                            2 days
                          </span>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-price text-caption">
                            0 open POs
                          </span>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-caption text-on-surface-variant">
                          2 Sep 2026
                        </td>
        <td className="py-3.5 px-space-md">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-caption text-caption text-on-surface font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            Active
                          </span>
        </td>
        <td className="py-3.5 px-space-lg text-right">
        <div className="flex items-center justify-end gap-1">
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" title="Edit Vendor" type="button">
        <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" title="Vendor Ledger" type="button">
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
        </div>
        </td>
        </tr>

        <tr className="hover:bg-surface-container/60 transition-colors group">
        <td className="py-3.5 px-space-lg">
        <div className="flex items-center gap-space-sm">
        <div className="w-8 h-8 rounded bg-surface-container-high text-on-surface flex items-center justify-center font-label-code text-caption font-bold">
                              AZ
                            </div>
        <div>
        <div className="font-headline-sm text-body-md font-semibold text-on-surface flex items-center gap-1">
        <span>Amazon (via shipping agent)</span>
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant" title="Freight Forwarded via Miami Hub">flight_land</span>
        </div>
        <span className="font-label-code text-caption text-on-surface-variant">VEN-AMZ-03</span>
        </div>
        </div>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-body-sm text-on-surface-variant">
                          —
                        </td>
        <td className="py-3.5 px-space-md max-w-xs">
        <div className="truncate text-on-surface" title="Specialized OBD tools, Dashcam memory cards">
                            Specialized OBD tools, Dashcam memory cards
                          </div>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface">
        <span className="material-symbols-outlined text-[13px] text-on-surface-variant">timer</span>
                            14 days
                          </span>
        </td>
        <td className="py-3.5 px-space-md text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-label-price text-caption">
                            0 open POs
                          </span>
        </td>
        <td className="py-3.5 px-space-md font-label-code text-caption text-on-surface-variant">
                          15 Mar 2026
                        </td>
        <td className="py-3.5 px-space-md">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container font-caption text-caption text-on-surface font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            Active
                          </span>
        </td>
        <td className="py-3.5 px-space-lg text-right">
        <div className="flex items-center justify-end gap-1">
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" title="Edit Vendor" type="button">
        <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors" title="Vendor Ledger" type="button">
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>
        </div>
        </td>
        </tr>
        </tbody>
        </table>
        </div>

        <div className="bg-surface-container-low px-space-lg py-3 flex items-center justify-between text-caption font-caption text-on-surface-variant">
        <div className="flex items-center gap-space-sm font-label-code">
        <span>Showing 1-3 of 12 registered suppliers</span>
        </div>
        <div className="flex items-center gap-space-xs">
        <button type="button" className="px-2 py-1 rounded bg-surface-container-lowest text-on-surface-variant/40 cursor-not-allowed" disabled="" type="button">Previous</button>
        <span className="px-2 py-1 font-label-code text-on-surface font-bold">1</span>
        <button type="button" className="px-2 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors" type="button">2</button>
        <button type="button" className="px-2 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors" type="button">3</button>
        <button type="button" className="px-2 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors" type="button">Next</button>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-50 overflow-hidden transition-all duration-300 pointer-events-auto" id="drawer-container">

        <div className="absolute inset-0 bg-primary-container/40 backdrop-blur-[2px] transition-opacity" id="drawer-backdrop" onclick="toggleDrawer(false)"></div>
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-[560px] bg-surface-container-lowest shadow-2xl flex flex-col justify-between transform transition-transform duration-300 ease-in-out translate-x-0" id="drawer-panel">

        <div className="px-6 py-5 bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-sm min-w-0">
        <div className="min-w-0">
        <div className="flex items-center gap-2">
        <span className="font-headline-sm text-headline-sm text-on-surface truncate">Edit vendor</span>
        <span className="text-on-surface-variant">·</span>
        <span className="font-label-code text-caption px-2 py-0.5 rounded-full bg-primary text-on-primary font-semibold">Active</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">Kingston Auto Supplies (VEN-KGN-01)</p>
        </div>
        </div>
        <button type="button" className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" onclick="toggleDrawer(false)" title="Close drawer" type="button">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        <div className="p-4 rounded-xl bg-surface-container flex flex-col gap-3">
        <div className="flex items-center justify-between text-caption font-caption text-on-surface-variant uppercase tracking-wider">
        <span>Hub Procurement Velocity</span>
        <span className="font-label-code text-on-surface">FY 2026</span>
        </div>
        <div className="grid grid-cols-3 gap-2 py-1">
        <div>
        <span className="block font-caption text-caption text-on-surface-variant">PO History</span>
        <span className="font-headline-sm text-body-lg font-bold text-on-surface font-label-price">3 POs</span>
        </div>
        <div>
        <span className="block font-caption text-caption text-on-surface-variant">Landed Total</span>
        <span className="font-headline-sm text-body-lg font-bold text-on-surface font-label-price">J$ 64,200</span>
        </div>
        <div>
        <span className="block font-caption text-caption text-on-surface-variant">On Time Rate</span>
        <span className="font-headline-sm text-body-lg font-bold text-on-surface font-label-code">67% <span className="text-caption text-on-surface-variant font-normal">(2/3)</span></span>
        </div>
        </div>

        <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
        <div className="bg-primary h-full rounded-full" style="width: 67%;"></div>
        </div>
        </div>

        <div className="space-y-4">

        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Vendor Legal Name</label>
        <input className="w-full px-3 py-2 bg-surface-container-low rounded text-body-md font-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors" type="text" value="Kingston Auto Supplies"/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Phone Contact</label>
        <div className="relative">
        <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-on-surface-variant">call</span>
        <input className="w-full pl-9 pr-3 py-2 bg-surface-container-low rounded font-label-code text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors" type="text" value="876-555-0142"/>
        </div>
        </div>
        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">PO Direct Email</label>
        <div className="relative">
        <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-on-surface-variant">mail</span>
        <input className="w-full pl-9 pr-3 py-2 bg-surface-container-low rounded font-label-code text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors" type="email" value="orders@kingstonautosupplies.com"/>
        </div>
        </div>
        </div>

        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Supply Specialization & Scope</label>
        <textarea className="w-full px-3 py-2 bg-surface-container-low rounded text-body-sm font-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors resize-none" rows="2">Primary aftermarket supplier for fleet expendables, tyres, and brake pads.</textarea>
        </div>

        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1.5 font-semibold">Category Tags</label>
        <div className="flex items-center flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-on-primary font-caption text-caption font-medium">
        <span>Tyres</span>
        <span className="material-symbols-outlined text-[14px] cursor-pointer hover:opacity-80">close</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-on-primary font-caption text-caption font-medium">
        <span>Batteries</span>
        <span className="material-symbols-outlined text-[14px] cursor-pointer hover:opacity-80">close</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-on-primary font-caption text-caption font-medium">
        <span>Accessories</span>
        <span className="material-symbols-outlined text-[14px] cursor-pointer hover:opacity-80">close</span>
        </span>
        <button type="button" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-caption text-caption font-medium transition-colors" type="button">
        <span className="material-symbols-outlined text-[14px]">add</span>
        <span>Add tag</span>
        </button>
        </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div>
        <label className="block font-caption text-caption uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">Average Lead Window</label>
        <div className="flex items-center rounded bg-surface-container-low overflow-hidden">
        <input className="w-full px-3 py-2 bg-transparent text-body-md font-label-code text-on-surface focus:outline-none" max="90" min="1" type="number" value="5"/>
        <span className="px-3 text-caption font-caption text-on-surface-variant select-none">Days</span>
        </div>
        </div>
        <div className="flex flex-col justify-end">
        <label className="flex items-center gap-space-sm p-2 rounded bg-surface-container cursor-pointer select-none">
        <div className="relative">
        <input checked="" className="sr-only peer" id="vendor-active-toggle" type="checkbox"/>
        <div className="w-8 h-4.5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-on-primary peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
        </div>
        <span className="font-body-sm text-body-sm text-on-surface font-medium">Vendor Active</span>
        </label>
        </div>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-surface-tint">verified_user</span>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Roam Fleet Catalog EPC</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-label-code bg-surface-container-highest text-on-surface font-semibold">Caribbean Tier 1</span>
        </div>
        <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                        Direct live inventory mirror enabled. 1,480 catalog skus mapped automatically to Hub Kingston fleet vehicles with standard JMD pricing tier.
                      </p>
        <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1 text-on-surface">
        <span className="material-symbols-outlined text-[16px] text-on-tertiary-container" style="font-variation-settings: 'FILL' 1;">star</span>
        <span className="font-label-price text-caption font-bold">4.9 / 5.0</span>
        <span className="text-caption text-on-surface-variant">(42 local dispatches)</span>
        </div>
        <a className="text-caption font-caption text-on-surface hover:underline font-semibold" href="#">View Catalog Sync →</a>
        </div>
        </div>
        </div>
        </div>

        <div className="p-6 bg-surface-container-low space-y-4">

        <div className="p-3 rounded-lg bg-surface-container flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[18px] text-error shrink-0 mt-0.5">lock</span>
        <div className="min-w-0">
        <span className="block font-caption text-caption text-error font-semibold uppercase tracking-wider">Archiving Restricted</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant text-[12px] leading-snug">
                        Cannot archive Kingston Auto Supplies while 1 open PO (<span className="font-label-code text-on-surface font-bold">PO-0004</span>) is in progress. Complete or void order first.
                      </p>
        </div>
        </div>

        <div className="flex items-center justify-between gap-space-md pt-1">

        <button type="button" className="px-3 py-2 rounded text-error/40 font-body-sm text-body-sm font-semibold cursor-not-allowed select-none" disabled="" type="button">
                      Archive vendor
                    </button>

        <div className="flex items-center gap-space-sm">
        <button type="button" className="px-space-md py-2 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container font-body-sm text-body-sm transition-colors" onclick="toggleDrawer(false)" type="button">
                        Cancel
                      </button>
        <button type="button" className="px-space-lg py-2 rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-semibold shadow-sm transition-all active:scale-95" onclick="toggleDrawer(false)" type="button">
                        Save vendor
                      </button>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>


        </div></div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
