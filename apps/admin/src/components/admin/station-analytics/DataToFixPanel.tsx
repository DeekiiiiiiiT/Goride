import { useState } from "react";
import type { StationAnalytics } from "./stationAnalyticsApi";

export function DataToFixPanel({
  quality,
  onNavigate,
}: {
  quality: StationAnalytics["quality"];
  onNavigate: (page: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const lines = [
    { count: quality.parishMismatch, label: "Parish text disagrees with the station's map location", page: "fuel-stations", action: "Open in Station database" },
    { count: quality.noBrand, label: "No brand set", page: "fuel-stations", action: "Open in Station database" },
    { count: quality.pinUnchecked, label: "Pin not checked", page: "places-review", action: "Places review" },
    { count: quality.verifiedNoDate, label: "Verified but no verified date", page: "", action: "Cleared automatically" },
    { count: quality.inReview, label: "Reports waiting in Price Engine review", page: "fuel-price-engine", action: "Price Engine" },
  ];
  const issues = lines.filter((line) => line.count > 0).length;
  const records = lines.reduce((sum, line) => sum + line.count, 0);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Data to fix</h2>
          <span className="text-[11px] text-slate-500">{issues} data issues affecting {records} records</span>
        </span>
        <span className="font-mono text-xs text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {lines.map((line) => (
            <li key={line.label} className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
              <span><span className="mr-2 font-mono font-bold">{line.count}</span>{line.label}</span>
              {line.page ? (
                <button type="button" className="shrink-0 font-semibold text-[#316bf3]" onClick={() => onNavigate(line.page)}>{line.action}</button>
              ) : (
                <span className="text-slate-400">{line.action}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
