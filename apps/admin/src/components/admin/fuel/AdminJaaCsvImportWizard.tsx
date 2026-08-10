/**
 * Preview → confirm wizard for JAA Raw CSV before anything is saved.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import type { FuelEntry } from '../../../types/fuel';
import type { JaaRowKind } from '../../../utils/jaaRawFuelCsvParser';
import { resolveJaaStationDescription } from '../../../utils/jaaRawFuelCsvParser';

export type JaaPreviewUnmatched = {
  cardCode: string;
  companyCode: string;
  receiptNumber: string;
  amount: number;
  liters?: number;
  fuelAmount?: number;
  transDate?: string;
  vendor?: string;
  fuelType?: string;
  response?: string;
  classification: JaaRowKind;
};

export type JaaCsvImportPreview = {
  fileName: string;
  parsedRows: number;
  skippedDuplicates: number;
  matchedEntries: FuelEntry[];
  unmatchedRows: JaaPreviewUnmatched[];
};

type Props = {
  open: boolean;
  preview: JaaCsvImportPreview | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    matchedEntries: FuelEntry[];
    unmatchedRows: JaaPreviewUnmatched[];
  }) => void;
};

function unmatchedKey(row: JaaPreviewUnmatched, index: number): string {
  return `${row.cardCode}|${row.receiptNumber}|${row.transDate}|${row.amount}|${index}`;
}

function money(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function liters(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return '—';
  return Number(n).toFixed(2);
}

function kindLabel(kind?: string) {
  if (kind === 'fee') return 'Fee';
  if (kind === 'declined') return 'Declined';
  if (kind === 'approved_fuel') return 'Fuel';
  return kind || '—';
}

/** Shared JAA statement columns for Matched / Unmatched review. */
function StatementColumnHeaders({ leadingKeep }: { leadingKeep?: boolean }) {
  return (
    <tr>
      {leadingKeep ? <th className="px-2 py-2 w-10 sticky left-0 bg-slate-50 z-10">Keep</th> : null}
      <th className="px-2 py-2 whitespace-nowrap" title="Match to the fuel card in Roam">
        Card code
      </th>
      <th className="px-2 py-2 whitespace-nowrap">Kind</th>
      <th className="px-2 py-2 text-right whitespace-nowrap" title="Money on the statement">
        Amount
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="When it happened">
        Date
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="Approved vs declined / limit hit">
        Response
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="Gas station (real merchant)">
        Station
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="Fee / issuer description">
        Description
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="Fuel grade (E10-87, etc.)">
        Fuel type
      </th>
      <th className="px-2 py-2 text-right whitespace-nowrap" title="Fuel $ (vs fees)">
        Fuel $
      </th>
      <th className="px-2 py-2 text-right whitespace-nowrap" title="Liters">
        Liters
      </th>
      <th className="px-2 py-2 whitespace-nowrap" title="Dedupe / unique JAA transaction id">
        Receipt
      </th>
    </tr>
  );
}

