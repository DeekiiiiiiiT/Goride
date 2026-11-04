import React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type {
  CatalogImportOnExisting,
  CatalogImportRowClass,
  ParsedCatalogImportRow,
} from "../../../utils/vehicleCatalogCsvImport";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Progress } from "../../ui/progress";
import { ScrollArea } from "../../ui/scroll-area";

export type VehicleCatalogImportStep = "preview" | "importing" | "result";

export type VehicleCatalogImportOutcome = {
  imported: number;
  updated: number;
  /** Rows matching a car already in the catalog that were left untouched. */
  skipped?: number;
  /** Second copies of the same car inside the file (never sent). */
  inFileDuplicates?: number;
  failed: number;
  errors: string[];
  /** Present when API accepted rows but omitted columns the CSV had (remote DB / Edge out of date). */
  schemaWarnings: string[];
  importBatchId?: string;
};

export type VehicleCatalogImportDialogProps = {
  open: boolean;
  importStep: VehicleCatalogImportStep;
  importPreview: ParsedCatalogImportRow[] | null;
  /** Headers with no alias — blocks Import until removed or aliases registered. */
  unknownHeaders: string[];
  importProgress: { current: number; total: number } | null;
  importOutcome: VehicleCatalogImportOutcome | null;
  importBatchId?: string | null;
  undoingBatch?: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onRunImport: () => void;
  onUndoBatch?: () => void;
  /** Per-row duplicate check against the file and the loaded catalog. */
  importClasses?: Map<number, CatalogImportRowClass> | null;
  importOnExisting?: CatalogImportOnExisting;
  onImportOnExistingChange?: (v: CatalogImportOnExisting) => void;
};

