/** Opening balances — several lines per place, real costs, review step (IV-13, IV-14, IV-16, IV-17). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapOpeningBalancesForm } from './useGapOpeningBalancesForm';
import { numField, strField } from '../inventoryData';
import { useAuth } from '../../auth/AuthContext';

export function GapOpeningBalances(p: { onClose?: () => void }) {
  const form = useGapOpeningBalancesForm(p.onClose);
  const { user } = useAuth();
  const operatorLabel =
    (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || 'You';
  const placeName = form.selectedLocation ? String(form.selectedLocation.name ?? form.selectedLocation.code ?? '—') : '—';
  const reviewing = form.step === 'review';
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Opening balances">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div className="flex flex-col gap-space-xs">
        <button type="button" onClick={() => p.onClose?.()} className="self-start inline-flex items-center gap-space-xs px-space-sm py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Inventory</span>
        </button>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight pt-space-xs">Opening balances</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">Enter what is really in the store and in each car today. Do it once per place.</p>
        </div>
        <div className="flex items-center bg-surface-container-low p-1 rounded-lg gap-1 self-start md:self-auto flex-wrap">
        {form.locations.map((loc) => (
        <button key={String(loc.id)} type="button" className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-all ${form.locationId === String(loc.id) ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`} onClick={() => form.setLocationId(String(loc.id))}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{String(loc.kind) === 'vehicle' ? 'directions_car' : 'warehouse'}</span>
        <span className="font-medium">{String(loc.name ?? '—')}</span>
        </button>
        ))}
        </div>
        </div>

        {form.locationId && form.existingRows.length > 0 ? (
        <div className="w-full bg-tertiary-fixed rounded-xl p-space-lg flex items-start gap-space-md shadow-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-on-tertiary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
        <div className="flex flex-col">
        <span className="font-body-md text-body-md text-on-tertiary-fixed font-semibold">{placeName} already has stock recorded</span>
        <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant">
        {form.existingRows.map((r) => `${strField(r, 'name', 'Item')} × ${numField(r, 'on_hand', 0)}`).join(', ')}. New lines are added on top; to fix a wrong line, reverse it from Movements.
        </p>
        </div>
        </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">
        <div className="xl:col-span-8 flex flex-col gap-space-lg">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-space-xl py-space-md bg-surface-container-low flex items-center justify-between">
        <span className="font-headline-sm text-headline-sm text-on-surface">{reviewing ? `Check before saving — ${placeName}` : `Lines for ${placeName}`}</span>
        <span className="font-label-code text-caption text-on-surface-variant tracking-wider uppercase">J$</span>
        </div>
        <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse" id="balance-items-table">
        <thead>
        <tr className="bg-surface-container-high/40 text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-sm px-space-lg font-semibold">Item</th>
        <th className="py-space-sm px-space-md font-semibold text-right">Quantity</th>
        <th className="py-space-sm px-space-md font-semibold text-right">Unit cost (J$)</th>
        <th className="py-space-sm px-space-md font-semibold text-right">Line value</th>
        <th className="py-space-sm px-space-md w-12"><span className="sr-only">Remove</span></th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low">
        {form.lines.length === 0 ? (
        <tr><td colSpan={5} className="py-space-lg px-space-lg font-body-sm text-body-sm text-on-surface-variant">{form.locationId ? 'Add the items that are there.' : 'Choose a place above first.'}</td></tr>
        ) : form.lines.map((l) => {
          const q = Number(l.qty);
          const c = Number(String(l.unitCost).replace(/,/g, ''));
          return (
        <tr key={l.key}>
        <td className="py-space-md px-space-lg">
        <div className="font-body-md text-body-md font-medium text-on-surface">{l.name}</div>
        <div className="font-label-code text-caption text-on-surface-variant">{l.sku}</div>
        </td>
        <td className="py-space-md px-space-md text-right">
        {reviewing ? <span className="font-label-code">{l.qty}</span> : (
        <input className="w-20 text-right bg-surface-container-lowest font-label-code text-label-code text-on-surface py-1.5 px-space-sm rounded shadow-sm" min="0" type="number" value={l.qty} onChange={(e) => form.updateLine(l.key, { qty: e.target.value })} aria-label={`Quantity of ${l.name}`} />
        )}
        </td>
        <td className="py-space-md px-space-md text-right">
        {reviewing ? <span className="font-label-price">{form.formatJmd(c)}</span> : (
        <input className="w-28 text-right bg-surface-container-lowest font-label-code text-label-code text-on-surface py-1.5 px-space-sm rounded shadow-sm" inputMode="decimal" type="text" placeholder="Cost" value={l.unitCost} onChange={(e) => form.updateLine(l.key, { unitCost: e.target.value })} aria-label={`Unit cost of ${l.name}`} />
        )}
        </td>
        <td className="py-space-md px-space-md text-right font-label-price text-label-price text-on-surface">{Number.isFinite(q * c) ? form.formatJmd(q * c) : '—'}</td>
        <td className="py-space-md px-space-md text-center">
        {!reviewing ? (
        <button type="button" className="w-8 h-8 rounded bg-error-container text-error flex items-center justify-center" title="Remove line" aria-label={`Remove ${l.name}`} onClick={() => form.removeLine(l.key)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
        </button>
        ) : null}
        </td>
        </tr>
          );
        })}
        </tbody>
        </table>
        </div>
        {!reviewing && form.locationId ? (
        <div className="p-space-lg bg-surface-container-low flex items-center gap-space-md">
        <select className="flex-1 bg-surface-container-lowest px-space-md py-2 rounded font-body-sm text-body-sm text-on-surface shadow-sm" id="item-search-input" value={form.pickItemId} onChange={(e) => form.setPickItemId(e.target.value)} aria-label="Item to add">
        <option value="">Choose an item to add…</option>
        {form.items.filter((it) => !form.lines.some((l) => l.itemId === String(it.id))).map((it) => (
        <option key={String(it.id)} value={String(it.id)}>{String(it.name ?? '—')} ({String(it.sku ?? '—')})</option>
        ))}
        </select>
        <button className="px-space-md py-2 bg-primary text-on-primary font-body-sm text-body-sm font-medium rounded shadow-sm flex items-center gap-space-xs shrink-0 disabled:opacity-60" type="button" disabled={!form.pickItemId} onClick={() => form.addLine()}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
        <span>Add line</span>
        </button>
        </div>
        ) : null}
        </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-lg">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Total</span>
        <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight" id="summary-total-cost">{form.formatJmd(form.total)}</span>
        <span className="font-label-code text-body-sm text-on-surface font-semibold">{form.lines.length} line{form.lines.length === 1 ? '' : 's'} · {form.units} unit{form.units === 1 ? '' : 's'} · {placeName}</span>
        </div>
        <label className="flex flex-col gap-1.5 font-body-sm text-body-sm font-medium text-on-surface">
        Where did these numbers come from? <span className="text-on-surface-variant font-normal">(optional)</span>
        <textarea className="w-full bg-surface-container-low text-on-surface font-body-sm text-body-sm px-space-md py-2 rounded shadow-sm resize-none" placeholder="e.g. Counted in person on 10 Nov" rows={3} value={form.memo} onChange={(e) => form.setMemo(e.target.value)} />
        </label>
        <div className="flex items-center justify-between p-space-sm bg-surface-container-low rounded">
        <span className="font-caption text-caption text-on-surface-variant">Recorded as</span>
        <span className="font-label-code text-[11px] text-on-surface font-semibold">{operatorLabel}</span>
        </div>
        <div className="bg-surface-container-low rounded-lg p-space-md font-body-sm text-body-sm text-on-surface-variant">
        Saving adds these quantities to {placeName} and records them in Movements. After that, quantities change only through Receive, Issue, Move or Write off.
        </div>
        <div className="flex items-center gap-space-md">
        <button className="w-1/3 py-2.5 px-space-md bg-error-container text-error font-body-md text-body-md rounded font-semibold" type="button" onClick={() => (reviewing ? form.setStep('edit') : p.onClose?.())}>
        {reviewing ? 'Back' : 'Cancel'}
        </button>
        {reviewing ? (
        <button type="button" disabled={!form.canReview || form.submit.saving} onClick={() => void form.post().catch(() => undefined)} className="w-2/3 py-2.5 px-space-md bg-primary text-on-primary font-body-md text-body-md font-semibold rounded shadow-md flex items-center justify-center gap-space-xs disabled:opacity-60">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">verified</span>
        <span>{form.submit.saving ? 'Saving…' : 'Save opening balance'}</span>
        </button>
        ) : (
        <button type="button" disabled={!form.canReview} onClick={() => form.setStep('review')} className="w-2/3 py-2.5 px-space-md bg-primary text-on-primary font-body-md text-body-md font-semibold rounded shadow-md flex items-center justify-center gap-space-xs disabled:opacity-60">
        <span>Review →</span>
        </button>
        )}
        </div>
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
