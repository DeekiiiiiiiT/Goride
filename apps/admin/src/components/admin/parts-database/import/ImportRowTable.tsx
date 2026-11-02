// Stitch: dominion-redesign/parts_import_check_results
import { Fragment, useState } from "react";
import { ImportRowExpanded } from "./ImportRowExpanded";

export function ImportRowTable({
  rows,
  onPatchRow,
}: {
  rows: Array<Record<string, unknown>>;
  onPatchRow?: (lineNo: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
      <table className="w-full text-xs text-left">
        <thead className="bg-surface-container-low font-mono uppercase text-outline">
          <tr>
            <th className="p-2">Line</th>
            <th className="p-2">Vehicle Fitment</th>
            <th className="p-2">Part type</th>
            <th className="p-2">Brand & Number</th>
            <th className="p-2">Classification</th>
            <th className="p-2">Position / Side</th>
            <th className="p-2">Status</th>
            <th className="p-2">Diagnostic Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const raw = row.raw as Record<string, string> | undefined;
            const issues = row.issues as Array<{ code?: string; message?: string }> | undefined;
            const lineNo = Number(row.line_no);
            return (
              <Fragment key={String(row.line_no)}>
                <tr
                  className="border-t border-outline-variant/20 cursor-pointer hover:bg-surface-container-low/50"
                  onClick={() => setExpanded(expanded === lineNo ? null : lineNo)}
                >
                  <td className="p-2">{String(row.line_no)}</td>
                  <td className="p-2 max-w-[140px] truncate" title={raw?.vehicle}>{raw?.vehicle}</td>
                  <td className="p-2">{raw?.part_type ?? raw?.job}</td>
                  <td className="p-2">{raw?.brand} {raw?.part_number}</td>
                  <td className="p-2">{raw?.match_type}</td>
                  <td className="p-2">{raw?.position} {raw?.side}</td>
                  <td className="p-2">{String(row.status)}</td>
                  <td className="p-2 max-w-[160px] truncate" title={issues?.[0]?.message}>{issues?.[0]?.code}</td>
                </tr>
                {expanded === lineNo && issues?.length ? (
                  <tr>
                    <td colSpan={8}>
                      <ImportRowExpanded issues={issues} onCheckRow={() => onPatchRow?.(lineNo)} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="p-2 flex flex-wrap items-center justify-between gap-2 text-xs text-outline">
        <span>Showing {rows.length} rows · Filtered view · Rows per page 25</span>
        <div className="flex gap-1">
          <button type="button" className="px-2 py-1 rounded bg-surface-container-low">chevron_left</button>
          <button type="button" className="px-2 py-1 rounded bg-surface-container-low">chevron_right</button>
        </div>
      </div>
    </div>
  );
}
