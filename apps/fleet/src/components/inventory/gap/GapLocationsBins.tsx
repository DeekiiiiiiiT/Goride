/** Locations (store + cars). Bins were removed in the 5 Nov cut-down (IV-13, IV-14, IV-16). */
import { useState } from 'react';
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapLocationsBinsForm } from './useGapLocationsBinsForm';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { numField, strField } from '../inventoryData';

export function GapLocationsBins(p: { onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapLocationsBinsForm(p.onClose);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const readOnly = shell.readOnly;
  const selected = form.selectedLocation;
  /** Real item count + value at a location, from the stock rows. */
  const held = (locId: string) => {
    const rows = shell.stockRows.filter((r) => strField(r, 'location_id', '') === locId && numField(r, 'on_hand', 0) > 0);
    return {
      items: rows.length,
      units: rows.reduce((s, r) => s + numField(r, 'on_hand', 0), 0),
      value: rows.reduce((s, r) => s + numField(r, 'stock_value', 0), 0),
    };
  };
  const q = form.searchQuery.trim().toLowerCase();
  const match = (l: Record<string, unknown>) =>
    !q || `${strField(l, 'code', '')} ${strField(l, 'name', '')}`.toLowerCase().includes(q);
  const selHeld = selected ? held(String(selected.id)) : { items: 0, units: 0, value: 0 };
  const card = (loc: Record<string, unknown>, icon: string) => {
    const id = String(loc.id);
    const active = id === form.selectedLocationId;
    const h = held(id);
    return (
      <button key={id} type="button" onClick={() => form.setSelectedLocationId(id)} className={`w-full text-left bg-surface-container-lowest p-space-md rounded-xl shadow-sm transition-all relative overflow-hidden ${active ? 'shadow-md ring-2 ring-primary' : 'hover:bg-surface-container-low'}`}>
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">{icon}</span>
            <span className="font-label-code text-caption px-1.5 py-0.5 rounded font-bold bg-surface-container-high text-secondary">{strField(loc, 'code', '—')}</span>
            <span className="font-body-md text-body-md font-semibold text-on-surface">{strField(loc, 'name', '—')}</span>
          </div>
          {loc.is_default ? <span className="bg-secondary-container text-on-secondary-fixed text-[11px] font-caption px-2 py-0.5 rounded-full font-semibold shrink-0">Default</span> : null}
        </div>
        <div className="mt-space-sm flex items-center justify-between font-caption text-caption">
          <span className="text-secondary font-body-sm">{h.items} item{h.items === 1 ? '' : 's'}</span>
          <span className="font-label-price text-label-price text-on-surface">{formatJmd(h.value || null)}</span>
        </div>
      </button>
    );
  };
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Locations">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">

        <div className="px-margin-desktop py-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
        <button type="button" onClick={() => p.onClose?.()} className="self-start inline-flex items-center gap-1 px-space-sm py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-caption text-caption">
        <span aria-hidden="true" className="material-symbols-outlined text-[13px]">arrow_back</span>
                  Settings
                </button>
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Locations</h1>
        <p className="font-body-sm text-body-sm text-secondary">Where stock is kept: the store and each car.</p>
        </div>
        {!readOnly ? (
        <button type="button" onClick={() => { form.setLocationName(''); form.setLocationCode(''); form.setLocationAddress(''); setShowNewLocation(true); }} className="px-space-md py-2 rounded-lg bg-primary text-on-primary shadow-sm flex items-center gap-1.5 font-body-sm text-body-sm font-semibold self-start md:self-auto">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_location_alt</span>
                New location
              </button>
        ) : null}
        </div>

        <div className="px-margin-desktop pb-space-xl grid grid-cols-1 xl:grid-cols-12 gap-gutter-desktop items-start">

        <div className="xl:col-span-4 flex flex-col gap-space-md w-full">
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
        <div className="relative w-full">
        <span aria-hidden="true" className="material-symbols-outlined text-secondary absolute left-3 top-2.5 text-[18px]">search</span>
        <input className="w-full pl-9 pr-space-md py-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none" placeholder="Search code or name..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)} aria-label="Search locations"/>
        </div>
        </div>
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase px-space-xs">Stores ({form.warehouses.length})</span>
        {form.warehouses.filter(match).map((l) => card(l, 'warehouse'))}
        <span className="font-caption text-caption text-secondary font-bold tracking-wider uppercase px-space-xs">Cars ({form.vehicles.length})</span>
        {form.vehicles.filter(match).map((l) => card(l, 'directions_car'))}
        </div>

        <div className="xl:col-span-8 flex flex-col gap-space-lg w-full">
        {selected ? (
        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-md flex flex-col gap-space-lg">
        <div className="flex items-start gap-space-md">
        <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span aria-hidden="true" className="material-symbols-outlined text-[24px]">{strField(selected, 'kind', '') === 'vehicle' ? 'directions_car' : 'corporate_fare'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
        <h2 className="font-headline-sm text-headline-sm text-primary font-bold">{strField(selected, 'name', '—')}</h2>
        <span className="font-body-sm text-body-sm text-secondary font-medium">{strField(selected, 'kind', '') === 'vehicle' ? 'Car' : 'Store'}</span>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Stock value</span>
        <span className="font-label-price text-headline-sm text-primary">{formatJmd(selHeld.value || null)}</span>
        </div>
        <div className="bg-surface-container p-space-md rounded-lg flex flex-col gap-0.5">
        <span className="font-caption text-caption text-secondary uppercase font-semibold">Items held</span>
        <span className="font-headline-sm text-headline-sm text-primary font-bold">{selHeld.items}</span>
        <span className="font-caption text-caption text-secondary">{selHeld.units} unit{selHeld.units === 1 ? '' : 's'}</span>
        </div>
        </div>

        {!readOnly && strField(selected, 'kind', '') !== 'vehicle' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
        <label className="flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Code
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code normal-case" type="text" value={form.locationCode} onChange={(e) => form.setLocationCode(e.target.value)}/>
        </label>
        <label className="md:col-span-2 flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Name
        <input className="p-2 bg-surface-container-low rounded font-body-sm normal-case" type="text" value={form.locationName} onChange={(e) => form.setLocationName(e.target.value)}/>
        </label>
        <label className="md:col-span-3 flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Address
        <input className="p-2 bg-surface-container-low rounded font-body-sm normal-case" type="text" value={form.locationAddress} onChange={(e) => form.setLocationAddress(e.target.value)}/>
        </label>
        </div>
        ) : null}

        {!readOnly && strField(selected, 'kind', '') !== 'vehicle' ? (
        <div className="p-space-md bg-surface-container-low rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <button type="button" disabled={!form.canPatchLocation || form.submit.saving} onClick={() => void form.patchLocation().catch(() => undefined)} className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-1 disabled:opacity-60">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">save</span> Save details
        </button>
        {selHeld.items > 0 ? (
        <span className="font-body-sm text-body-sm text-on-surface-variant">Can&apos;t archive while stock is inside. Move the {selHeld.items} item{selHeld.items === 1 ? '' : 's'} out first.</span>
        ) : (
        <button type="button" disabled={form.submit.saving} onClick={() => void form.archiveLocation().catch(() => undefined)} className="px-space-md py-2 rounded-lg bg-error-container text-error font-body-sm text-body-sm font-semibold flex items-center gap-1.5 disabled:opacity-60">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">archive</span>
                      Archive location
                    </button>
        )}
        </div>
        ) : null}
        </div>
        ) : (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Choose a location.</p>
        )}
        </div>
        </div>

        {showNewLocation ? (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-4" id="modal-new-location">
        <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-space-xl shadow-2xl flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">New store location</h3>
        <button type="button" aria-label="Close dialog" className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary" onClick={() => setShowNewLocation(false)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>
        <div className="grid grid-cols-3 gap-space-sm font-body-sm text-body-sm">
        <label className="flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Code
        <input className="p-2 bg-surface-container-low rounded font-label-code text-label-code uppercase" placeholder="e.g. OCH" type="text" value={form.locationCode} onChange={(e) => form.setLocationCode(e.target.value)}/>
        </label>
        <label className="col-span-2 flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Name
        <input className="p-2 bg-surface-container-low rounded normal-case" placeholder="Location name" type="text" value={form.locationName} onChange={(e) => form.setLocationName(e.target.value)}/>
        </label>
        <label className="col-span-3 flex flex-col gap-1 font-caption text-caption text-secondary uppercase font-semibold">Address
        <input className="p-2 bg-surface-container-low rounded normal-case" placeholder="Address" type="text" value={form.locationAddress} onChange={(e) => form.setLocationAddress(e.target.value)}/>
        </label>
        </div>
        <p className="font-caption text-caption text-on-surface-variant">Cars get their own location automatically.</p>
        <div className="flex items-center justify-end gap-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-error-container text-error font-body-sm text-body-sm font-semibold" onClick={() => setShowNewLocation(false)}>Cancel</button>
        <button type="button" disabled={!form.canSaveLocation || form.submit.saving} onClick={() => { form.setLocationKind('warehouse'); void form.saveLocation().then(() => setShowNewLocation(false)).catch(() => undefined); }} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold disabled:opacity-60">Save location</button>
        </div>
        </div>
        </div>
        ) : null}
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
