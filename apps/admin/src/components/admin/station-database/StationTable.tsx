import type { StationListRow } from "./stationRegisterApi";
import { brandTone, issueChipClass, issueLabels, money, pinLabel, relativeTime, statusLabel } from "./stationFormat";
import { StationIcon } from "./StationIcon";

const COLUMNS = [
  ["name", "Station Name & Address"],
  ["brand_name", "Brand Identity"],
  ["parish_name", "Parish"],
  ["status", "Status"],
  ["pin_state", "Pin Conf."],
  ["geofence_m", "Geofence"],
  ["price_e10_87", "Price (E10-87)"],
  ["fill_count", "Fills Telemetry"],
  ["issue_count", "Detected Issues"],
  ["updated_at", "Updated"],
] as const;

function chipText(label: string) {
  if (label === "Company-style name") return "Company name";
  return label;
}

export function StationTable({
  rows,
  sort,
  dir,
  canWrite,
  selected,
  onSort,
  onToggle,
  onTogglePage,
  onOpen,
}: {
  rows: StationListRow[];
  sort: string;
  dir: "asc" | "desc";
  canWrite: boolean;
  selected: string[];
  onSort: (column: string) => void;
  onToggle: (id: string) => void;
  onTogglePage: (ids: string[], on: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const pageIds = rows.map((row) => row.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  return (
    <>
      <div className="hidden md:block overflow-x-auto relative">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-label text-[11px] uppercase tracking-wider select-none">
            <tr>
              <th className="w-10 px-4 py-3 text-center">
                <input
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  type="checkbox"
                  checked={allOn}
                  disabled={!canWrite}
                  onChange={(event) => onTogglePage(pageIds, event.target.checked)}
                  aria-label="Select stations on this page"
                />
              </th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="px-4 py-3 font-bold text-slate-700" aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="font-bold text-slate-700" onClick={() => onSort(key)}>{label}</button>
                </th>
              ))}
              <th className="w-8 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const issues = issueLabels(row);
              const picked = selected.includes(row.id);
              const duplicate = row.possible_duplicate;
              const tone = brandTone(row.brand_name);
              const rowClass = duplicate
                ? `bg-amber-50/50 border-l-4 border-l-amber-500 hover:bg-amber-50/80 transition-colors${picked ? "" : ""}`
                : "hover:bg-slate-50/80 transition-colors";
              return (
                <tr key={row.id} className={rowClass}>
                  <td className="px-4 py-3.5 text-center">
                    <input
                      className={`w-4 h-4 rounded text-blue-600 focus:ring-blue-500 ${duplicate ? "border-amber-400" : "border-slate-300"}`}
                      type="checkbox"
                      checked={picked}
                      disabled={!canWrite}
                      onChange={() => onToggle(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <button type="button" className="text-left" onClick={() => onOpen(row.id)}>
                      <div className="font-bold text-slate-900 text-sm flex flex-wrap items-center gap-2">
                        <span>{row.name}</span>
                        {duplicate ? <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold border border-amber-200 whitespace-nowrap">Duplicate</span> : null}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                        <StationIcon name="location_on" className="text-[13px] text-slate-400" />
                        {row.address || "—"}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    {row.brand_name ? (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-bold text-[11px] shadow-2xs ${tone.wrap}`}>
                        <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                        {row.brand_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 italic font-medium text-[11px]">No brand set</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {row.parish_text_mismatch ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-800 font-medium bg-amber-100/60 px-2 py-0.5 rounded border border-amber-200 text-[11px]" title={`Stored text says ${row.parish_text || "something else"}`}>
                        {row.parish_name || "—"}
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Parish text mismatch" />
                      </span>
                    ) : (
                      <span className="font-medium text-slate-700">{row.parish_name || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${row.status === "verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : row.status === "pending" ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${row.status === "verified" ? "bg-emerald-500" : row.status === "pending" ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {row.pin_state === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        <StationIcon name="check" className="text-[12px]" />Confirmed
                      </span>
                    ) : row.pin_state === "offset" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <StationIcon name="near_me" className="text-[12px]" />Offset
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">{pinLabel(row.pin_state)}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 font-mono font-medium ${row.geofence_m == null ? "text-slate-400" : "text-slate-600"}`}>
                    {row.geofence_m == null ? "default" : `${row.geofence_m} m`}
                  </td>
                  <td className={`px-4 py-3.5 font-mono font-bold rounded px-2 ${row.price_e10_87 == null ? "text-slate-400 font-semibold" : "text-slate-900 bg-slate-50/50"}`}>
                    {row.price_e10_87 == null ? "—" : <><span className="text-blue-600 font-semibold">J$</span>{money(row.price_e10_87)}</>}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-slate-600">
                    {row.fill_count ? <><span className="font-bold text-slate-800">{row.fill_count}</span> fills · {relativeTime(row.last_fill_at)}</> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {issues.length === 0 ? (
                      <span className="text-emerald-600 text-[11px] font-semibold flex items-center gap-1">
                        <StationIcon name="check_circle" className="text-[14px]" />Clean
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {issues.slice(0, 3).map((label) => (
                          <span key={label} className={issueChipClass(label)}>
                            {label === "Possible duplicate" ? <StationIcon name="copy_all" className="text-[11px]" /> : null}
                            {chipText(label)}
                          </span>
                        ))}
                        {issues.length > 3 ? <span className="text-[10px] text-slate-500">+{issues.length - 3}</span> : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-[11px] font-mono whitespace-nowrap">{relativeTime(row.updated_at)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button type="button" className="text-slate-400 hover:text-blue-600 font-bold" onClick={() => onOpen(row.id)} aria-label={`Open ${row.name}`}>›</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-slate-100">
        {rows.map((row) => (
          <button key={row.id} type="button" className={`w-full text-left px-4 py-3 ${row.possible_duplicate ? "bg-amber-50/60 border-l-4 border-l-amber-500" : ""}`} onClick={() => onOpen(row.id)}>
            <div className="font-bold text-slate-900 text-sm">{row.name}</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{row.address || "—"}</div>
            <div className="mt-1 text-[11px] text-slate-600">{row.parish_name || "—"} · {statusLabel(row.status)} · {row.geofence_m == null ? "default" : `${row.geofence_m} m`}</div>
          </button>
        ))}
      </div>
    </>
  );
}
