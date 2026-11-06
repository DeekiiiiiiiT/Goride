// Stitch: dominion-redesign/parts_import_ledger_drawer
import { useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import { PartsButton } from "../PartsButton";
import { ImportStates } from "./ImportStates";

type ChangesPayload = {
  parts: Array<Record<string, unknown>>;
  fits: Array<Record<string, unknown>>;
  leftOut: Array<Record<string, unknown>>;
};

export function ImportBatchDrawer({
  batch,
  areaName,
  iconKey,
  changes,
  undoBlocked,
  onClose,
  onDownloadFailed,
  onUndo,
  onConflictLink,
}: {
  batch: Record<string, unknown> | null;
  areaName?: string;
  iconKey?: string | null;
  changes?: ChangesPayload | null;
  undoBlocked?: { batchCode: string; conflictCount: number; reasons: Array<{ line?: number | null; reason?: string }> };
  onClose: () => void;
  onDownloadFailed?: () => void;
  onUndo?: () => void;
  onConflictLink?: (line: number) => void;
}) {
  const [fitsCollapsed, setFitsCollapsed] = useState(false);
  if (!batch) return null;
  const name = areaName ?? String(batch.area_name ?? "Area");
  const file = String(batch.file_name ?? "import.csv");
  const code = String(batch.code ?? "");
  const promotedAt = batch.promoted_at ? new Date(String(batch.promoted_at)).toLocaleString() : "—";
  const by = String(batch.promoted_by_name ?? batch.imported_by ?? "Staff");
  const status = String(batch.status ?? "");
  const leftOut = changes?.leftOut ?? [];
  const parts = changes?.parts ?? [];
  const fits = changes?.fits ?? [];

  return (
    <aside className="fixed inset-y-0 right-0 w-full max-w-md bg-surface-container-lowest shadow-xl z-40 overflow-y-auto flex flex-col">
      <div className="p-6 space-y-4 flex-1">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary shrink-0">
              <MaterialIcon name={iconKey ?? "category"} className="text-[18px]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold truncate">
                {name} · {file}
              </h3>
              {status === "imported" ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534]">Imported</span>
              ) : null}
            </div>
          </div>
          <button type="button" className="p-2 rounded-lg hover:bg-surface-container-high shrink-0" aria-label="Close drawer" onClick={onClose}>
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>
        <p className="text-xs text-on-surface-variant">
          Imported {promotedAt} · by {by} · ID #{code}
        </p>

        <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-mono">
          {(
            [
              ["ROWS", batch.rows_total],
              ["READY", batch.rows_valid],
              ["READY W/ LBL", batch.rows_labelled],
              ["ERRORS", batch.rows_error],
              ["DUPLICATES", batch.rows_duplicate],
            ] as Array<[string, unknown]>
          ).map(([label, val]) => (
            <div key={String(label)} className="rounded-lg bg-surface-container-low p-2">
              <div className="text-outline uppercase">{label}</div>
              <div className="font-bold text-on-surface">{String(val ?? 0)}</div>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide">WHAT CHANGED IN CATALOG</h4>
          <p className="text-xs font-mono text-primary mt-1">+{parts.length + fits.length} Mutations Applied</p>
        </div>

        {parts.length ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold">{parts.length} parts created</p>
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {parts.map((p) => (
                <li key={String(p.line_no)} className="font-mono">
                  {String(p.brand ?? "")} {String(p.part_number ?? "")} · {String(p.part_type ?? "")} → {String(p.vehicle ?? "")}
                  {p.position ? ` · ${String(p.position)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {fits.length ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{fits.length} fits added</p>
              <PartsButton variant="icon" className="text-xs min-h-[32px] h-8 w-auto px-2" onClick={() => setFitsCollapsed((v) => !v)}>
                {fitsCollapsed ? "Expand" : "Collapse"}
              </PartsButton>
            </div>
            {!fitsCollapsed ? (
              <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {fits.map((f, i) => (
                  <li key={`${f.vehicle}-${i}`}>
                    {String(f.vehicle ?? "")} · {String(f.positions ?? "—")} ({String(f.count ?? 1)})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {leftOut.length ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-error">LEFT OUT FROM CATALOG ({leftOut.length} ROWS)</p>
              <PartsButton variant="secondary" className="text-xs" onClick={onDownloadFailed}>
                Download failed rows ({leftOut.length})
              </PartsButton>
            </div>
            <ul className="text-xs space-y-1 max-h-36 overflow-y-auto">
              {leftOut.map((row) => (
                <li key={String(row.line_no)} className="font-mono">
                  L{String(row.line_no)} · {String(row.part_number ?? "")} · {String(row.code ?? "")} · {String(row.message ?? "")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {undoBlocked ? (
          <ImportStates mode="undo-blocked" undoBlocked={undoBlocked} onConflictLink={onConflictLink} />
        ) : batch.undo_open === true || batch.can_undo === true ? (
          <div className="rounded-xl bg-[#fce7f3] border border-[#f9a8d4]/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-error">Undo this import</p>
            <p className="text-xs text-on-surface-variant">
              Removes the {String(batch.parts_created ?? 0)} parts and {String(batch.fits_created ?? 0)} fits this import
              added. Nothing older is touched.
            </p>
            <button type="button" className="w-full h-10 rounded-xl bg-error text-on-error font-semibold" onClick={onUndo}>
              Undo this import
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
