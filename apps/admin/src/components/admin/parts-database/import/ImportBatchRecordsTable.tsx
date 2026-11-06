// Stitch: dominion-redesign/parts_import_done
import { PartsButton } from "../PartsButton";

export function ImportBatchRecordsTable({
  rows,
  fileName,
  batchCode,
  shaPrefix,
  onLedger,
  onUndoIngestion,
}: {
  rows: Array<Record<string, unknown>>;
  fileName?: string;
  batchCode?: string;
  shaPrefix?: string;
  onLedger?: () => void;
  onUndoIngestion?: () => void;
}) {
  const sample = rows.slice(0, 8);
  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface-container-low">
        <div>
          <h3 className="text-sm font-semibold">Ingested Batch Records & Snapshot Audit</h3>
          {fileName ? (
            <p className="text-xs text-on-surface-variant">Showing sample of newly written items from {fileName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {batchCode && onLedger ? (
            <PartsButton variant="secondary" className="text-xs" onClick={onLedger}>
              View Import Ledger (Batch #{batchCode})
            </PartsButton>
          ) : null}
          {onUndoIngestion ? (
            <PartsButton variant="danger" className="text-xs" onClick={onUndoIngestion}>
              Revert / Undo Ingestion
            </PartsButton>
          ) : null}
        </div>
      </div>
      <table className="w-full text-xs text-left">
        <thead className="bg-surface-container-high font-mono uppercase text-outline">
          <tr>
            <th className="p-2">Row #</th>
            <th className="p-2">Part Spec & Nomenclature</th>
            <th className="p-2">OEM Reference</th>
            <th className="p-2">Match Tier & Fitments</th>
            <th className="p-2">Category Area</th>
            <th className="p-2 text-right">Commit Status</th>
          </tr>
        </thead>
        <tbody>
          {sample.map((row) => {
            const raw = row.raw as Record<string, string> | undefined;
            const status = String(row.status ?? "");
            const excluded = status === "error" || status === "duplicate";
            const issues = row.issues as Array<{ message?: string }> | undefined;
            return (
              <tr key={String(row.line_no)} className="border-t border-outline-variant/20">
                <td className="p-2">{String(row.line_no)}</td>
                <td className="p-2">
                  <div>{raw?.part_name ?? raw?.part_number ?? "—"}</div>
                  <div className="text-[10px] text-outline truncate">{raw?.vehicle}</div>
                </td>
                <td className="p-2">{raw?.replaces_oem_number ?? "—"}</td>
                <td className="p-2">
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-mono text-[10px]">{raw?.match_type ?? "—"}</span>
                </td>
                <td className="p-2">{raw?.part_type ?? "—"}</td>
                <td className="p-2 text-right">
                  {excluded ? (
                    <div>
                      <span className="text-error font-semibold">EXCLUDED</span>
                      <div className="text-[10px] text-outline">{issues?.[0]?.message ?? status}</div>
                    </div>
                  ) : (
                    <span className="text-[#166534] font-semibold">CREATED</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="p-2 text-[10px] font-mono text-outline border-t border-outline-variant/20">
        Displaying {sample.length} of {rows.length} processed rows · Checksum: SHA256:{shaPrefix ?? "—"} · Auto-purge temporary
        buffer: 72 hrs remaining
      </p>
    </div>
  );
}
