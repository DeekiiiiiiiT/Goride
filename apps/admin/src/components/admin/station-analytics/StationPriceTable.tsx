import { useMemo, useState } from "react";
import { useBenchmarkName } from "../refineries/useRefineries";
import {
  confidenceLabel,
  formatDelta,
  formatJmdPerLitre,
  formatWeek,
  formatWhen,
} from "./stationAnalyticsFormat";
import type { StationAnalytics, StationRow } from "./stationAnalyticsApi";

type Key = "name" | "brand" | "parish" | "status" | "price" | "gap" | "vsParish" | "reportCount" | "lastReportAt";

function flags(row: StationRow): string[] {
  const chips: string[] = [];
  if (row.outdated) chips.push("May be outdated");
  if (row.price != null && (row.reportCount ?? 0) < 3) chips.push("Few reports");
  if (row.pinState === "unchecked") chips.push("Pin unchecked");
  if (row.parishTextMismatch) chips.push("Parish text mismatch");
  if (!row.brand || row.brand === "No brand set") chips.push("No brand set");
  return chips;
}

export function StationPriceTable({
  data,
  onOpen,
}: {
  data: StationAnalytics;
  onOpen: (placeId: string) => void;
}) {
  const benchmarkName = useBenchmarkName();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [key, setKey] = useState<Key>("price");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = data.stations.filter((row) => {
      if (!needle) return true;
      return `${row.name} ${row.address || ""}`.toLowerCase().includes(needle);
    });
    filtered.sort((a, b) => {
      const aPriced = a.price == null ? 1 : 0;
      const bPriced = b.price == null ? 1 : 0;
      if (key === "price" && aPriced !== bPriced) return aPriced - bPriced;
      const left = a[key];
      const right = b[key];
      if (left == null && right == null) return a.name.localeCompare(b.name);
      if (left == null) return 1;
      if (right == null) return -1;
      const delta = typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
      return delta * (dir === "asc" ? 1 : -1);
    });
    return filtered;
  }, [data.stations, query, key, dir]);
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const pageSafe = Math.min(page, pageCount - 1);
  const visible = rows.slice(pageSafe * 50, pageSafe * 50 + 50);

  function sort(next: Key) {
    setPage(0);
    if (next === key) setDir((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setKey(next);
      setDir(next === "price" ? "asc" : "asc");
    }
  }

  const th = (id: Key, label: string) => (
    <th className="px-2 py-2" aria-sort={key === id ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort(id)}>{label}</button>
    </th>
  );

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Stations</h2>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(0); }}
          placeholder="Search station or address"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs sm:w-64 dark:border-slate-700 dark:bg-slate-800"
        />
        <span className="font-mono text-[11px] text-slate-500">
          Showing {rows.length === 0 ? 0 : pageSafe * 50 + 1}–{Math.min(rows.length, pageSafe * 50 + 50)} of {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {th("name", "Station")}
              {th("brand", "Brand")}
              {th("parish", "Parish")}
              {th("status", "Status")}
              {th("price", `Price (${data.meta.grade})`)}
              {th("gap", `Gap above ${benchmarkName}`)}
              {th("vsParish", "vs parish median")}
              {th("reportCount", "Reports")}
              <th className="px-2 py-2">Confidence</th>
              {th("lastReportAt", "Newest report")}
              <th className="px-2 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.placeId}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70"
                onClick={() => onOpen(row.placeId)}
              >
                <td className="px-2 py-2 font-medium">{row.name}</td>
                <td className="px-2 py-2">{row.brand || "No brand set"}</td>
                <td className="px-2 py-2">{row.parish || "—"}</td>
                <td className="px-2 py-2">{row.status === "verified" ? "Verified" : "Pending"}</td>
                <td className="px-2 py-2 font-mono">{row.price == null ? <span className="text-slate-400">no price</span> : formatJmdPerLitre(row.price)}</td>
                <td className="px-2 py-2 font-mono">{row.gap == null ? "—" : formatDelta(row.gap)}</td>
                <td className="px-2 py-2 font-mono">{row.vsParish == null ? "—" : formatDelta(row.vsParish)}</td>
                <td className="px-2 py-2 font-mono">{row.reportCount ?? "—"}</td>
                <td className="px-2 py-2">{confidenceLabel(row.confidence, row.reportCount, row.reporterCount)}</td>
                <td className="px-2 py-2 font-mono">{row.lastReportAt ? formatWeek(row.lastReportAt) : "—"}</td>
                <td className="px-2 py-2">
                  <span className="flex flex-wrap gap-1">
                    {flags(row).map((flag) => (
                      <span key={flag} className="rounded border border-slate-200 px-1 py-0.5 text-[9px] text-slate-600 dark:border-slate-600 dark:text-slate-300">{flag}</span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end gap-2 text-xs">
        <button type="button" disabled={pageSafe === 0} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <button type="button" disabled={pageSafe >= pageCount - 1} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>
      <p className="sr-only">{formatWhen(data.meta.lastReportAt).exact}</p>
    </section>
  );
}

export function exportStationCsv(data: StationAnalytics, filters: { grade: string; week: string; pcode: string; brand: string }, benchmarkName = "") {
  const header = [
    `# grade=${filters.grade}`,
    `# week=${data.meta.week || filters.week}`,
    `# parish=${filters.pcode || "all"}`,
    `# brand=${filters.brand || "all"}`,
    `# generated=${data.meta.generatedAt}`,
  ];
  const columns = ["Station", "Brand", "Parish", "Status", "Price", `Gap above ${benchmarkName}`, "vs parish median", "Reports", "Confidence", "Newest report", "Flags"];
  const lines = data.stations.map((row) => [
    row.name,
    row.brand || "No brand set",
    row.parish || "",
    row.status,
    row.price ?? "",
    row.gap ?? "",
    row.vsParish ?? "",
    row.reportCount ?? "",
    confidenceLabel(row.confidence, row.reportCount, row.reporterCount),
    row.lastReportAt || "",
    flags(row).join("; "),
  ].map((cell) => `"${String(cell).split('"').join('""')}"`).join(","));
  const blob = new Blob([[...header, columns.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `station-analytics-${data.meta.week || "week"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
