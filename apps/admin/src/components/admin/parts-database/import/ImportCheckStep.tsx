// Stitch: dominion-redesign/parts_import_check_results
import { ImportCheckKpis } from "./ImportCheckKpis";
import { ImportRowTable } from "./ImportRowTable";

export { ImportCheckKpis } from "./ImportCheckKpis";
export { ImportRowTable } from "./ImportRowTable";
export { ImportRowExpanded } from "./ImportRowExpanded";

export function ImportCheckStep({
  batchCode,
  fileName,
  areaName,
  rows,
  validCount,
  onPromote,
  promoting,
  onExportRaw,
  onCheckAgain,
  onDownloadFailed,
  onPatchRow,
}: {
  batchCode: string;
  fileName?: string;
  areaName?: string;
  rows: Array<Record<string, unknown>>;
  validCount: number;
  onPromote: () => void;
  promoting: boolean;
  onExportRaw?: () => void;
  onCheckAgain?: () => void;
  onDownloadFailed?: () => void;
  onPatchRow?: (lineNo: number) => void;
}) {
  const errors = rows.filter((r) => r.status === "error").length;
  const total = rows.length;
  const titleFile = fileName ?? "import.csv";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="text-secondary">Find parts</button>
        <button type="button" className="text-secondary">Full database</button>
        <button type="button" className="font-semibold text-primary">Import CSV</button>
        <span className="font-semibold text-on-surface">Parts database</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold text-on-surface">Check {titleFile}</h2>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs font-semibold text-secondary">Close</button>
          <span className="text-xs font-mono text-outline">{batchCode}</span>
        </div>
      </div>
      {areaName ? (
        <p className="text-xs font-mono text-secondary">{areaName} · {total} rows</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="text-xs font-semibold text-secondary" onClick={onExportRaw}>Export raw CSV</button>
        <button type="button" className="text-xs font-semibold text-secondary">Audit trail</button>
        <button type="button" className="text-xs font-semibold text-secondary" onClick={onCheckAgain}>Check again</button>
        <button type="button" className="text-xs font-semibold text-secondary" onClick={onDownloadFailed}>Download failed rows</button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="px-3 py-1 rounded-lg bg-primary-container text-on-primary font-semibold">All ({total})</button>
        <button type="button" className="px-3 py-1 rounded-lg bg-surface-container-low">Ready ({validCount})</button>
        <button type="button" className="px-3 py-1 rounded-lg bg-surface-container-low">Ready with label (2)</button>
        <button type="button" className="px-3 py-1 rounded-lg bg-surface-container-low text-error">Error ({errors})</button>
        <button type="button" className="px-3 py-1 rounded-lg bg-surface-container-low">Duplicate (2)</button>
        <button type="button" className="px-3 py-1 rounded-lg bg-surface-container-low">Unchanged (0)</button>
        <span className="font-mono text-outline px-2">Ready 18</span>
        <span className="font-mono text-outline px-2">Error 3</span>
        <span className="font-mono text-outline px-2">Duplicate 2</span>
        <span className="font-mono text-outline px-2">Ready with label 2</span>
        <span className="font-mono text-outline px-2">Unchanged 0</span>
      </div>
      <ImportCheckKpis valid={validCount} total={total} errors={errors} />
      <ImportRowTable rows={rows} onPatchRow={onPatchRow} />
      <div className="sticky bottom-0 bg-surface-container-lowest border-t border-outline-variant/30 p-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="text-sm text-secondary" onClick={onCheckAgain}>Check again</button>
        <button
          type="button"
          disabled={promoting || validCount === 0}
          className="h-10 px-6 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-50"
          onClick={onPromote}
        >
          {promoting ? "Importing…" : `Import ${validCount} rows arrow_forward`}
        </button>
      </div>
    </div>
  );
}
