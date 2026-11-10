/** Import items — real columns, real creates (IV-13, IV-14, IV-16). */
import { formatJmd } from '../inventoryFormat';
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { IMPORT_COLUMNS, useGapImportItemsForm } from './useGapImportItemsForm';

export function GapImportItems(p: { onClose?: () => void }) {
  const form = useGapImportItemsForm(p.onClose);
  const problems = form.rows.filter((r) => r.problem);
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Import items">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="w-full max-w-[960px] mx-auto px-space-lg py-space-xl flex flex-col gap-space-lg">

        <div className="flex flex-col gap-space-xs">
        <h2 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Import items</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Adds items to your list. Quantities stay at 0 until you use Opening balances or Receive.</p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <label className="flex-1 flex items-center gap-space-sm p-space-md rounded-lg bg-surface-container-low cursor-pointer hover:bg-surface-container">
        <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-primary">upload_file</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">{form.fileName || 'Choose a CSV file'}</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void form.onFile(e.target.files?.[0] ?? null)} aria-label="CSV file" />
        </label>
        <div className="flex items-center gap-space-sm">
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center gap-1" onClick={() => form.downloadSampleTemplate()}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
        Download sample CSV
        </button>
        <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold" onClick={() => form.loadStarter()}>
        Use starter list
        </button>
        </div>
        </div>
        <p className="font-caption text-caption text-on-surface-variant">Columns: <span className="font-label-code">{IMPORT_COLUMNS.join(', ')}</span>. Tracking is &quot;quantity&quot; or &quot;serial&quot;; cost is in J$ and optional.</p>
        </div>

        {form.rows.length ? (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-space-lg py-space-sm bg-surface-container-low flex items-center justify-between font-caption text-caption">
        <span className="font-semibold text-on-surface">{form.good.length} to add · {problems.length} skipped</span>
        {problems.length ? (
        <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest text-on-surface font-semibold" onClick={() => form.downloadProblemRows()}>Download skipped rows</button>
        ) : null}
        </div>
        <table className="w-full text-left font-body-sm text-body-sm">
        <thead className="font-caption text-caption uppercase text-on-surface-variant">
        <tr>
        <th className="py-space-sm px-space-lg">Code</th>
        <th className="py-space-sm px-space-md">Name</th>
        <th className="py-space-sm px-space-md">Tracking</th>
        <th className="py-space-sm px-space-md text-right">Cost</th>
        <th className="py-space-sm px-space-lg">Result</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
        {form.rows.map((r) => (
        <tr key={`${r.line}-${r.sku}`} className={r.problem ? 'opacity-60' : ''}>
        <td className="py-space-sm px-space-lg font-label-code">{r.sku || '—'}</td>
        <td className="py-space-sm px-space-md">{r.name || '—'}</td>
        <td className="py-space-sm px-space-md">{r.tracking}</td>
        <td className="py-space-sm px-space-md text-right font-label-price">{r.cost != null ? formatJmd(r.cost) : '—'}</td>
        <td className={`py-space-sm px-space-lg ${r.problem ? 'text-error' : 'text-on-surface-variant'}`}>{r.problem ?? 'Will be added'}</td>
        </tr>
        ))}
        </tbody>
        </table>
        </div>
        ) : null}

        {form.result ? (
        <div className={`rounded-xl p-space-md font-body-sm text-body-sm ${form.result.failed.length ? 'bg-error-container/40 text-on-surface' : 'bg-surface-container-low text-on-surface'}`} role="status">
        Added {form.result.created}, skipped {form.result.skipped}.
        {form.result.failed.length ? <> Failed: {form.result.failed.join('; ')}</> : null}
        </div>
        ) : null}

        <div className="flex items-center justify-end gap-space-sm">
        <button type="button" className="px-space-lg py-2 rounded-lg bg-error-container text-error font-body-sm text-body-sm font-semibold" onClick={() => p.onClose?.()}>Cancel</button>
        <button type="button" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.importItems().catch(() => undefined)} className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow-sm disabled:opacity-60">
        {form.submit.saving ? 'Adding…' : `Add ${form.good.length} item${form.good.length === 1 ? '' : 's'}`}
        </button>
        </div>
        </div>
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
