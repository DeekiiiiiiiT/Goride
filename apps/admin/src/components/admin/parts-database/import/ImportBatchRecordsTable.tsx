// Stitch: dominion-redesign/parts_import_done
export function ImportBatchRecordsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-surface-container-low">
        <h3 className="text-sm font-semibold">Ingested Batch Records & Snapshot Audit</h3>
        <button type="button" className="text-xs font-semibold text-error">Revert / undo ingestion</button>
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
          {rows.slice(0, 8).map((row) => {
            const raw = row.raw as Record<string, string> | undefined;
            return (
              <tr key={String(row.line_no)} className="border-t border-outline-variant/20">
                <td className="p-2">{String(row.line_no)}</td>
                <td className="p-2">{raw?.part_name ?? raw?.part_number ?? "—"}</td>
                <td className="p-2">{raw?.replaces_oem_number ?? "—"}</td>
                <td className="p-2">{raw?.match_type ?? "—"}</td>
                <td className="p-2">{raw?.part_type ?? "—"}</td>
                <td className="p-2 text-right">Commit status · {String(row.status)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
