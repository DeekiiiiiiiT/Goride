/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapOpeningBalancesForm } from './useGapOpeningBalancesForm';

export function GapOpeningBalances(p: { onClose?: () => void }) {
  const form = useGapOpeningBalancesForm(p.onClose);
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="OpeningBalances">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div className="flex flex-col gap-space-xs">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors w-fit" href="#">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Inventory</span>
        </a>
        <div className="flex items-center gap-space-md pt-space-xs">
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Opening balances</h1>
        <span className="bg-surface-container-high text-on-surface-variant font-label-code text-[11px] px-2 py-0.5 rounded uppercase tracking-wider">Setup Phase</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
                  Enter the stock you already have before you start using Receive and Issue. Do this once per location.
                </p>
        </div>

        <div className="flex items-center bg-surface-container-low p-1 rounded-lg gap-1 self-start md:self-auto flex-wrap">
        {form.locations.length === 0 ? (
        <span className="px-space-md py-1.5 font-body-sm text-body-sm text-on-surface-variant">No locations loaded</span>
        ) : (
        form.locations.map((loc) => (
        <button
          key={String(loc.id)}
          type="button"
          className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-all ${form.locationId === String(loc.id) ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
          onClick={() => form.setLocationId(String(loc.id))}
        >
        <span className="material-symbols-outlined text-[16px]">{loc.location_type === 'vehicle' ? 'local_shipping' : 'warehouse'}</span>
        <span className="font-medium">{String(loc.name ?? '—')}</span>
        </button>
        ))
        )}
        </div>
        </div>

        <div className="w-full bg-tertiary-fixed rounded-xl p-space-lg flex items-start gap-space-md shadow-sm">
        <div className="w-8 h-8 rounded bg-on-tertiary-container/15 flex items-center justify-center shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-on-tertiary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-space-sm">
        <div className="flex flex-col">
        <span className="font-body-md text-body-md text-on-tertiary-fixed font-semibold tracking-tight">Existing initial balance record detected</span>
        <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant">
                    {form.previewLocationName} already has an opening balance on record (<span className="font-label-code text-[12px] font-bold">{form.priorBatchLabel}</span>). New lines are added on top; to fix a wrong line, reverse it from Movements.
                  </p>
        </div>
        <a className="shrink-0 inline-flex items-center gap-1 font-body-sm text-body-sm text-on-tertiary-container hover:underline font-semibold" href="#">
        <span>Review {form.priorBatchLabel}</span>
        <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
        </a>
        </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">

        <div className="xl:col-span-8 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-on-surface-variant text-[18px]">format_list_bulleted</span>
        <span className="font-headline-sm text-headline-sm text-on-surface">Opening Stock Inventory</span>
        </div>
        <span className="font-label-code text-caption text-on-surface-variant tracking-wider uppercase">Currency: JMD (J$)</span>
        </div>

        <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse" id="balance-items-table">
        <thead>
        <tr className="bg-surface-container-high/40 text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-sm px-space-lg font-semibold w-[36%]">Item & Identifiers</th>
        <th className="py-space-sm px-space-md font-semibold w-[16%]">Storage Bin</th>
        <th className="py-space-sm px-space-md font-semibold w-[14%] text-right">Quantity</th>
        <th className="py-space-sm px-space-md font-semibold w-[18%] text-right">Unit Cost (J$)</th>
        <th className="py-space-sm px-space-md font-semibold w-[16%] text-right">Line Value</th>
        <th className="py-space-sm px-space-md w-[8%] text-center">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low" id="table-rows">
        {!form.draftLine ? (
        <tr>
        <td colSpan={6} className="py-space-lg px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                          Choose an item, location, and quantity to preview your opening balance line.
                        </td>
        </tr>
        ) : (
        <tr className="item-row hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <div className="flex items-center gap-space-md">
        <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-on-surface text-[20px]">inventory_2</span>
        </div>
        <div className="flex flex-col min-w-0">
        <span className="font-body-md text-body-md font-medium text-on-surface truncate">{form.draftLine.name}</span>
        <div className="flex items-center gap-space-xs mt-0.5">
        <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-1 rounded">{form.draftLine.sku}</span>
        </div>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-md">
        <span className="font-label-code text-label-code text-on-surface">{form.selectedLocation ? String(form.selectedLocation.name ?? '—') : '—'}</span>
        </td>
        <td className="py-space-md px-space-md text-right">
        <input className="qty-input w-20 text-right bg-surface-container-lowest font-label-code text-label-code text-on-surface py-1.5 px-space-sm rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" min="1" type="number" value={form.qty} onChange={(e) => form.setQty(e.target.value)} />
        </td>
        <td className="py-space-md px-space-md text-right">
        <span className="font-label-price text-label-price text-on-surface">{form.formatJmd(form.draftLine.unit)}</span>
        </td>
        <td className="py-space-md px-space-md text-right">
        <span className="line-total font-label-price text-label-price text-on-surface">{form.formatJmd(form.draftLine.lineTotal)}</span>
        </td>
        <td className="py-space-md px-space-md text-center">
        <button type="button" className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors" title="Remove line" onClick={() => { form.setItemId(''); form.setQty(''); }}>
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </td>
        </tr>
        )}
        </tbody>
        </table>
        </div>

        <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-sm">
        <div className="flex items-center gap-space-md">
        <div className="relative flex-1">
        <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">search</span>
        <select className="w-full bg-surface-container-lowest pl-10 pr-space-md py-2 rounded font-body-sm text-body-sm text-on-surface shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" id="item-search-input" value={form.itemId} onChange={(e) => form.setItemId(e.target.value)}>
        <option value="">Search item name or SKU to add…</option>
        {form.items.map((it) => (
          <option key={String(it.id)} value={String(it.id)}>{String(it.name ?? '—')} ({String(it.sku ?? '—')})</option>
        ))}
        </select>
        </div>
        <button className="px-space-md py-2 bg-primary text-on-primary font-body-sm text-body-sm font-medium rounded shadow-sm hover:opacity-95 transition-opacity flex items-center gap-space-xs shrink-0" type="button" onClick={() => { if (form.draftLine) { form.setItemId(form.draftLine.id); form.setQty(String(form.draftLine.qty)); } }}>
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>Add line</span>
        </button>
        </div>

        <div className="flex items-center gap-space-sm pt-space-xs flex-wrap">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Quick frequent items:</span>
        {form.items.slice(0, 3).map((it) => {
          const id = String(it.id);
          const cost = it.unit_cost_jmd != null ? Number(it.unit_cost_jmd) : it.default_cost_jmd != null ? Number(it.default_cost_jmd) : 0;
          return (
        <button key={id} className="text-on-surface hover:text-primary font-label-code text-[11px] bg-surface-container-highest px-2 py-0.5 rounded transition-colors flex items-center gap-1" type="button" onClick={() => { form.setItemId(id); form.setQty('1'); }}>
        <span>+ {String(it.sku ?? it.name ?? '—')}</span>
        <span className="text-on-surface-variant font-caption text-caption">({form.formatJmd(cost || null)})</span>
        </button>
          );
        })}
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col md:flex-row items-center gap-space-lg">
        <div className="w-full md:w-56 h-32 bg-surface-container rounded-lg overflow-hidden shrink-0 relative">
        <div className="w-full h-full bg-cover bg-center" data-location="Kingston, Jamaica"></div>
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-[0.5px] flex items-end p-2">
        <span className="font-label-code text-[10px] text-on-primary bg-primary px-1.5 py-0.5 rounded">Hub 01 Logistics Yard</span>
        </div>
        </div>
        <div className="flex flex-col gap-space-xs flex-1">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">verified_user</span>
        <span className="font-headline-sm text-headline-sm text-on-surface">Store Location Policy & Security</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Kingston Main Store is a centralized warehouse zone. Opening balances committed to this store become verifiable assets under custody of Dispatch Lead & Operations. Double-check all bin tags before posting.
                    </p>
        </div>
        </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-lg sticky top-36">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Ledger Aggregates</span>
        <div className="flex items-baseline justify-between">
        <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight" id="summary-total-cost">{form.draftLine ? form.formatJmd(form.draftLine.lineTotal) : form.formatJmd(0)}</span>
        <span className="font-label-code text-caption text-surface-tint">TOTAL LANDED</span>
        </div>
        <div className="flex items-center gap-space-sm pt-space-xs">
        <span className="font-label-code text-body-sm text-on-surface font-semibold" id="summary-item-count">{form.draftLine ? '1 item' : '0 items'}</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-code text-body-sm text-on-surface font-semibold" id="summary-unit-count">{form.draftLine ? `${form.draftLine.qty} units` : '0 units'}</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-code text-body-sm text-on-surface-variant">{form.selectedLocation ? String(form.selectedLocation.name ?? '—') : 'No location'}</span>
        </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-space-xs">
        <div className="flex justify-between font-caption text-caption text-on-surface-variant">
        <span>Allocation Value Distribution</span>
        <span className="font-label-code">TYR 73.5% / ACC 26.5%</span>
        </div>
        <div className="w-full h-2 rounded bg-surface-container flex overflow-hidden">
        <div className="bg-primary h-full" style={{ width: `${form.allocatedPct}%` }}></div>
        <div className="bg-surface-tint h-full" style={{ width: `${form.remainingPct}%` }}></div>
        </div>
        </div>
        <div className="h-px bg-surface-container-high w-full"></div>

        <div className="flex flex-col gap-space-md">

        <div className="flex flex-col gap-1.5">
        <label className="font-body-sm text-body-sm font-medium text-on-surface flex items-center justify-between">
        <span>Date of balance</span>
        <span className="font-caption text-caption text-on-surface-variant">Immutable record</span>
        </label>
        <div className="relative">
        <input className="w-full bg-surface-container-low text-on-surface font-label-code text-body-sm px-space-md py-2 rounded focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" type="date" value={form.balanceDate} onChange={(e) => form.setBalanceDate(e.target.value)} />
        </div>
        </div>

        <div className="flex flex-col gap-1.5">
        <label className="font-body-sm text-body-sm font-medium text-on-surface">
                        Where did these numbers come from? <span className="text-on-surface-variant font-normal">(optional)</span>
        </label>
        <textarea className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-md py-2 rounded focus:outline-none focus:ring-1 focus:ring-primary shadow-sm placeholder:text-outline resize-none" placeholder="Optional source notes for the audit trail" rows={3} value={form.memo} onChange={(e) => form.setMemo(e.target.value)} />
        </div>

        <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded">
        <span className="font-caption text-caption text-on-surface-variant">Session operator</span>
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-[11px] text-on-surface font-semibold">Deeki T (Platform Owner)</span>
        <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-sm">
        <span className="font-caption text-caption uppercase font-semibold text-on-surface tracking-wider">What will change upon posting</span>
        <div className="flex flex-col gap-2 font-body-sm text-body-sm text-on-surface-variant">
        <div className="flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-on-surface text-[16px] shrink-0 mt-0.5">check_circle</span>
        <span>{form.previewLocationName} will show <strong className="text-on-surface">{form.draftLine ? '1 item' : '0 items'}</strong> worth <strong className="text-on-surface font-label-price text-[13px]">{form.previewTotalLabel}</strong>.</span>
        </div>
        <div className="flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-on-surface text-[16px] shrink-0 mt-0.5">check_circle</span>
        <span>Recorded as <span className="font-label-code text-[12px] font-bold text-on-surface bg-surface-container-highest px-1 rounded">{form.postBatchLabel}</span> in Movements ledger with immutable timestamp.</span>
        </div>
        <div className="flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-on-surface text-[16px] shrink-0 mt-0.5">check_circle</span>
        <span>Quantities will become locked and can only be modified via <span className="text-on-surface font-medium">Receive, Issue,</span> or <span className="text-on-surface font-medium">Count</span>.</span>
        </div>
        </div>
        </div>

        <div className="flex items-center gap-space-md pt-space-xs">
        <button className="w-1/3 py-2.5 px-space-md bg-surface-container-low hover:bg-surface-container font-body-md text-body-md text-on-surface rounded transition-colors text-center font-medium" type="button" onClick={() => p.onClose?.()}>
                      Cancel
                    </button>
        <button type="button" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.post()} className="w-2/3 py-2.5 px-space-md bg-primary hover:opacity-90 text-on-primary font-body-md text-body-md font-semibold rounded shadow-md transition-all flex items-center justify-center gap-space-xs disabled:opacity-60">
        <span className="material-symbols-outlined text-[18px]">verified</span>
        <span>{form.submit.saving ? 'Posting…' : 'Post opening balance'}</span>
        </button>
        </div>
        </div>

        <div className="p-space-md rounded bg-surface-container-low flex items-center gap-space-md">
        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">lock_reset</span>
        <p className="font-caption text-caption text-on-surface-variant">
                    Opening balances post through the ledger; saved entries follow your org approval rules.
                  </p>
        </div>
        </div>
        </div>
        </div>

        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
