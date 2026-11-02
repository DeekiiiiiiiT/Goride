// Stitch: dominion-redesign/parts_import_check_results
import { Fragment, useState } from "react";
import { ImportRowExpanded } from "./ImportRowExpanded";
import { MaterialIcon } from "./MaterialIcon";

function statusChip(status: string) {
  switch (status) {
    case "valid":
      return (
        <span className="px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] font-mono-sm text-[10px] font-semibold">
          Ready
        </span>
      );
    case "labelled":
      return (
        <span className="px-2 py-0.5 rounded-full border border-[#166534] text-[#166534] font-mono-sm text-[10px] font-semibold">
          Ready w/ label
        </span>
      );
    case "error":
      return (
        <span className="px-2 py-0.5 rounded-full bg-error-container text-error font-mono-sm text-[10px] font-semibold">
          Error
        </span>
      );
    case "duplicate":
      return (
        <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono-sm text-[10px] font-semibold">
          Duplicate
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-mono-sm text-[10px]">
          {status}
        </span>
      );
  }
}

function classificationChip(matchType: string | undefined) {
  const oem = matchType?.toLowerCase().includes("oem");
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-mono-sm text-[10px] font-semibold ${oem ? "bg-primary-fixed/40 text-primary" : "bg-[#ede9fe] text-[#5b21b6]"}`}
    >
      {oem ? "OEM" : "Aftermarket"}
    </span>
  );
}

export function ImportRowTable({
  rows,
  total,
  onPatchRow,
  onToggleAccepted,
  onInspectLine,
  onPagePrev,
  onPageNext,
  pageOffset,
  pageLimit,
}: {
  rows: Array<Record<string, unknown>>;
  total?: number;
  onPatchRow?: (lineNo: number) => void;
  onToggleAccepted?: (lineNo: number, accepted: boolean) => void;
  onInspectLine?: (lineNo: number) => void;
  onPagePrev?: () => void;
  onPageNext?: () => void;
  pageOffset?: number;
  pageLimit?: number;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const allAccepted = rows.length > 0 && rows.every((r) => r.accepted !== false);

  function toggleAll() {
    const next = !allAccepted;
    for (const row of rows) {
      const lineNo = Number(row.line_no);
      if (Number.isFinite(lineNo)) onToggleAccepted?.(lineNo, next);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
      <table className="w-full text-xs text-left">
        <thead className="bg-surface-container-low font-mono uppercase text-outline">
          <tr>
            <th className="p-2 w-8">
              <input type="checkbox" checked={allAccepted} onChange={toggleAll} aria-label="Select all rows" />
            </th>
            <th className="p-2">Line</th>
            <th className="p-2">Vehicle Fitment</th>
            <th className="p-2">Part type</th>
            <th className="p-2">Brand & Number</th>
            <th className="p-2">Classification</th>
            <th className="p-2">Position / Side</th>
            <th className="p-2">Status</th>
            <th className="p-2">Diagnostic Note</th>
            <th className="p-2 w-10" aria-label="Inspect" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const raw = row.raw as Record<string, string> | undefined;
            const normalized = row.normalized as Record<string, unknown> | undefined;
            const issues = row.issues as Array<{ code?: string; message?: string }> | undefined;
            const lineNo = Number(row.line_no);
            const status = String(row.status ?? "");
            const vehicleLabel =
              (normalized?.vehicle_label as string | undefined) ??
              (row.vehicle_label as string | undefined) ??
              raw?.vehicle;
            const unresolved = !row.vehicle_catalog_id && status === "error";
            const rowTint =
              status === "error" ? "bg-error-container/10" : status === "duplicate" ? "opacity-60" : "";
            return (
              <Fragment key={String(row.line_no)}>
                <tr
                  className={`border-t border-outline-variant/20 cursor-pointer hover:bg-surface-container-low/50 ${rowTint}`}
                  onClick={() => setExpanded(expanded === lineNo ? null : lineNo)}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={row.accepted !== false}
                      disabled={status !== "valid" && status !== "labelled"}
                      onChange={(e) => onToggleAccepted?.(lineNo, e.target.checked)}
                    />
                  </td>
                  <td className="p-2">{String(row.line_no)}</td>
                  <td className="p-2 max-w-[180px]">
                    {unresolved ? (
                      <span className="text-error flex items-center gap-1 truncate" title={vehicleLabel}>
                        <MaterialIcon name="link_off" className="text-[14px] shrink-0" />
                        {vehicleLabel}
                      </span>
                    ) : (
                      <span className="truncate block" title={vehicleLabel}>
                        {vehicleLabel}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded bg-surface-container-high">{raw?.part_type ?? raw?.job}</span>
                  </td>
                  <td className="p-2">
                    {raw?.brand} {raw?.part_number}
                  </td>
                  <td className="p-2">{classificationChip(raw?.match_type)}</td>
                  <td className="p-2">
                    {[raw?.position, raw?.side].filter(Boolean).join(" · ")}
                  </td>
                  <td className="p-2">{statusChip(status)}</td>
                  <td className="p-2 max-w-[160px] truncate" title={issues?.[0]?.message}>
                    {issues?.[0]?.message ?? issues?.[0]?.code ?? "—"}
                  </td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="text-secondary"
                      aria-label={`Inspect line ${lineNo}`}
                      onClick={() => onInspectLine?.(lineNo)}
                    >
                      <MaterialIcon name="manage_search" className="text-[18px]" />
                    </button>
                  </td>
                </tr>
                {expanded === lineNo && issues?.length ? (
                  <tr>
                    <td colSpan={10}>
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
        <span>
          Showing {rows.length} of {total ?? rows.length} rows · Filtered view · Rows per page: {pageLimit ?? 25}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="px-2 py-1 rounded bg-surface-container-low disabled:opacity-40"
            disabled={!pageOffset}
            onClick={onPagePrev}
          >
            <MaterialIcon name="chevron_left" className="text-[18px]" />
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-surface-container-low disabled:opacity-40"
            disabled={total != null && pageOffset != null && pageLimit != null && pageOffset + pageLimit >= total}
            onClick={onPageNext}
          >
            <MaterialIcon name="chevron_right" className="text-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
