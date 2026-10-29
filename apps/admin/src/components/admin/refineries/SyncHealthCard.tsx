import { useState } from "react";
import type { Runs } from "./refineriesApi";
import { formatDuration, formatSynced, formatWeek } from "./refineryFormat";

export function SyncHealthCard({ runs, onRevisions }: { runs: Runs; onRevisions: () => void }) {
  const [gapsOpen, setGapsOpen] = useState(false);
  return (
    <div className="lg:col-span-4 bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
          <h3 className="text-sm font-semibold text-on-surface">Sync & health</h3>
          {runs.freshness ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" /> {runs.freshness}
            </span>
          ) : null}
        </div>
        <div className="py-3">
          <div className="text-xs text-on-surface font-medium">Latest week {formatWeek(runs.latestWeek)}</div>
          <div className="text-[11px] font-mono-code text-outline mt-0.5">Synced {formatSynced(runs.syncedAt)} via automated scrape</div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-container font-mono-code text-xs">
            <div>
              <span className="text-outline text-[11px]">Gaps since 2023:</span>
              <button type="button" className="font-semibold text-on-surface ml-1" onClick={() => setGapsOpen((value) => !value)}>{runs.gaps}</button>
            </div>
            <div>
              <span className="text-outline text-[11px]">Revised weeks:</span>
              <button type="button" className="text-secondary font-semibold hover:underline ml-1" onClick={onRevisions}>{runs.revisedWeeks}</button>
            </div>
          </div>
          {gapsOpen && runs.gapWeeks.length ? (
            <div className="mt-2 font-mono-code text-[11px] text-outline">{runs.gapWeeks.map((week) => formatWeek(week)).join(" · ")}</div>
          ) : null}
        </div>
        <div className="mt-2">
          <div className="font-mono-code text-[11px] uppercase tracking-wider text-outline font-semibold mb-2">Recent runs</div>
          <div className="space-y-2 font-mono-code text-[11px]">
            {runs.runs.length === 0 ? <div className="text-outline">No runs yet</div> : null}
            {runs.runs.map((run) => (
              <div key={run.at} className="flex items-center justify-between text-on-surface-variant py-1 border-b border-surface-container/50">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${run.error ? "bg-amber-500" : run.result.includes("revised") ? "bg-amber-500" : run.result === "No new week" ? "bg-slate-400" : "bg-emerald-600"}`} />
                  <span className="text-on-surface">{formatSynced(run.at)}</span>
                  <span className="text-outline">· {run.trigger}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={run.result.includes("revised") ? "text-amber-700 font-medium" : ""}>{run.result}</span>
                  <span className="text-outline tabular-nums">{formatDuration(run.seconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pt-4 border-t border-surface-container mt-4">
        <span className="text-xs font-semibold text-secondary inline-flex items-center gap-1">
          <span>View all runs</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </span>
      </div>
    </div>
  );
}
