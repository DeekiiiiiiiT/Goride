import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Loader2, UploadCloud, Fuel } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Alert, AlertDescription } from '../../ui/alert';
import {
  createReconImport,
  isReconUnavailable,
  parseReconImport,
  ReconApiError,
  type ReconImportPreview,
} from '../../../services/reconApi';
import { fuelService } from '../../../services/fuelService';
import type { FuelCard, JaaProgram } from '../../../types/fuel';
import type { FileData } from '../../../utils/csvHelpers';
import {
  buildFuelEntriesFromFiles,
  commitFuelStatementImport,
  fuelDateBounds,
  parseFuelStatementFile,
  selfServeCompanyCodesFromPrograms,
} from '../../../utils/fuelStatementImportFlow';
import type { FuelReconSourceId } from '../../../utils/registerFuelCardWithRecon';
import type { FuelEntry } from '../../../types/fuel';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  weekKey: string;
  sourceId: FuelReconSourceId;
};

export function FuelCardSelfUploader({ isOpen, onClose, onSuccess, weekKey, sourceId }: Props) {
  const [busy, setBusy] = useState(false);
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [preview, setPreview] = useState<ReconImportPreview | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [fuelCards, setFuelCards] = useState<FuelCard[]>([]);
  const [jaaPrograms, setJaaPrograms] = useState<JaaProgram[]>([]);

  const selfServeCodes = useMemo(() => selfServeCompanyCodesFromPrograms(jaaPrograms), [jaaPrograms]);
  const jaaImportOptions = useMemo(
    () =>
      selfServeCodes.size > 0
        ? { allowedCompanyCodes: selfServeCodes, requireCardMatch: true as const }
        : undefined,
    [selfServeCodes],
  );

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const [cards, programs] = await Promise.all([
          fuelService.getFuelCards(),
          fuelService.getJaaPrograms().catch(() => [] as JaaProgram[]),
        ]);
        setFuelCards(cards);
        setJaaPrograms(programs);
      } catch {
        toast.warning('Could not load fuel cards — matching may be incomplete.');
      }
    })();
  }, [isOpen]);

  const reset = () => {
    setFileData(null);
    setEntries([]);
    setPreview(null);
    setImportId(null);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const parsed = await parseFuelStatementFile(file);
        if (parsed.type !== 'fuel_statement') {
          toast.error('Upload a JAA StatementDetails or fuel statement CSV.');
          return;
        }
        if (sourceId === 'fuel_card_self' && selfServeCodes.size === 0) {
          toast.error('Self-serve JAA is not configured for this fleet.');
          return;
        }
        const fuelEntries = await buildFuelEntriesFromFiles([parsed], fuelCards, jaaImportOptions);
        if (fuelEntries.length === 0) {
          toast.warning('No fuel fill rows found in this file.');
          return;
        }
        setFileData(parsed);
        setEntries(fuelEntries);

        const { importId: stagedId } = await createReconImport({
          sourceId,
          weekKey: weekKey.slice(0, 10),
          fileName: file.name,
        });
        setImportId(stagedId);

        try {
          const { preview: serverPreview } = await parseReconImport(stagedId, {
            mode: 'fuel',
            weekKey: weekKey.slice(0, 10),
            rows: fuelEntries as unknown as Record<string, unknown>[],
          });
          setPreview(serverPreview);
        } catch (e) {
          if (!isReconUnavailable(e)) {
            console.warn('[Fuel recon] parse staging failed', e);
          }
          const bounds = fuelDateBounds(fuelEntries);
          setPreview({
            new: fuelEntries.map((_, i) => ({
              rowIndex: i,
              rowId: `${stagedId}:${i}`,
              classification: 'new',
              payload: {},
            })),
            duplicate: { byRef: [], byFingerprint: [] },
            rejected: [],
            spill: [],
            totals_minor: Math.round(
              fuelEntries.reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0) * 100,
            ),
            coverage_start: bounds.min,
            coverage_end: bounds.max,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to parse fuel statement';
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [fuelCards, jaaImportOptions, selfServeCodes.size, sourceId, weekKey],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    disabled: busy,
  });

  const commit = async () => {
    if (!fileData || entries.length === 0) return;
    setBusy(true);
    try {
      const { savedCount } = await commitFuelStatementImport({
        entries,
        fileName: fileData.name,
        sourceId,
        reconImportId: importId || undefined,
        weekKey,
      });
      toast.success(`Imported ${savedCount} fuel fill(s)`);
      handleClose();
      onSuccess();
    } catch (e) {
      if (e instanceof ReconApiError) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : 'Fuel import failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const newCount = preview?.new?.length ?? entries.length;
  const spillCount = preview?.spill?.length ?? 0;
  const rejectedCount = preview?.rejected?.length ?? 0;
  const dupCount =
    (preview?.duplicate?.byRef?.length ?? 0) + (preview?.duplicate?.byFingerprint?.length ?? 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-amber-600" />
            {sourceId === 'fuel_card_self' ? 'Own fuel card statement' : 'Roam fuel card statement'}
          </DialogTitle>
          <DialogDescription>
            Week of {weekKey.slice(0, 10)} — JAA StatementDetails or fuel CSV. Rows outside this week
            are flagged as spill.
          </DialogDescription>
        </DialogHeader>

        {!fileData ? (
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragActive ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-300'
            }`}
          >
            <input {...getInputProps()} />
            {busy ? (
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
            ) : (
              <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />
            )}
            <p className="mt-2 text-sm text-slate-600">Drop statement file or click to browse</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900">{fileData.name}</p>
            <Alert>
              <AlertDescription className="text-sm">
                {newCount} new · {dupCount} duplicate · {rejectedCount} rejected · {spillCount} outside
                week
              </AlertDescription>
            </Alert>
            {preview?.coverage_start && preview?.coverage_end ? (
              <p className="text-xs text-slate-500">
                Coverage {preview.coverage_start} – {preview.coverage_end}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          {fileData ? (
            <Button type="button" onClick={() => void commit()} disabled={busy || newCount === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Commit import
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
