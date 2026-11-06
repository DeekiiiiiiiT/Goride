// Stitch: dominion-redesign/parts_import_states
import { MaterialIcon } from "./MaterialIcon";
import { PartsButton } from "../PartsButton";

const PIPELINE = ["PARSE", "VALIDATE", "FITMENT MATRIX", "COMMIT"] as const;

export function ImportStates({
  mode,
  areaName,
  areaCode,
  partTypes,
  fileName,
  fileErrorDetail,
  checkProgress,
  undoBlocked,
  onRequestAccess,
  onViewJobs,
  onCancelCheck,
  onRetry,
  onChooseAnother,
  onStartImport,
  onConflictLink,
}: {
  mode: "empty" | "checking" | "no-access" | "file-failed" | "undo-blocked";
  areaName?: string;
  areaCode?: string;
  partTypes?: string[];
  fileName?: string;
  fileErrorDetail?: string;
  checkProgress?: { checked: number; total: number };
  undoBlocked?: {
    batchCode: string;
    conflictCount: number;
    reasons: Array<{ line?: number | null; reason?: string }>;
  };
  detail?: string;
  actorInitials?: string;
  actorRole?: string;
  onRequestAccess?: () => void;
  onViewJobs?: () => void;
  onCancelCheck?: () => void;
  onRetry?: () => void;
  onChooseAnother?: () => void;
  onStartImport?: () => void;
  onConflictLink?: (line: number) => void;
}) {
  const area = areaName ?? "Brakes";
  const examples = partTypes?.slice(0, 3).join(", ") ?? "parts for this area";

  if (mode === "no-access") {
    return (
      <div className="rounded-xl border border-outline-variant p-8 space-y-4 max-w-lg">
        <h2 className="text-lg font-semibold">You don&apos;t have import access</h2>
        <p className="text-sm text-on-surface-variant">Your account does not hold write permissions for live cluster catalog ingestion.</p>
        <div className="rounded-xl bg-surface-container-low p-4 space-y-1">
          <p className="text-sm font-semibold">Elevated Role Required</p>
          <p className="text-sm text-on-surface-variant">Ask the owner to give you the Catalog editor role.</p>
        </div>
        <button type="button" className="w-full h-9 rounded-lg bg-primary text-on-primary font-semibold" onClick={onRequestAccess}>
          Request access from Owner
        </button>
      </div>
    );
  }

  if (mode === "checking") {
    const checked = checkProgress?.checked ?? 0;
    const total = checkProgress?.total ?? 0;
    const pct = total ? Math.min(100, Math.round((100 * checked) / total)) : 0;
    const rate = checked > 0 && total > checked ? Math.round(((total - checked) / checked) * 1.5) : null;
    const stage = total && checked >= total * 0.75 ? 3 : checked > 0 ? 2 : 1;
    const label = fileName ?? "import.csv";
    return (
      <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/30 p-6 space-y-4">
        <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase">
          {PIPELINE.map((step, i) => (
            <span key={step} className={i + 1 <= stage ? "text-primary font-bold" : "text-outline"}>
              {i + 1}. {step}
              {i < PIPELINE.length - 1 ? " →" : ""}
            </span>
          ))}
        </div>
        <h2 className="text-lg font-semibold">Checking {label}</h2>
        <p className="text-xs font-mono text-primary">
          Checking {checked.toLocaleString()} of {total.toLocaleString()} rows… ({pct}% complete
          {rate != null ? ` · est. ${rate}s remaining` : ""})
        </p>
        <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
          <div className="bg-primary-container h-full rounded-full transition-all" style={{ width: `${pct || 8}%` }} />
        </div>
        <p className="text-xs text-on-surface-variant flex items-start gap-2">
          <MaterialIcon name="info" className="text-[16px] text-primary shrink-0" />
          You can leave this page; the check keeps running in the background worker pool.
        </p>
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" className="text-sm flex-1 justify-start" onClick={onViewJobs}>
            View background jobs
          </PartsButton>
          <PartsButton variant="danger" className="text-sm" onClick={onCancelCheck}>
            Cancel check
          </PartsButton>
        </div>
      </div>
    );
  }

  if (mode === "file-failed") {
    return (
      <div className="rounded-xl border border-error/40 p-6 space-y-3 relative">
        <div className="flex flex-wrap gap-2 absolute top-4 right-4 text-[10px] font-mono text-error">
          <span>PARSER_SCHEMA_REJECTED</span>
          <span>HTTP 422 REJECT</span>
        </div>
        <MaterialIcon name="error" className="text-[32px] text-error" />
        <h2 className="text-lg font-semibold">Could not read this file</h2>
        {fileName ? <p className="text-sm text-on-surface-variant">Source: {fileName}</p> : null}
        <div className="rounded-xl bg-error-container/40 p-4 text-sm text-on-error-container whitespace-pre-wrap">
          {fileErrorDetail ?? "Line 1: the file isn't a CSV (looks like .xlsx or binary workbook)"}
        </div>
        <p className="text-[10px] font-mono text-outline">STRICT_MIME_MODE text/csv, text/plain</p>
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" className="text-sm flex-1" onClick={onChooseAnother}>
            Choose another file
          </PartsButton>
          <PartsButton variant="secondary" className="text-sm" onClick={onRetry}>
            Retry
          </PartsButton>
        </div>
      </div>
    );
  }

  if (mode === "undo-blocked" && undoBlocked) {
    return (
      <div className="rounded-xl border border-error/30 bg-error-container/10 p-6 space-y-3">
        <MaterialIcon name="lock" className="text-[28px] text-error" />
        <h2 className="text-lg font-semibold">Undo blocked — {undoBlocked.conflictCount} fits were changed after this import</h2>
        <p className="text-xs font-mono text-outline">Batch ledger token: #{undoBlocked.batchCode}</p>
        <ul className="text-sm space-y-1">
          {undoBlocked.reasons.map((r, i) => (
            <li key={`${r.line}-${i}`}>
              <PartsButton
                variant="secondary"
                className="text-left justify-start min-h-[32px] h-auto py-1"
                onClick={() => r.line != null && onConflictLink?.(r.line)}
              >
                → [Line {r.line ?? "—"}: {r.reason ?? "Changed after import"}]
              </PartsButton>
            </li>
          ))}
        </ul>
        <p className="text-xs text-on-surface-variant">
          Dominion prevents destructive rollback when downstream fitment graphs have mutated.
        </p>
        <p className="text-[10px] font-mono text-outline">BATCH #{undoBlocked.batchCode}</p>
        <button type="button" disabled className="w-full h-10 rounded-xl bg-surface-container-high text-outline font-semibold inline-flex items-center justify-center gap-2">
          <MaterialIcon name="lock" className="text-[18px]" />
          Undo this import
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-outline-variant p-8 text-center space-y-3 max-w-lg mx-auto">
      <MaterialIcon name="my_location" className="text-[32px] text-outline mx-auto" />
      <h2 className="text-lg font-semibold">No {area} imports yet</h2>
      <p className="text-sm text-on-surface-variant">
        When you import {examples} from a supplier or OEM bulletin, the audit record and reversible ledger entries appear
        here.
      </p>
      <p className="font-mono text-xs text-outline">
        Target Master Subsystem {areaCode ?? "—"} · Ledger Partition CLEARED (0 TOKENS)
      </p>
      <button type="button" className="h-9 px-4 rounded-lg bg-primary-container text-on-primary font-semibold" onClick={onStartImport}>
        Start a {area} import
      </button>
    </div>
  );
}
