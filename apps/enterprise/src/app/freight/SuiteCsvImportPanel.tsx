import { useRef, useState } from 'react';
import { useImportSuites } from '@/app/hooks/useFreight';
import {
  parseSuiteCsv,
  SUITE_CSV_TEMPLATE,
  type SuiteImportRow,
} from '@/app/freight/suiteCsvImport';

/** Suites page CSV import — preview then upsert via /suites/import. */
export function SuiteCsvImportPanel({
  embedded,
  onSuccess,
}: {
  /** When true, omit outer card chrome (parent overlay already provides it). */
  embedded?: boolean;
  /** Fired after a successful import (parent can swap to a success screen). */
  onSuccess?: (message: string) => void;
} = {}) {
  const importMut = useImportSuites();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<SuiteImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [resultMsg, setResultMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(
    null,
  );

  function downloadTemplate() {
    const blob = new Blob([SUITE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roam-suites-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | null) {
    setResultMsg(null);
    setPreview([]);
    setParseErrors([]);
    setFileName(file?.name ?? null);
    if (!file) return;
    const text = await file.text();
    const parsed = parseSuiteCsv(text);
    setParseErrors(parsed.errors);
    setPreview(parsed.rows);
    if (!parsed.rows.length && !parsed.errors.length) {
      setParseErrors(['No valid suite rows found in this file.']);
    }
  }

  async function onImport() {
    if (!preview.length) return;
    setResultMsg(null);
    try {
      const res = await importMut.mutateAsync(
        preview.map((r) => ({
          suiteCode: r.suiteCode,
          contactName: r.contactName,
          contactPhone: r.contactPhone,
          contactEmail: r.contactEmail,
          trn: r.trn,
          clientName: r.clientName,
          pickupBranch: r.pickupBranch,
          defaultFulfillmentMode: r.defaultFulfillmentMode,
          defaultAssigneeType: r.defaultAssigneeType,
          deliveryAddress: r.deliveryAddress,
        })),
      );
      const message =
        `Imported ${res.total} suite(s): ${res.created} new, ${res.updated} updated.` +
        (res.warnings?.length ? ` Notes: ${res.warnings.slice(0, 3).join(' ')}` : '');
      setPreview([]);
      setParseErrors([]);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
      if (onSuccess) {
        onSuccess(message);
        return;
      }
      setResultMsg({ tone: 'ok', text: message });
    } catch (err) {
      setResultMsg({
        tone: 'err',
        text: (err as Error).message || 'Import failed.',
      });
    }
  }

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-3 rounded-xl border border-slate-200 bg-white p-6'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div>
            <h2 className="text-sm font-semibold">Import customers (CSV)</h2>
            <p className="mt-1 text-xs text-slate-500">
              Upload mailbox codes from your freight site. Re-import updates matching suite codes.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={downloadTemplate}
          className={`text-xs font-medium text-amber-800 underline-offset-2 hover:underline ${
            embedded ? 'ml-auto' : ''
          }`}
        >
          Download template
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Parse notes</p>
          <ul className="mt-1 list-disc pl-4">
            {parseErrors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {parseErrors.length > 8 && <li>…and {parseErrors.length - 8} more</li>}
          </ul>
        </div>
      )}

      {preview.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Suite</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Fulfillment</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 12).map((r) => (
                <tr key={r.suiteCode} className="border-t border-slate-50">
                  <td className="px-3 py-1.5 font-medium">{r.suiteCode}</td>
                  <td className="px-3 py-1.5">{r.contactName || '—'}</td>
                  <td className="px-3 py-1.5">{r.contactPhone || '—'}</td>
                  <td className="px-3 py-1.5">{r.defaultFulfillmentMode.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 12 && (
            <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              Showing 12 of {preview.length} rows
            </p>
          )}
        </div>
      )}

      {resultMsg && (
        <p
          className={
            resultMsg.tone === 'ok'
              ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
              : 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
          }
        >
          {resultMsg.text}
        </p>
      )}

      <button
        type="button"
        disabled={!preview.length || importMut.isPending}
        onClick={() => void onImport()}
        className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
      >
        {importMut.isPending
          ? 'Importing…'
          : preview.length
            ? `Import ${preview.length} suite(s)`
            : 'Import suites'}
      </button>
    </div>
  );
}
