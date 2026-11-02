// Stitch: dominion-redesign/parts_import_states
export function ImportStates({
  mode,
  areaName,
  fileName,
  checkProgress,
  onRequestAccess,
  onViewJobs,
  onCancelCheck,
  onRetry,
  onChooseAnother,
  onStartImport,
  onUndoImport,
}: {
  mode: "empty" | "checking" | "no-access" | "file-failed";
  areaName?: string;
  fileName?: string;
  checkProgress?: { checked: number; total: number };
  detail?: string;
  onRequestAccess?: () => void;
  onViewJobs?: () => void;
  onCancelCheck?: () => void;
  onRetry?: () => void;
  onChooseAnother?: () => void;
  onStartImport?: () => void;
  onUndoImport?: () => void;
}) {
  const area = areaName ?? "Brakes";

  if (mode === "no-access") {
    return (
      <div className="rounded-xl border border-outline-variant p-8 space-y-3 max-w-lg">
        <h2 className="text-lg font-semibold">{"You don't have import access"}</h2>
        <p className="text-sm text-on-surface-variant">Ask the owner to give you the Catalog editor role.</p>
        <p className="text-sm font-semibold">Elevated Role Required</p>
        <button type="button" className="w-full h-9 rounded-lg bg-surface-container-high font-semibold" onClick={onRequestAccess}>
          Request access from Owner (Deeki T)
        </button>
      </div>
    );
  }

  if (mode === "checking") {
    const checked = checkProgress?.checked ?? 0;
    const total = checkProgress?.total ?? 0;
    const label = fileName ?? "import.csv";
    return (
      <div className="rounded-xl bg-surface-container-low p-6 space-y-3">
        <h2 className="text-lg font-semibold">Checking {label}</h2>
        <p className="text-xs font-mono text-primary">
          Checking {checked.toLocaleString()} of {total.toLocaleString()} rows…
        </p>
        <p className="text-xs font-mono">1 Parse → 2 Validate → 3 Fitment matrix → 4 Commit</p>
        <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary-container h-full rounded-full transition-all"
            style={{ width: total ? `${Math.min(100, Math.round((100 * checked) / total))}%` : "12%" }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm font-semibold text-secondary flex-1" onClick={onViewJobs}>
            View background jobs
          </button>
          <button type="button" className="text-sm text-secondary" onClick={onCancelCheck}>Cancel check</button>
        </div>
      </div>
    );
  }

  if (mode === "file-failed") {
    return (
      <div className="rounded-xl border border-error/40 p-6 space-y-3">
        <p className="font-mono text-sm text-error">PARSER_SCHEMA_REJECTED</p>
        <p className="text-xs font-mono">HTTP 422 REJECT</p>
        <h2 className="text-lg font-semibold">Could not read this file</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-sm font-semibold flex-1" onClick={onChooseAnother}>Choose another file</button>
          <button type="button" className="text-sm text-secondary" onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
      <h1 className="text-base font-semibold">Import Lifecycle &amp; Operational States</h1>
      <h2 className="text-lg font-semibold">No {area} imports yet</h2>
      <p className="font-mono text-xs text-outline">Ledger Partition CLEARED (0 BATCHES)</p>
      <p className="text-sm text-on-surface-variant">Start a import from an area card.</p>
      <button type="button" className="h-9 px-4 rounded-lg bg-primary-container text-on-primary font-semibold" onClick={onStartImport}>
        Start a {area} import
      </button>
      <button type="button" className="text-sm font-semibold text-error block mx-auto" onClick={onUndoImport}>
        Undo this import
      </button>
    </div>
  );
}
