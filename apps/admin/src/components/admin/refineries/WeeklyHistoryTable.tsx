import { useState } from "react";
import { refineriesApi, type History } from "./refineriesApi";
import { formatWeek } from "./refineryFormat";

const COLUMNS: Array<[string, string]> = [
  ["gasolene_87", "Gasolene 87"],
  ["gasolene_90", "Gasolene 90"],
  ["auto_diesel", "Auto diesel"],
  ["ulsd", "ULSD"],
  ["kerosene", "Kerosene"],
  ["propane", "Propane"],
  ["butane", "Butane"],
  ["hfo", "HFO"],
  ["asphalt", "Asphalt"],
];

export function WeeklyHistoryTable({
  slug,
  history,
  year,
  onYear,
  onPage,
}: {
  slug: string;
  history: History;
  year: number | null;
  onYear: (year: number | null) => void;
  onPage: (page: number) => void;
}) {
  const [versions, setVersions] = useState<{ week: string; product: string; rows: Array<{ revision: number; price: number; at: string }> } | null>(null);
  const pages = Math.max(1, Math.ceil(history.total / 52));
  const labels = new Map(history.products.map((product) => [product.code, product.label]));

  async function exportCsv() {
    const all = await refineriesApi.history(slug, year, 0);
    const header = ["Week", ...COLUMNS.map(([, label]) => label), "Source"];
    const units = ["", ...COLUMNS.map(([code]) => all.products.find((product) => product.code === code)?.unit || "unit not set"), ""];
    const lines = [header.join(","), units.join(",")];
    for (const row of all.rows) {
      lines.push([
        row.week,
        ...COLUMNS.map(([code]) => row.cells[code]?.price != null ? Number(row.cells[code].price).toFixed(4) : ""),
        row.source,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-prices.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openCell(week: string, product: string) {
    const data = await refineriesApi.versions(slug, product, week);
    setVersions({ week, product, rows: data.versions || [] });
  }

  const from = history.total === 0 ? 0 : (history.page - 1) * 52 + 1;
  const to = Math.min(history.page * 52, history.total);

  return (
    <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-on-surface">Weekly history</h3>
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 text-xs font-mono-code text-outline">
            <span>Year:</span>
            <select className="bg-surface-container border-0 rounded px-2 py-1 text-xs font-mono-code text-on-surface" value={year ?? ""} onChange={(event) => onYear(event.target.value ? Number(event.target.value) : null)}>
              <option value="">All</option>
              {history.years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg text-xs font-medium" onClick={() => { void exportCsv(); }}>
            <span className="material-symbols-outlined text-xs">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono-code text-xs">
          <thead className="bg-surface-container-low text-outline text-[11px] font-medium border-b border-surface-variant/70 sticky top-0">
            <tr>
              <th className="py-2.5 px-4 font-normal">Week</th>
              {COLUMNS.map(([code, label]) => <th key={code} className="py-2.5 px-3 text-right font-normal">{labels.get(code) || label}</th>)}
              <th className="py-2.5 px-4 text-center font-normal">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container/60 text-on-surface tabular-nums">
            {history.rows.map((row) => (
              <tr key={row.week} className="hover:bg-surface-container-low/60">
                <td className="py-2.5 px-4 font-medium">{formatWeek(row.week)}</td>
                {COLUMNS.map(([code]) => {
                  const cell = row.cells[code];
                  return (
                    <td key={code} className="py-2.5 px-3 text-right">
                      <button type="button" className="hover:underline" onClick={() => { void openCell(row.week, code); }}>
                        {cell ? Number(cell.price).toFixed(4) : "—"}
                        {cell?.revised ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1 mb-0.5 align-middle" title="Revised" /> : null}
                      </button>
                    </td>
                  );
                })}
                <td className="py-2.5 px-4 text-center"><span className="px-1.5 py-0.5 rounded bg-surface-container text-outline text-[10px]">{row.source}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {versions ? (
        <div className="px-5 py-3 border-t border-surface-container text-xs font-mono-code">
          <div className="flex justify-between"><span>{labels.get(versions.product)} · {formatWeek(versions.week)}</span><button type="button" onClick={() => setVersions(null)}>Close</button></div>
          {versions.rows.map((row) => <div key={row.revision}>Revision {row.revision} · {Number(row.price).toFixed(4)} · {formatWeek(row.at)}</div>)}
        </div>
      ) : null}
      <div className="px-5 py-3 border-t border-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono-code text-outline">
        <div>Showing {from}–{to} of {history.total.toLocaleString("en-US")} weeks · {formatWeek(history.spanFrom)} – {formatWeek(history.spanTo)}</div>
        <div className="flex items-center gap-1">
          <button type="button" className="px-2 py-1 rounded" disabled={history.page <= 1} onClick={() => onPage(history.page - 1)}>‹</button>
          <span className="px-2.5 py-1 rounded bg-secondary text-white font-semibold">{history.page}</span>
          <button type="button" className="px-2 py-1 rounded" disabled={history.page >= pages} onClick={() => onPage(history.page + 1)}>›</button>
        </div>
      </div>
    </div>
  );
}
