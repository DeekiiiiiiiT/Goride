/**
 * Inline InDrive trip upload for Week Reconciliation sources (R2-24).
 * Inline panel (not Radix Dialog) so Windows file picker is not swallowed.
 */
import React, { useId, useState } from 'react';
import { Loader2, UploadCloud, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import {
  commitIndriveImport,
  previewIndriveImport,
  type CommitIndrivePreview,
} from '../../../utils/commitIndriveImport';

export function IndriveUploadDialog({
  open,
  onOpenChange,
  weekLabel,
  weekKey,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekLabel: string;
  weekKey: string;
  onImported: () => void | Promise<void>;
}) {
  const inputId = useId();
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<CommitIndrivePreview | null>(null);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setFileName('');
    setCsvText('');
    setParsing(false);
    setPreviewBusy(false);
    setBusy(false);
    setDragOver(false);
    setPreview(null);
    setProgress(0);
  };

  const close = () => {
    if (busy) return;
    reset();
    onOpenChange(false);
  };

  const ingestFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('CSV only');
      return;
    }
    setParsing(true);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setFileName(file.name);
      setCsvText(text);
      setParsing(false);
      if (!text.trim()) toast.error('File is empty');
    };
    reader.onerror = () => {
      setParsing(false);
      toast.error(`Failed to read ${file.name}`);
    };
    reader.readAsText(file);
  };

  const runPreview = async () => {
    if (!csvText.trim()) {
      toast.error('Choose an InDrive CSV first');
      return;
    }
    setPreviewBusy(true);
    try {
      const p = await previewIndriveImport(csvText, weekKey);
      setPreview(p);
      if (p.inWeekCount === 0) {
        toast.error(
          p.platformMatchCount === 0
            ? 'No InDrive trips in this file'
            : 'No InDrive trips fall inside this week',
        );
      }
    } catch (e) {
      setPreview(null);
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewBusy(false);
    }
  };

  const runImport = async () => {
    if (!csvText.trim()) {
      toast.error('Choose an InDrive CSV first');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      if (!preview) {
        const p = await previewIndriveImport(csvText, weekKey);
        setPreview(p);
      }
      const result = await commitIndriveImport(csvText, weekKey, setProgress);
      toast.success(
        `InDrive import saved · ${result.successCount.toLocaleString()} trip(s) in week`,
      );
      reset();
      onOpenChange(false);
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'InDrive import failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const pickBlocked = parsing || busy || previewBusy;

  return (
    <div
      className="mt-3 rounded-lg border border-blue-200 bg-white p-4 shadow-sm"
      data-testid="recon-indrive-upload"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">InDrive trip upload</p>
          <p className="mt-1 text-xs text-slate-600">
            Week of {weekLabel}. Only rows with platform InDrive inside this week are imported.
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          disabled={busy}
          aria-label="Close InDrive upload"
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
          ingestFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'relative flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50/60',
          pickBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={pickBlocked}
          className={cn(
            'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0',
            pickBlocked && 'pointer-events-none',
          )}
          onChange={(e) => {
            ingestFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="pointer-events-none flex flex-col items-center">
          {parsing ? (
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-blue-600" />
          ) : (
            <UploadCloud className="mb-2 h-8 w-8 text-blue-600" />
          )}
          <p className="text-sm font-medium text-slate-900">
            {parsing ? 'Reading file…' : 'Drop InDrive CSV here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Single .csv · platform = InDrive</p>
          <span className="mt-4 inline-flex h-10 items-center rounded-md border border-blue-300 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm">
            Browse file…
          </span>
        </div>
      </label>

      {fileName ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800">{fileName}</span>
          <button
            type="button"
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            disabled={busy}
            aria-label={`Remove ${fileName}`}
            onClick={() => {
              setFileName('');
              setCsvText('');
              setPreview(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-medium text-slate-900">Impact preview</p>
          <ul className="mt-1 space-y-0.5">
            <li>Rows parsed: {preview.totalParsed}</li>
            <li>InDrive matches: {preview.platformMatchCount}</li>
            <li>
              In-week trips: {preview.inWeekCount}
              {preview.outsideWeekCount > 0
                ? ` · ${preview.outsideWeekCount} outside week (excluded)`
                : ''}
            </li>
            {preview.errors.length > 0 ? (
              <li className="text-amber-800">{preview.errors.length} validation issue(s)</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {busy ? (
        <p className="mt-2 text-xs text-slate-500">Importing… {progress}%</p>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || previewBusy || parsing || !csvText.trim()}
          onClick={() => void runPreview()}
        >
          {previewBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Preview impact
        </Button>
        <Button
          type="button"
          className="bg-blue-700 hover:bg-blue-800"
          disabled={busy || parsing || !csvText.trim()}
          onClick={() => void runImport()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {busy ? 'Saving…' : 'Save InDrive trips'}
        </Button>
      </div>
    </div>
  );
}
