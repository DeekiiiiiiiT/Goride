/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { useState } from 'react';
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapLocationsBinsForm } from './useGapLocationsBinsForm';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';

export function GapLocationsBins(p: { onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapLocationsBinsForm(p.onClose);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [showNewBin, setShowNewBin] = useState(false);
  const hubLabel = shell.overview?.hub_code ? String(shell.overview.hub_code) : '—';
  const selected = form.selectedLocation;
  const totalValue = form.locations.reduce(
    (sum: number, row: Record<string, unknown>) => sum + Number(row.value_jmd ?? row.total_value ?? 0),
    0,
  );
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="LocationsBins">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">

        <div className="px-margin-desktop py-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-xs">
        <a className="font-caption text-caption text-secondary hover:text-primary transition-colors flex items-center gap-1" href="#">
        <span className="material-symbols-outlined text-[13px]">arrow_back</span>
                  Settings
                </a>
        <span className="text-surface-dim font-caption text-caption">/</span>
        <span className="font-caption text-caption text-on-surface font-semibold">Locations & Bins</span>
        </div>
        <div className="flex items-baseline gap-space-md">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Locations & Bins</h1>
        <span className="font-label-code text-[11px] text-secondary bg-surface-container px-2 py-0.5 rounded">HUB: {hubLabel}</span>
        </div>
        <p className="font-body-sm text-body-sm text-secondary">
                Manage storage depots, vehicle inventory lockers, and physical warehouse bins across the fleet network.
              </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
        <button type="button" onClick={() => setShowNewLocation(true)} className="px-space-md py-2 rounded-lg bg-surface-container-lowest text-primary shadow-sm hover:bg-surface-container transition-all flex items-center gap-1.5 font-body-sm text-body-sm font-semibold">
        <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
                + New location
              </button>
        <button type="button" onClick={() => setShowNewBin(true)} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary shadow-md hover:bg-primary/90 transition-all flex items-center gap-1.5 font-body-sm text-body-sm font-semibold">
        <span className="material-symbols-outlined text-[18px] text-on-primary">inventory_2</span>
                + New bin
              </button>
        </div>
        </div>

        <div className="px-margin-desktop pb-space-xl grid grid-cols-1 xl:grid-cols-12 gap-gutter-desktop items-start">

        <div className="xl:col-span-4 flex flex-col gap-space-md w-full">

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
        <div className="relative w-full">
        <span className="material-symbols-outlined text-secondary absolute left-3 top-2.5 text-[18px]">search</span>
        <input className="w-full pl-9 pr-space-md py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-colors" placeholder="Search code, plate, or depot..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
        </div>
        <div className="flex items-center justify-between font-caption text-caption text-secondary px-1">
        <span>{form.locations.length} Active Storage Targets</span>
        <span className="font-label-code text-caption font-semibold">TOTAL: {formatJmd(totalValue)}</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-md">

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Warehouses & Depots ({form.warehouses.length})</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">warehouse</span>
        </div>

        {form.warehouses.length === 0 ? (
        <p className="font-body-sm text-body-sm text-secondary px-space-xs">No warehouse locations yet.</p>
        ) : form.warehouses.map((loc) => {
          const id = String(loc.id);
          const active = id === form.selectedLocationId;
          return (
        <button key={id} type="button" onClick={() => form.setSelectedLocationId(id)} className={`w-full text-left bg-surface-container-lowest p-space-md rounded-xl shadow-sm cursor-pointer transition-all relative overflow-hidden ${active ? 'bg-gradient-to-r from-surface-container-high/40 to-surface-container-lowest shadow-md' : 'hover:bg-surface-container-low'}`}>
        {active ? <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div> : null}
        <div className="flex items-start justify-between gap-space-sm pl-2">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className={`font-label-code text-caption px-1.5 py-0.5 rounded font-bold ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-secondary'}`}>{String(loc.code ?? '—')}</span>
        <span className={`font-body-md text-body-md font-semibold ${active ? 'text-primary' : 'text-on-surface font-medium'}`}>{String(loc.name ?? '—')}</span>
        </div>
        <span className="font-body-sm text-body-sm text-secondary">{loc.address ? String(loc.address) : '—'}</span>
        </div>
        {loc.is_default ? <span className="bg-secondary-container text-on-secondary-fixed text-[11px] font-caption px-2 py-0.5 rounded-full font-semibold shrink-0">Default depot</span> : null}
        </div>
        </button>
          );
        })}
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Vehicle Lockers ({form.vehicles.length} active)</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">directions_car</span>
        </div>

        {form.vehicles.map((loc) => {
          const id = String(loc.id);
          return (
        <button key={id} type="button" onClick={() => form.setSelectedLocationId(id)} className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all text-left w-full">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-plate text-caption px-1.5 py-0.5 bg-surface-container-highest text-primary rounded font-bold">{form.locationPlate(loc)}</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">{String(loc.name ?? '—')}</span>
        </div>
        <span className="font-label-code text-caption text-secondary">{form.locationSubtitle(loc)}</span>
        </div>
        <span className="bg-surface-container text-secondary text-[11px] font-caption px-2 py-0.5 rounded-full font-medium">{form.locationStatus(loc)}</span>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
        <span className="text-secondary font-body-sm">{form.locationItemCount(loc)} items</span>
        <span className="font-label-price text-label-price text-on-surface">{form.locationStockValueLabel(loc)}</span>
        </div>
        </button>
          );
        })}
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs py-1">
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase">Custodians & Staff ({form.people.length})</span>
        <span className="material-symbols-outlined text-secondary text-[16px]">badge</span>
        </div>

        {form.people.map((loc) => {
          const id = String(loc.id);
          return (
        <button key={id} type="button" onClick={() => form.setSelectedLocationId(id)} className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-xl shadow-sm cursor-pointer transition-all text-left w-full">
        <div className="flex items-start justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-caption px-1.5 py-0.5 bg-surface-container text-on-surface rounded font-bold">{form.locationPlate(loc)}</span>
        <span className="font-body-md text-body-md text-on-surface font-medium">{String(loc.name ?? '—')}</span>
        </div>
        <span className="font-body-sm text-body-sm text-secondary">{form.locationSubtitle(loc)}</span>
        </div>
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
        <span className="text-secondary font-body-sm">{form.locationItemCount(loc)} items</span>
        <span className="font-label-price text-label-price text-on-surface">{form.locationStockValueLabel(loc)}</span>
        </div>
        </button>
          );
        })}
        </div>
        </div>
        </div>

        <div className="xl:col-span-8 flex flex-col gap-space-lg w-full">

        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-lg">

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-space-md pb-space-sm">
        <div className="flex items-start gap-space-md">
        <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[24px]">corporate_fare</span>
        </div>
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-label-code text-caption px-2 py-0.5 rounded bg-primary text-on-primary font-bold">{selected ? String(selected.code ?? '—') : '—'}</span>
        <h2 className="font-headline-sm text-headline-sm text-primary font-bold">{selected ? String(selected.name ?? '—') : '—'}</h2>
        </div>
        <span className="font-body-sm text-body-sm text-secondary font-medium">{selected ? String(selected.kind ?? 'warehouse') : '—'}</span>
        <p className="font-body-sm text-body-sm text-on-surface mt-1 flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px] text-secondary">pin_drop</span>
                        {selected?.address ? String(selected.address) : '—'}
                      </p>
        </div>
        </div>
        <div className="flex items-center gap-space-xs self-start shrink-0">
        <button type="button" disabled={!form.canPatchLocation || form.submit.saving} onClick={() => void form.patchLocation()} className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant font-body-sm text-body-sm text-on-surface font-medium transition-colors flex items-center gap-1 disabled:opacity-60">
        <span className="material-symbols-outlined text-[16px]">edit</span> Edit Details
                    </button>
        <button type="button" onClick={() => form.downloadLabelSheet()} className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-variant font-body-sm text-body-sm text-on-surface font-medium transition-colors flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">print</span> Label Sheet
                    </button>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

        <div className="md:col-span-2 relative rounded-lg overflow-hidden bg-surface-container-high h-40 shadow-sm flex flex-col justify-between p-3" data-location={form.selectedLocation ? String(form.selectedLocation.name ?? '—') : '—'} style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCwbxy-kHvBb5RaTCU9H11JzSZEQbTOc246FvktoeJuKdukZelDfFc6qFn2JTZVz-2Dkrt9ojmeBC7fi2Ju-xH7m5hu47TDGK2DFlvr4K1uT-9I0LRHVSIBQNauH_D8xS8VoHncLHYfTVh-mL2YO_uH-PpyWshI67CAR_86hlgvGi8LuXfh3aZFPHSzylFLqFRmhRAnt_-raj7olE_6EyBtKwXT233cS2VzrmiB5Vs')" }}>
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[1px]"></div>
        <div className="relative z-10 flex items-center justify-between">
        <span className="font-label-code text-caption px-2 py-0.5 bg-primary text-on-primary rounded font-semibold tracking-wide">GEO: 17.9714° N, 76.8118° W</span>
        <span className="bg-surface-container-lowest text-primary font-caption text-caption px-2 py-0.5 rounded shadow-sm">— Harbour Sector</span>
        </div>
        <div className="relative z-10 bg-surface-container-lowest/95 p-2 rounded-lg backdrop-blur-sm self-start flex items-center gap-2 text-on-surface">
        <span className="material-symbols-outlined text-primary text-[18px]">navigation</span>
        <span className="font-label-code text-caption font-semibold">Berth 11 Access Gate · 24/7 Gatehouse Active</span>
        </div>
        </div>

        <div className="relative rounded-lg overflow-hidden h-40 shadow-sm group">
        <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" data-alt="Modern concrete logistics warehouse depot exterior in — Jamaica industrial port under tropical Caribbean sky with secure metal roller doors and commercial transport bay." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAJbbu4iOJmvIa0SeSCyoDXuukj3FnKrWKgMsyXEWiJPwQkiAl70rOnCwmsPmg8PNwGXqz6BjbHAEtnjNWZ5WBuNibFzOqPt9UaMQ03W4e8cOvrqL_sOa6dUxCrYpNW2Bn6B9wDN3X4dxnFqrtTzIEewroArk6Y5MQ8Shbaewh8loGRPjZyed-zJBg-i0R50FVxfcca3VHG1OodfLka4tMHiYN-2MJaOpZV-yjUemg"/>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent flex items-end p-space-sm">
        <span className="font-caption text-caption text-on-primary font-medium flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">photo_camera</span> Secure Facility Bay 3
                      </span>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Total Stock Value</span>
        <span className="font-label-price text-headline-sm text-primary">{form.selectedStockValueLabel}</span>
        <span className="font-caption text-caption text-secondary">Landed valuation</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Assigned Bins</span>
        <span className="font-headline-sm text-headline-sm text-primary font-bold">5 Bins</span>
        <span className="font-caption text-caption text-secondary">3 With Allocations</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Items Held</span>
        <span className="font-headline-sm text-headline-sm text-primary font-bold">2 SKUs</span>
        <span className="font-caption text-caption text-secondary">1 Tyres · 1 Telematics</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Bin Occupancy</span>
        <div className="flex items-center gap-2 mt-0.5">
        <span className="font-label-code text-body-md text-primary font-bold">42%</span>
        <div className="flex-1 h-2 bg-surface-variant rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${form.utilizationPct}%` }}></div>
        </div>
        </div>
        <span className="font-caption text-caption text-secondary">Max vol: 57 units</span>
        </div>
        </div>

        <div className="p-space-md bg-surface-container-low rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-space-lg">

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Default location</span>
        <span className="font-caption text-[10px] text-secondary">Preferred inbound receipt hub</span>
        </div>
        </label>

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Locked store</span>
        <span className="font-caption text-[10px] text-secondary">Keyholder scan required</span>
        </div>
        </label>

        <label className="flex items-center gap-space-xs cursor-pointer">
        <div className="relative inline-flex items-center h-5 rounded-full w-9 bg-primary cursor-pointer transition-colors">
        <span className="translate-x-4 inline-block w-3.5 h-3.5 transform bg-on-primary rounded-full transition-transform"></span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Active depot</span>
        <span className="font-caption text-[10px] text-secondary">Accepting dispatches</span>
        </div>
        </label>
        </div>

        <div className="relative group shrink-0">
        <button type="button" disabled={!form.selectedLocationId || form.submit.saving} onClick={() => void form.archiveLocation()} className="px-space-md py-2 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
        <span className="material-symbols-outlined text-[16px]">archive</span>
                      Archive location
                    </button>

        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:flex flex-col w-72 p- space-md bg-inverse-surface text-inverse-on-surface text-caption font-caption rounded-lg shadow-xl z-30">
        <div className="flex items-center gap-1 text-on-tertiary-fixed-variant font-bold mb-0.5">
        <span className="material-symbols-outlined text-[14px]">warning</span> Blocked Action
                      </div>
        <span>Cannot archive Main store while stock is inside. Move the 2 items out first.</span>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-md">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Physical Storage Bins in {selected ? String(selected.name ?? "—") : "—"}</h3>
        <span className="font-body-sm text-body-sm text-secondary">{form.binsForSelected.length} registered bins</span>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
        <div className="relative">
        <span className="material-symbols-outlined text-secondary absolute left-2.5 top-2 text-[16px]">filter_list</span>
        <input className="pl-8 pr-3 py-1.5 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest" placeholder="Filter bins..." type="text" value={form.binFilter} onChange={(e) => form.setBinFilter(e.target.value)}/>
        </div>
        <button type="button" onClick={() => setShowNewBin(true)} className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-all flex items-center gap-1">
        <span className="material-symbols-outlined text-[16px]">add</span> + Add bin
                    </button>
        </div>
        </div>

        <div className="overflow-x-auto w-full">
        <table className="w-full text-left font-body-md text-body-md border-collapse">
        <thead>
        <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
        <th className="py-2.5 px-space-md font-bold rounded-l-lg">Bin Code</th>
        <th className="py-2.5 px-space-md font-bold">Zone / Department</th>
        <th className="py-2.5 px-space-md font-bold">Capacity</th>
        <th className="py-2.5 px-space-md font-bold">Items in Bin</th>
        <th className="py-2.5 px-space-md font-bold text-right">Stock Value</th>
        <th className="py-2.5 px-space-md font-bold text-right rounded-r-lg">Status / Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low">
        {form.binsForSelected.length === 0 ? (
        <tr><td colSpan={6} className="py-6 px-space-md text-center text-secondary font-body-sm">No bins for this location.</td></tr>
        ) : form.binsForSelected.map((bin) => (
        <tr key={String(bin.id)} className="hover:bg-surface-container/50 transition-colors">
        <td className="py-3 px-space-md">
        <div className="flex items-center gap-2">
        <span className="font-label-code text-label-code px-2 py-0.5 bg-surface-container-high rounded font-bold text-primary">{String(bin.code ?? '—')}</span>
        </div>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-body-sm text-body-sm font-medium text-on-surface">{String(bin.zone ?? bin.name ?? '—')}</span>
        </td>
        <td className="py-3 px-space-md">
        <span className="font-label-code text-body-sm text-secondary">{bin.capacity_units != null ? String(bin.capacity_units) : '—'} units</span>
        </td>
        <td className="py-3 px-space-md text-secondary">—</td>
        <td className="py-3 px-space-md text-right"><span className="font-label-price text-label-price text-on-surface">—</span></td>
        <td className="py-3 px-space-md text-right"><span className="font-caption text-caption font-semibold text-primary">Active</span></td>
        </tr>
        ))}
</tbody>
        </table>
        </div>

        <div className="p-space-sm bg-surface-container rounded-lg flex items-center justify-between font-caption text-caption text-secondary">
        <div className="flex items-center gap-space-sm">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary"></span> QR Code scanning ready on all listed bins</span>
        <span>·</span>
        <span>Last inventory audit: Today, 14:15 EST by JD</span>
        </div>
        <a className="text-primary hover:underline font-semibold flex items-center gap-1" href="#">
                    Export Bins Catalog (CSV) <span className="material-symbols-outlined text-[14px]">download</span>
        </a>
        </div>
        </div>
        </div>
        </div>

        <div className={`fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4 ${showNewLocation ? "" : "hidden"}`} id="modal-new-location">
        <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-space-xl shadow-2xl flex flex-col gap-space-md relative">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">add_location</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Register Storage Depot</h3>
        </div>
        <button type="button" aria-label="Close dialog" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary" onClick={() => setShowNewLocation(false)}>
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-sm font-body-sm text-body-sm">
        <div className="grid grid-cols-3 gap-space-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Location Code</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code uppercase" placeholder="e.g. OCH" type="text" value={form.locationCode} onChange={(e) => form.setLocationCode(e.target.value)}/>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Location Name</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="Location name" type="text" value={form.locationName} onChange={(e) => form.setLocationName(e.target.value)}/>
        </div>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Physical Type</label>
        <select className="p-2 bg-surface-container-low rounded" value={form.locationKind} onChange={(e) => form.setLocationKind(e.target.value)}>
        <option value="warehouse">Warehouse / Regional Depot</option>
        <option>Vehicle Locker Trunk</option>
        <option>Staff Field Bag / Custodian</option>
        <option>External Contractor Workshop</option>
        </select>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Address / Port Bay</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="Address" type="text" value={form.locationAddress} onChange={(e) => form.setLocationAddress(e.target.value)}/>
        </div>
        <div className="flex items-center gap-space-md pt-2">
        <label className="flex items-center gap-2 cursor-pointer">
        <input className="rounded text-primary" type="checkbox"/>
        <span className="text-body-sm">Set as network default depot</span>
        </label>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container font-body-sm text-body-sm font-medium hover:bg-surface-variant" onClick={() => setShowNewLocation(false)}>Cancel</button>
        <button type="button" disabled={!form.canSaveLocation || form.submit.saving} onClick={() => void form.saveLocation().then(() => setShowNewLocation(false))} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90 disabled:opacity-60">{form.submit.saving ? "Saving…" : "Save Location"}</button>
        </div>
        </div>
        </div>

        <div className={`fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4 ${showNewBin ? "" : "hidden"}`} id="modal-new-bin">
        <div className="bg-surface-container-lowest rounded-xl max-w-md w-full p-space-xl shadow-2xl flex flex-col gap-space-md relative">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">shelves</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Register Storage Bin</h3>
        </div>
        <button type="button" aria-label="Close dialog" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary" onClick={() => setShowNewBin(false)}>
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-sm font-body-sm text-body-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Assign to Location</label>
        <select className="p-2 bg-surface-container rounded text-secondary font-medium" value={form.binLocationId} onChange={(e) => form.setBinLocationId(e.target.value)}>{form.locations.map((loc) => (<option key={String(loc.id)} value={String(loc.id)}>{String(loc.name ?? loc.code ?? "—")}</option>))}</select>
        </div>
        <div className="grid grid-cols-2 gap-space-sm">
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Bin Code</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code uppercase" placeholder="e.g. C-08" type="text" value={form.binCode} onChange={(e) => form.setBinCode(e.target.value)}/>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Unit Capacity</label>
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code" placeholder="25" type="number" value="" readOnly aria-label="Unit capacity optional"/>
        </div>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Zone / Department</label>
        <input className="p-2 bg-surface-container-low rounded" placeholder="Zone / department" type="text" value={form.binZone} onChange={(e) => form.setBinZone(e.target.value)}/>
        </div>
        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-secondary uppercase font-semibold">Security Level</label>
        <select className="p-2 bg-surface-container-low rounded" value={form.locationIsSecure} onChange={(e) => form.setLocationIsSecure(e.target.value)}>
        <option value="standard">Standard Rack Storage</option>
        <option value="locked">Locked Wire Cage (Double-auth)</option>
        <option value="hazmat">Hazmat Certified Compartment</option>
        </select>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container font-body-sm text-body-sm font-medium hover:bg-surface-variant" onClick={() => setShowNewBin(false)}>Cancel</button>
        <button type="button" disabled={!form.canSaveBin || form.submit.saving} onClick={() => void form.saveBin().then(() => setShowNewBin(false))} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary/90 disabled:opacity-60">{form.submit.saving ? "Saving…" : "Add Storage Bin"}</button>
        </div>
        </div>
        </div>
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
