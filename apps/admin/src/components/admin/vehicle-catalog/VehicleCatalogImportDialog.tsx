import React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ParsedCatalogImportRow } from "../../../utils/vehicleCatalogCsvImport";
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
  failed: number;
  errors: string[];
  /** Present when API accepted rows but omitted columns the CSV had (remote DB / Edge out of date). */
  schemaWarnings: string[];
};

export type VehicleCatalogImportDialogProps = {
  open: boolean;
  importStep: VehicleCatalogImportStep;
  importPreview: ParsedCatalogImportRow[] | null;
  importProgress: { current: number; total: number } | null;
  importOutcome: VehicleCatalogImportOutcome | null;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onRunImport: () => void;
};

export function VehicleCatalogImportDialog({
  open,
  importStep,
  importPreview,
  importProgress,
  importOutcome,
  onOpenChange,
  onClose,
  onRunImport,
}: VehicleCatalogImportDialogProps) {
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
                : "Import motor catalog"}
          </DialogTitle>
          {importStep === "preview" && (
            <DialogDescription className="text-slate-600 text-sm leading-relaxed">
              Required columns: <span className="font-medium text-slate-800">Make</span>,{" "}
              <span className="font-medium text-slate-800">Model</span>,{" "}
              <span className="font-medium text-slate-800">Production start year</span>. Use{" "}
              <span className="font-medium text-slate-800">Export CSV</span> for a compatible template. End year{" "}
              <span className="font-medium text-slate-800">9999</span> or empty means ongoing.{" "}
              <span className="font-medium text-slate-800">Engine type</span> is free text (e.g. N/A, Turbo, Hybrid).
            </DialogDescription>
          )}
          {importStep === "importing" && (
            <DialogDescription className="text-slate-600 text-sm">
              Uploading rows to the catalog. Please keep this window open.
            </DialogDescription>
          )}
          {importStep === "result" && importOutcome && (
            <DialogDescription className="sr-only">
              Import completed with {importOutcome.imported} imported and {importOutcome.failed} failed.
            </DialogDescription>
          )}
        </DialogHeader>

        {importStep === "preview" && importPreview && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{importPreview.filter((r) => r.payload).length}</span>{" "}
              row(s) ready to import
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
            {importOutcome.failed === 0 && importOutcome.imported > 0 && (
              <div className="flex gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-4">
                <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-emerald-950">Import successful</p>
                  <p className="text-sm text-emerald-900/90">
                    {importOutcome.imported} vehicle{importOutcome.imported === 1 ? "" : "s"} added to the catalog.
                  </p>
                </div>
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

            {importOutcome.imported === 0 && importOutcome.failed > 0 && (
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

            {importOutcome.imported > 0 && importOutcome.failed > 0 && (
              <div className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-4">
                <CheckCircle2 className="h-10 w-10 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-amber-950">Partially imported</p>
                  <p className="text-sm text-amber-950/90">
                    <span className="font-medium tabular-nums">{importOutcome.imported}</span> saved,{" "}
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
                disabled={!importPreview?.some((r) => r.payload)}
                className="gap-2"
              >
                Import
              </Button>
            </>
          )}
          {importStep === "result" && (
            <Button type="button" onClick={onClose} className="w-full sm:w-auto">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
