import { useState } from "react";
import { conflictTypeLabel } from "@roam/types/partMatchConflictCopy";
import { buildConflictBatchResolveItems, openConflictsForBatch } from "@roam/types/conflictBatchResolve";
import type { MatchConflictRow } from "../../../../services/partsAutoMatchApi";

export function BatchResolveRulesModal({
  open,
  conflictType,
  rows,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  conflictType: string;
  rows: MatchConflictRow[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (action: "keep" | "remove", note: string) => void;
}) {
  const [action, setAction] = useState<"keep" | "remove">("keep");
  const [note, setNote] = useState("");
  if (!open) return null;

  const openRows = openConflictsForBatch(rows, conflictType);
  const typeLabel = conflictTypeLabel(conflictType);
  const preview = buildConflictBatchResolveItems(rows, conflictType, action, note);
  const canSubmit = preview.ok && !busy;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="batch-resolve-title">
      <div className="w-full max-w-lg rounded-xl bg-surface-container-lowest p-space-md shadow-lg flex flex-col gap-space-md">
        <div className="flex items-start justify-between gap-space-sm">
          <div>
            <h2 id="batch-resolve-title" className="font-headline-md text-headline-md text-on-surface font-semibold">
              Batch Resolve Rules
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Apply one decision to all <strong className="text-on-surface">{openRows.length}</strong> open{" "}
              <span className="text-on-surface">{typeLabel}</span> conflicts.
            </p>
          </div>
          <button type="button" className="w-8 h-8 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant" aria-label="Close" onClick={onClose}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-space-xs">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md ${action === "keep" ? "bg-primary-container text-on-primary font-semibold" : "bg-surface-container-high text-on-surface-variant"}`}
            onClick={() => setAction("keep")}
          >
            Keep all
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg font-label-md text-label-md ${action === "remove" ? "bg-surface-container-high text-on-surface font-semibold" : "bg-surface-container-high text-on-surface-variant"}`}
            onClick={() => setAction("remove")}
          >
            Remove all
          </button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface font-semibold">Note (required)</span>
          <textarea
            className="auto-match-conflicts-note w-full p-2.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant resize-none"
            rows={3}
            placeholder="Reason applied to every conflict in this batch…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {!preview.ok && note.trim() ? (
          <p className="font-body-sm text-body-sm text-error">{preview.error}</p>
        ) : null}
        <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant">
          <button type="button" className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="auto-match-conflicts-primary px-5 py-2 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-semibold disabled:opacity-40"
            disabled={!canSubmit}
            onClick={() => { if (preview.ok) onSubmit(action, note.trim()); }}
          >
            Apply to {openRows.length} conflicts
          </button>
        </div>
      </div>
    </div>
  );
}
