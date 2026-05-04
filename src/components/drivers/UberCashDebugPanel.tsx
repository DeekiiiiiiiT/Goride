import React, { useMemo, useState } from "react";
import { Copy, Bug } from "lucide-react";
import { toast } from "sonner@2.0.3";
import type { DriverMetrics, Trip } from "../../types/data";
import { buildUberCashDebugReport } from "../../utils/uberCashDebugReport";
import { Button } from "../ui/button";

function useUberCashDebugEnabled(): boolean {
  const [on, setOn] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        import.meta.env.DEV ||
        new URLSearchParams(window.location.search).get("debugCash") === "1" ||
        localStorage.getItem("goride_debug_cash") === "1"
      );
    } catch {
      return import.meta.env.DEV;
    }
  });
  React.useEffect(() => {
    const tick = () => {
      try {
        setOn(
          import.meta.env.DEV ||
            new URLSearchParams(window.location.search).get("debugCash") === "1" ||
            localStorage.getItem("goride_debug_cash") === "1",
        );
      } catch {
        setOn(import.meta.env.DEV);
      }
    };
    tick();
    window.addEventListener("popstate", tick);
    return () => window.removeEventListener("popstate", tick);
  }, []);
  return on;
}

export type UberCashDebugPanelProps = {
  csvMetrics: DriverMetrics[] | undefined;
  rangeFrom: Date;
  rangeTo: Date;
  trips: Trip[] | undefined;
  isAllPlatforms: boolean;
  /** Resolved Uber cash on overview (`resolvedFinancials.platformStats.Uber?.cashCollected`) */
  resolvedUberCash?: number | null;
};

export function UberCashDebugPanel({
  csvMetrics,
  rangeFrom,
  rangeTo,
  trips,
  isAllPlatforms,
  resolvedUberCash,
}: UberCashDebugPanelProps) {
  const enabled = useUberCashDebugEnabled();
  const report = useMemo(
    () => buildUberCashDebugReport(csvMetrics, rangeFrom, rangeTo, trips, isAllPlatforms),
    [csvMetrics, rangeFrom, rangeTo, trips, isAllPlatforms],
  );

  if (!enabled) return null;

  const json = JSON.stringify(report, null, 2);

  return (
    <details className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/40 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-amber-900 dark:text-amber-200 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Bug className="h-4 w-4 shrink-0" />
          Uber cash debug (why Cash Collected shows Uber)
        </span>
      </summary>
      <div className="space-y-3 border-t border-amber-200/60 px-3 pb-3 pt-2 dark:border-amber-900/40">
        <p className="text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/90">
          Turn on: add{" "}
          <code className="rounded bg-white/60 px-1 dark:bg-black/30">?debugCash=1</code> to the URL, or run{" "}
          <code className="rounded bg-white/60 px-1 dark:bg-black/30">
            localStorage.setItem(&apos;goride_debug_cash&apos;,&apos;1&apos;)
          </code>{" "}
          in the console and refresh.
        </p>

        <div className="grid gap-2 text-xs text-slate-800 dark:text-slate-200 sm:grid-cols-2">
          <div>
            <span className="text-slate-500">Selected range</span>
            <div className="font-mono tabular-nums">
              {report.rangeStart} → {report.rangeEnd}
            </div>
          </div>
          <div>
            <span className="text-slate-500">All platforms filter</span>
            <div>{report.isAllPlatforms ? "Yes (Uber CSV cash logic runs)" : "No (override skipped)"}</div>
          </div>
          <div>
            <span className="text-slate-500">Driver metric rows (total)</span>
            <div>{report.totalDriverMetricRows}</div>
          </div>
          <div>
            <span className="text-slate-500">Overlapping period rows</span>
            <div>{report.overlappingRows.length}</div>
          </div>
          <div>
            <span className="text-slate-500">Uber trips in range</span>
            <div>
              {report.uberTripsInRange} ({report.uberCompletedTripsInRange} completed)
            </div>
          </div>
          <div>
            <span className="text-slate-500">Computed magnitude (same as app logic)</span>
            <div className="font-semibold tabular-nums">
              {report.magnitude != null ? `$${report.magnitude.toFixed(2)}` : "—"}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500">Branch</span>
            <div className="font-mono text-[11px]">{report.branch}</div>
          </div>
          {resolvedUberCash != null && resolvedUberCash > 0.005 && (
            <div className="sm:col-span-2">
              <span className="text-slate-500">Overview Uber cash (resolved)</span>
              <div className="tabular-nums">${resolvedUberCash.toFixed(2)}</div>
            </div>
          )}
        </div>

        {report.overlappingRows.length > 0 ? (
          <div className="overflow-x-auto rounded border border-slate-200/80 bg-white/70 dark:border-slate-700 dark:bg-slate-900/50">
            <table className="w-full min-w-[640px] border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                  <th className="p-2 font-medium">Metric id</th>
                  <th className="p-2 font-medium">periodStart → periodEnd</th>
                  <th className="p-2 font-medium text-right">tx column sum</th>
                  <th className="p-2 font-medium text-right">cashCollected</th>
                  <th className="p-2 font-medium">dataSources</th>
                </tr>
              </thead>
              <tbody>
                {report.overlappingRows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="max-w-[140px] truncate p-2 font-mono text-slate-600 dark:text-slate-400" title={r.id}>
                      {r.id}
                    </td>
                    <td className="whitespace-nowrap p-2 font-mono text-slate-700 dark:text-slate-300">
                      {r.periodStart} → {r.periodEnd}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {r.uberPaymentsTransactionCashColumnSum ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.cashCollected ?? "—"}</td>
                    <td className="p-2 font-mono text-[10px] text-slate-600 dark:text-slate-400">
                      {(r.dataSources || []).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No driver_metric rows overlap this date range — app should not pull Uber cash from CSV for this window.
          </p>
        )}

        {report.nonOverlappingRows.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500">
              {report.nonOverlappingRows.length} other metric row(s) do not overlap (hidden)
            </summary>
            <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-500">
              {report.nonOverlappingRows.map((r) => (
                <li key={r.id}>
                  {r.id}: {r.periodStart} → {r.periodEnd}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(json);
                toast.success("Debug JSON copied");
              } catch {
                toast.error("Could not copy");
              }
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy JSON
          </Button>
        </div>
      </div>
    </details>
  );
}
