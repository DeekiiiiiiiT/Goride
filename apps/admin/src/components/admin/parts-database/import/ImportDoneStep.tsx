// Stitch: dominion-redesign/parts_import_done
export { ImportBatchRecordsTable } from "./ImportBatchRecordsTable";

export function ImportDoneStep({
  areaName,
  batchCode,
  templateVersion,
  refreshWarning,
  importedCount,
  onRefresh,
  onLedger,
  onDataQuality,
  onImportMore,
  onBackToAreas,
  shaPrefix,
}: {
  areaName: string;
  batchCode: string;
  templateVersion: number;
  refreshWarning: string | null;
  importedCount?: number;
  onRefresh: () => void;
  onLedger: () => void;
  onDataQuality: () => void;
  onImportMore?: () => void;
  onBackToAreas?: () => void;
  shaPrefix: string;
  rows?: Array<Record<string, unknown>>;
}) {
  const count = importedCount ?? 0;
  return (
    <div className="space-y-4">
      <p className="text-xs font-mono uppercase text-outline">INGESTION PIPELINE V{templateVersion} / DB TRANSACTION COMMITTED</p>
      <h1 className="text-xl font-semibold text-on-surface">Import Complete — {areaName} Domain Ingested</h1>
      <h2 className="text-lg font-semibold text-on-surface">Imported {count} rows into {areaName}</h2>
      <p className="text-sm text-on-surface-variant">Batch {batchCode} committed to core cluster. Audit log entry recorded in ledger.</p>
      {refreshWarning ? (
        <div className="rounded-xl bg-tertiary-fixed/40 p-4 space-y-2">
          <span className="text-xs font-mono font-semibold">NOT REFRESHED</span>
          <p className="text-sm">Find parts hasn&apos;t refreshed yet. {refreshWarning}</p>
          <button type="button" className="text-sm font-semibold text-secondary" onClick={onRefresh}>Refresh now</button>
        </div>
      ) : (
        <span className="inline-flex text-xs font-mono px-2 py-1 rounded bg-tertiary-fixed">SYNC ACCELERATED</span>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="text-sm font-semibold text-secondary flex items-center gap-1" onClick={onDataQuality}>
          View in Data quality arrow_forward
        </button>
        <button type="button" className="text-sm font-semibold text-secondary" onClick={onLedger}>View Import Ledger ({batchCode})</button>
        <button type="button" className="text-sm font-semibold text-primary" onClick={onImportMore}>
          Import more {areaName} parts
        </button>
        <button type="button" className="text-sm font-semibold text-secondary" onClick={onBackToAreas}>
          Back to areas
        </button>
      </div>
      <p className="text-[11px] font-mono text-outline">LEDGER HASH {shaPrefix} · Checksum SHA256</p>
    </div>
  );
}
