// Stitch: dominion-redesign/7b9231f8dae1411996e38bd680d73727
import { formatUpdated, issueChips, locationLine, statusLabel, titleCaseName, typeIcon, type RegisterRow } from "./registerFormat";

const HEADS = [
  ["place", "Place"],
  ["place_type", "Type"],
  ["location", "Location"],
  ["status", "Status"],
  ["", "Issues"],
  ["facility_count", "Facilities"],
  ["geofence_display", "Geofence"],
  ["updated_at", "Updated"],
];

export function RegisterTable({
  rows,
  selected,
  sort,
  onSort,
  onToggle,
  onTogglePage,
  onOpen,
  page,
  pages,
  total,
  onPage,
}: {
  rows: RegisterRow[];
  selected: string[];
  sort: string;
  onSort: (column: string) => void;
  onToggle: (id: string) => void;
  onTogglePage: (on: boolean) => void;
  onOpen: (row: RegisterRow) => void;
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageIds = rows.map((row) => row.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col mb-16">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-surface-container-low/75 text-[11px] font-label uppercase tracking-wider text-on-surface-variant font-semibold select-none">
              <th className="w-10 px-4 py-3 text-center">
                <input className="w-3.5 h-3.5 rounded text-secondary focus:ring-0 focus:outline-none cursor-pointer" type="checkbox" checked={allOn} onChange={(event) => onTogglePage(event.target.checked)} />
              </th>
              {HEADS.map(([column, label]) => (
                <th key={label} className="px-4 py-3 font-semibold">
                  {column ? (
                    <button type="button" className="flex items-center gap-1 cursor-pointer hover:text-on-surface transition-colors" onClick={() => onSort(column)}>
                      <span>{label}</span>
                      <span className="material-symbols-outlined text-[14px]">{sort === column ? "unfold_more" : "unfold_more"}</span>
                    </button>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {rows.map((row) => {
              const on = selected.includes(row.id);
              const verified = row.status === "verified";
              const where = locationLine(row);
              return (
                <tr key={row.id} className={`${on ? "bg-secondary-container/20 " : ""}group transition-colors hover:bg-surface-container-low`}>
                  <td className="px-4 py-3 text-center">
                    <input className="h-3.5 w-3.5 cursor-pointer rounded text-secondary focus:outline-none focus:ring-0" type="checkbox" checked={on} onChange={() => onToggle(row.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-left" onClick={() => onOpen(row)}>
                      <div className="flex flex-col">
                        <span className="cursor-pointer font-medium text-on-surface group-hover:text-secondary">{titleCaseName(row.name || "")}</span>
                        <span className="font-label text-[11px] text-outline">{row.brand_name || "Independent"}</span>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2 py-0.5 font-label text-[11px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] text-outline">{typeIcon(row.place_type, row.match_profile)}</span>
                      <span>{row.type_label || row.place_type}</span>
                    </div>
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    <span className="block truncate text-on-surface" title={where}>{where}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-2 py-0.5 font-label text-[11px] font-medium ${verified ? "text-tertiary" : "text-on-surface-variant"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${verified ? "bg-tertiary" : "bg-error-container"}`} />
                      <span>{statusLabel(row.status)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {issueChips(row).map((chip) => (
                        <span key={chip} className={`rounded bg-surface-container-high px-1.5 py-0.5 font-label text-[10px] ${chip === "Pin not checked" ? "text-error" : "text-on-surface-variant"}`}>{chip}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-mono font-medium text-on-surface">{row.facility_count || 0}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-on-surface">
                    <span className="flex items-center gap-1">
                      {row.geofence_display == null ? "—" : `${row.geofence_display} m`}
                      {row.geofence_override ? <span className="h-1.5 w-1.5 rounded-full bg-secondary" title="Override applied" /> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-outline">{formatUpdated(row.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-surface-container bg-surface-container-lowest p-4 font-body text-xs">
        <div className="font-mono text-[11px] text-on-surface-variant">
          Showing <span className="font-semibold text-on-surface">{total ? (page - 1) * 50 + 1 : 0}–{Math.min(page * 50, total)}</span> of <span className="font-semibold text-on-surface">{total}</span> places
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-outline hover:bg-surface-container disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
          </button>
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
            <button key={number} type="button" className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs ${number === page ? "bg-secondary font-semibold text-on-secondary" : "text-on-surface hover:bg-surface-container"}`} onClick={() => onPage(number)}>
              {number}
            </button>
          ))}
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface hover:bg-surface-container disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}