export function VehicleCatalogImportDialog({
  open,
  importStep,
  importPreview,
  unknownHeaders,
  importProgress,
  importOutcome,
  importBatchId,
  undoingBatch,
  onOpenChange,
  onClose,
  onRunImport,
  onUndoBatch,
  importClasses,
  importOnExisting = "skip",
  onImportOnExistingChange,
}: VehicleCatalogImportDialogProps) {
  const hasUnknown = unknownHeaders.length > 0;
  const classCount = (kind: CatalogImportRowClass["kind"]) =>
    importClasses ? [...importClasses.values()].filter((c) => c.kind === kind).length : 0;
  const newCount = classCount("new");
  const existingCount = classCount("existing");
  const inFileDupCount = classCount("duplicate_in_file");
  const withIdCount = classCount("has_id");
  const readyCount = importPreview?.filter((r) => r.payload && importClasses?.get(r.rowIndex)?.kind !== "duplicate_in_file").length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        className="sm:max-w-lg bg-white border-slate-200"
        hideCloseButton={importStep === "importing"}
        aria-busy={importStep === "importing"}
        onPointerDownOutside={(e) => {
          if (importStep === "importing") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (importStep === "importing") e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {importStep === "importing"
              ? "Importing…"
              : importStep === "result"
                ? "Import finished"
                : "Import vehicle catalog"}
          </DialogTitle>
          {importStep === "preview" && (
            <DialogDescription className="text-slate-600 text-sm leading-relaxed">
              Required columns: <span className="font-medium text-slate-800">Make</span>,{" "}
              <span className="font-medium text-slate-800">Model</span>,{" "}
              <span className="font-medium text-slate-800">Production start year</span>. Optional{" "}
              <span className="font-medium text-slate-800">Vehicle class</span> (car/motorcycle; defaults to car). Use{" "}
              <span className="font-medium text-slate-800">Export CSV</span> for a compatible template. Rows with a valid{" "}
              <span className="font-medium text-slate-800">ID</span> update existing catalog entries.
            </DialogDescription>
          )}
          {importStep === "importing" && (
            <DialogDescription className="text-slate-600 text-sm">
              Uploading rows to the catalog
              {importBatchId ? (
                <>
                  {" "}
                  (batch <span className="font-mono text-xs">{importBatchId.slice(0, 8)}…</span>)
                </>
              ) : null}
              . Please keep this window open — progress is checkpointed for resume.
            </DialogDescription>
          )}
          {importStep === "result" && importOutcome && (
            <DialogDescription className="sr-only">
              Import completed with {importOutcome.imported} created, {importOutcome.updated} updated, and{" "}
              {importOutcome.failed} failed.
            </DialogDescription>
          )}
        </DialogHeader>

        {importStep === "preview" && importPreview && (
          <div className="space-y-3 py-1">
            {hasUnknown && (
              <div className="rounded-xl border border-red-300/90 bg-red-50 p-4 text-sm text-red-950">
                <p className="font-semibold text-red-950">Unknown CSV columns — import blocked</p>
                <p className="mt-2 leading-relaxed text-red-900/95">
                  These headers are not recognized and would be silently dropped. Remove them or register aliases before
                  importing:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs text-red-900">
                  {unknownHeaders.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{readyCount}</span> row(s) ready to import
              {importPreview.some((r) => r.catalogId) && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-slate-600">
                    {importPreview.filter((r) => r.catalogId).length} with ID (will update)
                  </span>
                </>
              )}
              {importPreview.some((r) => r.parseError) && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-amber-800">
                    {importPreview.filter((r) => r.parseError).length} row(s) skipped (see below)
                  </span>
                </>
              )}
              .
            </p>
            {importClasses && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800 space-y-2">
                <p className="font-semibold text-slate-900">Duplicate check</p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold tabular-nums">{newCount}</span> new car(s) — will be added
                  </li>
                  <li>
                    <span className="font-semibold tabular-nums">{existingCount}</span> already in the database
                    {" — "}
                    {importOnExisting === "update" ? "will be updated (blank cells keep the current value)" : "will be skipped"}
                  </li>
                  {inFileDupCount > 0 && (
                    <li>
                      <span className="font-semibold tabular-nums">{inFileDupCount}</span> duplicate(s) inside this file — only the first copy is used
                    </li>
                  )}
                  {withIdCount > 0 && (
                    <li>
                      <span className="font-semibold tabular-nums">{withIdCount}</span> with a database ID — will update that car (blank cells keep the current value)
                    </li>
                  )}
                </ul>
                <p className="text-xs text-slate-500">
                  Same car = same make, model, series, trim, chassis code, engine code and start year.
                </p>
                {existingCount > 0 && onImportOnExistingChange && (
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={importOnExisting === "update"}
                      onChange={(e) => onImportOnExistingChange(e.target.checked ? "update" : "skip")}
                    />
                    <span>Update cars that already exist with this file's values</span>
                  </label>
                )}
              </div>
            )}
            {importPreview.some((r) => r.parseError) && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-600">Parse issues</p>
                <ScrollArea className="h-[min(200px,40vh)] rounded-md border border-slate-200 bg-slate-50/80 p-2">
                  <ul className="space-y-1 text-xs text-slate-700 font-mono">
                    {importPreview
                      .filter((r) => r.parseError)
                      .map((r) => (
                        <li key={r.rowIndex}>
                          Line {r.rowIndex}: {r.parseError}
                        </li>
                      ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {importStep === "importing" && importProgress && importProgress.total > 0 && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span className="tabular-nums">
                Row {importProgress.current} of {importProgress.total}
              </span>
              <span className="text-slate-500 tabular-nums">
                {Math.min(
                  100,
                  Math.round((importProgress.current / importProgress.total) * 100),
                )}
                %
              </span>
            </div>
            <Progress
              value={Math.min(
                100,
                Math.round((importProgress.current / importProgress.total) * 100),
              )}
              className="h-2.5 bg-slate-200"
              indicatorClassName="bg-slate-300 dark:bg-slate-900"
            />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
              Saving to server…
            </div>
          </div>
        )}

        {importStep === "result" && importOutcome && (
          <div className="space-y-4 py-1">
            {importOutcome.failed === 0 && (importOutcome.imported > 0 || importOutcome.updated > 0) && (
              <div className="flex gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-4">
                <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-emerald-950">Import successful</p>
                  <p className="text-sm text-emerald-900/90">
                    {importOutcome.imported > 0 && (
                      <>
                        {importOutcome.imported} entr{importOutcome.imported === 1 ? "y" : "ies"} added
                      </>
                    )}
                    {importOutcome.imported > 0 && importOutcome.updated > 0 && "; "}
                    {importOutcome.updated > 0 && (
                      <>
                        {importOutcome.updated} updated
                      </>
                    )}
                    .
                    {(importOutcome.skipped ?? 0) > 0 && (
                      <> {importOutcome.skipped} already in the database — left unchanged.</>
                    )}
                    {(importOutcome.inFileDuplicates ?? 0) > 0 && (
                      <> {importOutcome.inFileDuplicates} duplicate row(s) in the file ignored.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {importOutcome.failed === 0 && importOutcome.imported === 0 && importOutcome.updated === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                <p className="font-semibold text-slate-900">Nothing new to add</p>
                <p className="mt-1">
                  {importOutcome.skipped ?? 0} car(s) were already in the database and left unchanged
                  {(importOutcome.inFileDuplicates ?? 0) > 0
                    ? `; ${importOutcome.inFileDuplicates} duplicate row(s) in the file were ignored`
                    : ""}
                  .
                </p>
              </div>
            )}

            {importOutcome.schemaWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-300/90 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold text-amber-950">Some CSV columns were not stored</p>
                {importOutcome.schemaWarnings.map((w, idx) => (
                  <p key={idx} className="mt-2 leading-relaxed text-amber-900/95">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {importOutcome.imported === 0 && importOutcome.updated === 0 && importOutcome.failed > 0 && (
              <div className="flex gap-3 rounded-xl border border-red-200/80 bg-red-50/90 p-4">
                <XCircle className="h-10 w-10 shrink-0 text-red-600" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-red-950">Import failed</p>
                  <p className="text-sm text-red-900/90">
                    None of the {importOutcome.failed} row{importOutcome.failed === 1 ? "" : "s"} could be saved. See
                    details below.
                  </p>
                </div>
              </div>
            )}

            {(importOutcome.imported > 0 || importOutcome.updated > 0) && importOutcome.failed > 0 && (
              <div className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-4">
                <CheckCircle2 className="h-10 w-10 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-amber-950">Partially imported</p>
                  <p className="text-sm text-amber-950/90">
                    <span className="font-medium tabular-nums">{importOutcome.imported}</span> created,{" "}
                    <span className="font-medium tabular-nums">{importOutcome.updated}</span> updated,{" "}
                    <span className="font-medium tabular-nums">{importOutcome.failed}</span> failed.
                  </p>
                </div>
              </div>
            )}

            {importOutcome.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-600">Error details</p>
                <ScrollArea className="h-[min(220px,45vh)] rounded-md border border-slate-200 bg-slate-50/80 p-2">
                  <ul className="space-y-1.5 text-xs text-slate-800 font-mono leading-relaxed">
                    {importOutcome.errors.map((line, idx) => (
                      <li key={`${idx}-${line.slice(0, 24)}`}>{line}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
            {(importOutcome.importBatchId || importBatchId) && (
              <p className="text-xs text-slate-500 font-mono">
                Batch id: {importOutcome.importBatchId || importBatchId}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {importStep === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void onRunImport()}
                disabled={hasUnknown || !importPreview?.some((r) => r.payload)}
                className="gap-2"
              >
                Import
              </Button>
            </>
          )}
          {importStep === "result" && (
            <>
              {onUndoBatch && (importOutcome?.imported ?? 0) + (importOutcome?.updated ?? 0) > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-rose-700 border-rose-300"
                  disabled={undoingBatch}
                  onClick={() => onUndoBatch()}
                >
                  {undoingBatch ? "Undoing…" : "Undo this import"}
                </Button>
              )}
              <Button type="button" onClick={onClose} className="w-full sm:w-auto" disabled={undoingBatch}>
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