export function AdminJaaCsvImportWizard({
  open,
  preview,
  submitting,
  onOpenChange,
  onSubmit,
}: Props) {
  const [wizardTab, setWizardTab] = useState<'matched' | 'unmatched'>('matched');
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!preview) return;
    setWizardTab(preview.matchedEntries.length ? 'matched' : 'unmatched');
    setSelectedUnmatched(
      new Set(preview.unmatchedRows.map((r, i) => unmatchedKey(r, i))),
    );
  }, [preview]);

  const selectedUnmatchedRows = useMemo(() => {
    if (!preview) return [];
    return preview.unmatchedRows.filter((r, i) =>
      selectedUnmatched.has(unmatchedKey(r, i)),
    );
  }, [preview, selectedUnmatched]);

  const toggleUnmatched = (key: string) => {
    setSelectedUnmatched((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllUnmatched = (on: boolean) => {
    if (!preview) return;
    setSelectedUnmatched(
      on
        ? new Set(preview.unmatchedRows.map((r, i) => unmatchedKey(r, i)))
        : new Set(),
    );
  };

  if (!preview) return null;

  const matchedCount = preview.matchedEntries.length;
  const unmatchedCount = preview.unmatchedRows.length;
  const keepUnmatched = selectedUnmatchedRows.length;
  const dropUnmatched = unmatchedCount - keepUnmatched;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[min(1400px,96vw)] max-w-[min(1400px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,96vw)]">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-100">
          <DialogTitle>Review CSV import</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-slate-700">{preview.fileName}</span>
            {' · '}
            {preview.parsedRows} rows parsed
            {preview.skippedDuplicates
              ? ` · ${preview.skippedDuplicates} duplicate statement receipt(s) skipped`
              : ''}
            {' · '}
            nothing is saved until you submit.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={() => setWizardTab('matched')}
            className={`px-3 py-1.5 text-sm rounded-md ${
              wizardTab === 'matched'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Matched ({matchedCount})
          </button>
          <button
            type="button"
            onClick={() => setWizardTab('unmatched')}
            className={`px-3 py-1.5 text-sm rounded-md ${
              wizardTab === 'unmatched'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Unmatched ({unmatchedCount})
          </button>
          <p className="text-xs text-slate-500 self-center ml-auto">
            Will import {matchedCount} matched
            {keepUnmatched ? ` + queue ${keepUnmatched} unmatched` : ''}
            {dropUnmatched > 0 ? ` · drop ${dropUnmatched}` : ''}
          </p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-3 min-h-[280px]">
          {wizardTab === 'matched' && (
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-max min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] text-slate-500 uppercase tracking-wide">
                  <StatementColumnHeaders />
                </thead>
                <tbody>
                  {preview.matchedEntries.map((e) => {
                    const meta = (e.metadata || {}) as Record<string, unknown>;
                    const station = String(meta.jaaStation || e.location || '');
                    const description = String(meta.jaaDescription || '');
                    return (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                          {String(meta.jaaCardCode || '—')}
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          {kindLabel(String(meta.jaaRowKind || ''))}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                          {money(e.amount)}
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          {e.date}
                          {e.time ? ` ${e.time}` : ''}
                        </td>
                        <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={String(meta.jaaResponse || '')}>
                          {String(meta.jaaResponse || '—')}
                        </td>
                        <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={station}>
                          {station || '—'}
                        </td>
                        <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={description}>
                          {description || '—'}
                        </td>
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          {String(meta.jaaFuelType || '—')}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                          {money(meta.jaaFuelAmount as number | undefined)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                          {liters(e.liters)}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                          {String(meta.jaaReceiptNumber || '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!matchedCount && (
                <p className="p-4 text-sm text-slate-500">
                  No rows matched existing inventory cards.
                </p>
              )}
            </div>
          )}

          {wizardTab === 'unmatched' && (
            <div className="space-y-2">
              {unmatchedCount > 0 && (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => selectAllUnmatched(true)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => selectAllUnmatched(false)}
                  >
                    Clear all
                  </button>
                  <span className="text-slate-500">
                    Uncheck rows you don’t want in the Unmatched queue.
                  </span>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-max min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] text-slate-500 uppercase tracking-wide">
                    <StatementColumnHeaders leadingKeep />
                  </thead>
                  <tbody>
                    {preview.unmatchedRows.map((r, i) => {
                      const key = unmatchedKey(r, i);
                      const checked = selectedUnmatched.has(key);
                      const split = resolveJaaStationDescription(r.classification, r.vendor);
                      return (
                        <tr
                          key={key}
                          className={`border-t border-slate-100 ${
                            checked ? '' : 'opacity-50 bg-slate-50'
                          }`}
                        >
                          <td className="px-2 py-2 sticky left-0 bg-inherit z-10">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUnmatched(key)}
                              className="h-4 w-4"
                              aria-label={`Keep ${r.cardCode} ${r.receiptNumber}`}
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                            {r.cardCode}
                          </td>
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {kindLabel(r.classification)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                            {money(r.amount)}
                          </td>
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {r.transDate || '—'}
                          </td>
                          <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={r.response || ''}>
                            {r.response || '—'}
                          </td>
                          <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={split.station || ''}>
                            {split.station || '—'}
                          </td>
                          <td className="px-2 py-2 text-xs max-w-[160px] truncate" title={split.description || ''}>
                            {split.description || '—'}
                          </td>
                          <td className="px-2 py-2 text-xs whitespace-nowrap">
                            {r.fuelType || '—'}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                            {money(r.fuelAmount)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                            {liters(r.liters)}
                          </td>
                          <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                            {r.receiptNumber || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!unmatchedCount && (
                  <p className="p-4 text-sm text-slate-500">
                    Every row matched an inventory card.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || (matchedCount === 0 && keepUnmatched === 0)}
            onClick={() =>
              onSubmit({
                matchedEntries: preview.matchedEntries,
                unmatchedRows: selectedUnmatchedRows,
              })
            }
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit import'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
