/**
 * In-place Uber CSV re-import on Close Week (no navigate to Imports).
 *
 * Not a Radix Dialog: modal Dialog sets body { pointer-events: none } and often
 * swallows / hides the Windows file picker while the drop zone looks "greyed out".
 * Playwright confirmed the input works; the modal layer was the product failure.
 */
import React, { useCallback, useId, useState } from 'react';
import Papa from 'papaparse';
import { Loader2, UploadCloud, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import {
  detectFileType,
  validateFile,
  extractReportDate,
  type FileData,
} from '../../utils/csvHelpers';
import {
  commitUberImportFromFiles,
  isUberImportFileType,
} from '../../utils/commitUberImportFromFiles';

function fileTypeLabel(type: FileData['type']): string {
  switch (type) {
    case 'uber_payment_driver':
      return 'Driver payments (statement cash)';
    case 'uber_payment':
      return 'Payment lines (trip cash)';
    case 'uber_trip':
      return 'Trip activity';
    case 'uber_payment_org':
      return 'Org payments';
    default:
      return type.replace(/^uber_/, '').replace(/_/g, ' ');
  }
}

export function CloseWeekUberReimportDialog({
  open,
  onOpenChange,
  weekLabel,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekLabel: string;
  onImported: () => void | Promise<void>;
}) {
  const inputId = useId();
  const [files, setFiles] = useState<FileData[]>([]);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFiles([]);
    setParsing(false);
    setBusy(false);
    setDragOver(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onOpenChange(false);
  };

  const ingestFiles = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setParsing(true);
    const next: FileData[] = [];
    let done = 0;

    const finishOne = () => {
      done += 1;
      if (done >= acceptedFiles.length) {
        setFiles((prev) => [...prev, ...next]);
        setParsing(false);
        if (next.length === 0) {
          toast.error(
            'No Uber CSVs recognized — use payments_driver / payments_transaction / trip_activity.',
          );
        }
      }
    };

    for (const file of acceptedFiles) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.error(`${file.name}: CSV only`);
        finishOne();
        continue;
      }
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields?.length) {
            finishOne();
            return;
          }
          const type = detectFileType(results.meta.fields, file.name);
          if (!isUberImportFileType(type)) {
            toast.message(`${file.name}: skipped (not an Uber export)`);
            finishOne();
            return;
          }
          const fileData: FileData = {
            id: Math.random().toString(36).slice(2, 11),
            name: file.name,
            rows: results.data as FileData['rows'],
            headers: results.meta.fields,
            type,
          };
          fileData.validationErrors = validateFile(fileData);
          fileData.reportDate = extractReportDate(fileData);
          next.push(fileData);
          finishOne();
        },
        error: () => {
          toast.error(`Failed to parse ${file.name}`);
          finishOne();
        },
      });
    }
  }, []);

  const runImport = async () => {
    if (files.length === 0) {
      toast.error('Choose at least one Uber CSV first');
      return;
    }
    setBusy(true);
    try {
      const result = await commitUberImportFromFiles(files);
      toast.success(
        `Imported ${result.tripCount} trip(s) · statement cash $${result.statementCashTotal.toFixed(2)}`,
      );
      reset();
      onOpenChange(false);
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uber re-import failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const pickBlocked = parsing || busy;

  return (
    <div
      className="mt-3 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm"
      data-testid="close-week-uber-reimport"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Re-import Uber bundle</p>
          <p className="mt-1 text-xs text-slate-600">
            Week of {weekLabel}. Add Uber CSVs here — especially{' '}
            <span className="font-medium text-slate-800">payments_driver</span> (statement cash) and{' '}
            <span className="font-medium text-slate-800">payments_transaction</span> (trip cash).
            Stays on this screen, then Close Week refreshes.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          disabled={busy}
          aria-label="Close re-import"
          onClick={close}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!pickBlocked) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!pickBlocked) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (pickBlocked) return;
          ingestFiles(Array.from(e.dataTransfer.files || []));
        }}
        className={cn(
          'relative flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragOver
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-indigo-300 bg-white hover:border-indigo-500 hover:bg-indigo-50/60',
          pickBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={pickBlocked}
          className={cn(
            'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0',
            pickBlocked && 'pointer-events-none',
          )}
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            ingestFiles(list);
            e.target.value = '';
          }}
        />
        <div className="pointer-events-none flex flex-col items-center">
          {parsing ? (
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-indigo-600" />
          ) : (
            <UploadCloud className="mb-2 h-8 w-8 text-indigo-600" />
          )}
          <p className="text-sm font-medium text-slate-900">
            {parsing ? 'Reading files…' : 'Drop Uber CSVs here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Multiple files OK · .csv only</p>
          <span className="mt-4 inline-flex h-10 items-center rounded-md border border-indigo-300 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm">
            Browse files…
          </span>
        </div>
      </label>

      {files.length > 0 ? (
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-xs">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate font-medium text-slate-800">{f.name}</span>
                <span className="shrink-0 text-slate-500">{fileTypeLabel(f.type)}</span>
              </span>
              <button
                type="button"
                className="relative z-20 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                disabled={busy}
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-indigo-700 hover:bg-indigo-800"
          disabled={busy || parsing || files.length === 0}
          onClick={() => void runImport()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {busy ? 'Importing…' : 'Import and refresh week'}
        </Button>
      </div>
    </div>
  );
}
