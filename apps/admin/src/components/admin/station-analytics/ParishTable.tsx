import { useMemo, useState } from "react";
import { formatDelta, formatJmdPerLitre } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";

type Parish = StationAnalytics["parishes"][number];
type Key = "name" | "stations" | "verified" | "priced" | "median" | "gap" | "vsNational";

export function ParishTable({
  rows,
  selected,
  onSelect,
  onCoverage,
}: {
  rows: Parish[];
  selected: string;
  onSelect: (pcode: string) => void;
  onCoverage: () => void;
}) {
  const [key, setKey] = useState<Key>("stations");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = a[key];
      const right = b[key];
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * (dir === "asc" ? 1 : -1);
      return (Number(left) - Number(right)) * (dir === "asc" ? 1 : -1);
    });
    return copy;
  }, [rows, key, dir]);

  function sort(next: Key) {
    if (next === key) setDir((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setKey(next);
      setDir(next === "name" ? "asc" : "desc");
    }
  }

  const header = (id: Key, label: string) => (
    <th className="px-2 py-2 text-right" aria-sort={key === id ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="font-semibold" onClick={() => sort(id)}>{label}</button>
    </th>
  );

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-12">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">By parish</h2>
        <span className="font-mono text-[10px] text-slate-500">{rows.length} administrative areas</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-2" aria-sort={key === "name" ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => sort("name")}>Parish</button>
              </th>
              {header("stations", "Stations")}
              {header("verified", "Verif.")}
              {header("priced", "Priced")}
              <th className="px-2 py-2 text-right">Coverage</th>
              {header("median", "Median")}
              {header("gap", "Gap")}
              {header("vsNational", "Nat'l")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const coverage = row.stations ? Math.round((row.priced / row.stations) * 1000) / 10 : 0;
              const active = selected === row.pcode;
              return (
                <tr
                  key={row.pcode}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${active ? "bg-blue-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                  onClick={() => onSelect(active ? "" : row.pcode)}
                >
                  <td className="px-2 py-2 font-medium">{row.name}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.stations}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.verified}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.priced}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <span className="block h-full bg-[#316bf3]" style={{ width: `${Math.min(100, coverage)}%` }} />
                      </span>
                      <span className="w-10 text-right font-mono">{coverage}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{row.median == null ? <span className="text-slate-400">— no price</span> : formatJmdPerLitre(row.median)}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.gap == null ? "—" : formatDelta(row.gap)}</td>
                  <td className="px-2 py-2 text-right font-mono">{row.vsNational == null ? "—" : formatDelta(row.vsNational)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="mt-3 text-[11px] font-semibold text-[#316bf3]" onClick={onCoverage}>Coverage queue</button>
    </section>
  );
}
