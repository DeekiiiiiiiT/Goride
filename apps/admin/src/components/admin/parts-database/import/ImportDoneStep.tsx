// Stitch: dominion-redesign/parts_import_done
import { MaterialIcon } from "./MaterialIcon";
import type { ImportPromoteResult } from "./partsImportApi";

export { ImportBatchRecordsTable } from "./ImportBatchRecordsTable";

export function ImportDoneStep({
  areaName,
  batchCode,
  fileName,
  templateVersion,
  refreshWarning,
  promoteResult,
  batch,
  onRefresh,
  onLedger,
  onDataQuality,
  onImportMore,
  onBackToAreas,
  onUndoIngestion,
  shaPrefix,
  signedBy,
  signedRole,
  commitTime,
}: {
  areaName: string;
  batchCode: string;
  fileName?: string;
  templateVersion: number;
  refreshWarning: string | null;
  promoteResult?: ImportPromoteResult | null;
  batch?: Record<string, unknown>;
  onRefresh: () => void;
  onLedger: () => void;
  onDataQuality: () => void;
  onImportMore?: () => void;
  onBackToAreas?: () => void;
  onUndoIngestion?: () => void;
  shaPrefix: string;
  signedBy?: string;
  signedRole?: string;
  commitTime?: string;
}) {
  const partsCreated = promoteResult?.partsCreated ?? Number(batch?.parts_created ?? 0);
  const fitsCreated = promoteResult?.fitsCreated ?? Number(batch?.fits_created ?? 0);
  const partsUpdated = promoteResult?.partsUpdated ?? Number(batch?.parts_updated ?? 0);
  const matchesCreated = promoteResult?.matchesCreated;
  const matchesNeedChecking = promoteResult?.matchesNeedChecking;
  const rowsError = Number(batch?.rows_error ?? 0);
  const rowsDuplicate = Number(batch?.rows_duplicate ?? 0);
  const importedRows = Number(batch?.rows_valid ?? 0) + Number(batch?.rows_labelled ?? 0);
  const leftOut = rowsError + rowsDuplicate;
  const when = commitTime ?? (batch?.promoted_at ? new Date(String(batch.promoted_at)).toUTCString() : new Date().toUTCString());

  return (
    <div className="space-y-4">
      <p className="text-xs font-mono uppercase text-outline flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#10b981]" />
        INGESTION PIPELINE V{templateVersion} / ● DB TRANSACTION COMMITTED
      </p>
      <h1 className="text-xl font-semibold text-on-surface">Import Complete — {areaName} Domain Ingested</h1>
      <p className="text-sm text-on-surface-variant">
        Batch #{batchCode} committed to core cluster. Audit log entry recorded in ledger.
      </p>
      <div className="flex flex-wrap gap-2 text-[10px] font-mono">
        <span className="px-2 py-1 rounded bg-surface-container-high">TX ID: #{batchCode}</span>
        <span className="px-2 py-1 rounded bg-surface-container-high">INDEX: +{fitsCreated} FITMENTS</span>
        <span className="px-2 py-1 rounded bg-surface-container-high">{when}</span>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#dcfce7] flex items-center justify-center text-[#166534]">
            <MaterialIcon name="check_circle" className="text-[28px]" filled />
          </div>
          <div className="space-y-2 flex-1">
            <h2 className="text-lg font-semibold">Imported {importedRows || partsCreated + fitsCreated} rows into {areaName}</h2>
            {fileName ? (
              <span className="inline-flex text-xs font-mono px-2 py-1 rounded bg-surface-container-high">
                {fileName} · Batch #{batchCode}
              </span>
            ) : null}
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Parts created
            </span>
            <span>
              <span className="font-mono mr-2">{partsCreated}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#dcfce7] text-[#166534]">+{partsCreated} NEW</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Fitments linked
            </span>
            <span>
              <span className="font-mono mr-2">{fitsCreated}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary-fixed/30 text-primary">+{fitsCreated} FITMENTS</span>
            </span>
          </li>
          {matchesCreated != null ? (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                Auto-match rows touched
              </span>
              <span className="font-mono text-sm">
                {matchesCreated} matches created · {matchesNeedChecking ?? 0} need checking
              </span>
            </li>
          ) : null}
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-outline" />
              Master records updated
            </span>
            <span>
              <span className="font-mono mr-2">{partsUpdated}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high">{partsUpdated} UNCHANGED</span>
            </span>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              Left out records ({rowsError} errors, {rowsDuplicate} duplicates)
            </span>
            <span>
              <span className="font-mono mr-2">{leftOut}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-error-container text-error">{leftOut} EXCLUDED</span>
            </span>
          </li>
        </ul>
        <p className="text-sm text-on-surface-variant flex items-start gap-2">
          <MaterialIcon name="shield" className="text-[18px] text-primary shrink-0" />
          New parts show as <code className="font-mono text-xs bg-surface-container-high px-1 rounded">Needs checking</code> until
          confirmed in the Data Quality queue.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 px-5 rounded-xl bg-primary text-on-primary font-semibold inline-flex items-center gap-1"
            onClick={onDataQuality}
          >
            View in Data quality
            <MaterialIcon name="arrow_forward" className="text-[18px]" />
          </button>
          <button type="button" className="h-10 px-5 rounded-xl border border-outline-variant font-semibold" onClick={onImportMore}>
            ⊕ Import more {areaName} parts
          </button>
          <button type="button" className="h-10 px-5 rounded-xl text-secondary font-semibold" onClick={onBackToAreas}>
            Back to areas
          </button>
        </div>
        <p className="text-[11px] font-mono text-outline pt-2 border-t border-outline-variant/30">
          LEDGER HASH: 0x{shaPrefix || "—"} · SIGNED: {signedBy ?? "Staff"} ({signedRole ?? "catalog editor"})
        </p>
      </div>

      {refreshWarning ? (
        <div className="rounded-xl bg-[#fef3c7] border border-[#f59e0b]/30 p-4 space-y-2">
          <p className="text-sm font-semibold text-[#92400e]">Find parts hasn&apos;t refreshed yet.</p>
          <p className="text-sm text-[#78350f]">{refreshWarning}</p>
          <button
            type="button"
            className="h-9 px-4 rounded-xl bg-[#ea580c] text-white font-semibold text-sm"
            onClick={onRefresh}
          >
            Refresh now
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="font-semibold text-primary" onClick={onLedger}>
          View Import Ledger (Batch #{batchCode})
        </button>
        {onUndoIngestion ? (
          <button type="button" className="font-semibold text-error" onClick={onUndoIngestion}>
            Revert / Undo Ingestion
          </button>
        ) : null}
      </div>
    </div>
  );
}
