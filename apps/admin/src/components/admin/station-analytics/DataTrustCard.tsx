import { useBenchmarkName } from "../refineries/useRefineries";
import { formatWeek, formatWhen } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";

export function DataTrustCard({
  data,
  onReviewPrices,
}: {
  data: StationAnalytics;
  onReviewPrices: () => void;
}) {
  const benchmarkName = useBenchmarkName();
  const when = formatWhen(data.meta.lastReportAt);
  const share = data.trust.topReporterShare;
  const stalePetrojam = (() => {
    if (!data.meta.latestPetrojamDate) return true;
    const then = new Date(`${data.meta.latestPetrojamDate}T00:00:00Z`).getTime();
    return Date.now() - then > 8 * 86_400_000;
  })();
  const outdatedPct = Math.round((data.trust.outdatedShare || 0) * 100);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-4">
      <h2 className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100">Data trust</h2>
      <dl className="space-y-3 pt-3 text-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
          <dt className="font-semibold">Newest pump report</dt>
          <dd className="text-right font-mono">
            <div className="font-bold">{when.relative}</div>
            <div className="text-[10px] text-slate-500">{when.exact}</div>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
          <dt>
            <div className="font-semibold">Reports this week</div>
            <button type="button" className="text-[10px] font-semibold text-[#316bf3]" onClick={onReviewPrices}>Review prices</button>
          </dt>
          <dd className="text-right font-mono text-[11px]">
            {data.trust.accepted} accepted · {data.trust.duplicate} duplicate · {data.trust.rejected} rejected · {data.trust.review} in review
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
          <dt className="font-semibold">Reporters</dt>
          <dd className="text-right">
            <span className="font-mono font-bold">{data.trust.reporters}</span>
            {share > 0.5 ? (
              <span className="ml-2 rounded-full border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {data.trust.reporters === 1 ? "1 reporter supplies 100%" : `Top reporter ${Math.round(share * 100)}%`}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
          <dt className="font-semibold">Sources</dt>
          <dd className="font-mono text-[11px]">Fleet {data.trust.fleet} · Plug {data.trust.plug}</dd>
        </div>
        <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
          <div className="mb-1 flex items-center justify-between">
            <dt className="font-semibold">Live prices that may be outdated</dt>
            <dd className="font-mono text-amber-700">{data.trust.outdated} of {data.trust.live}</dd>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-amber-500" style={{ width: `${outdatedPct}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold">{benchmarkName} last synced</dt>
          <dd className={`font-mono text-xs font-bold ${stalePetrojam ? "text-amber-700" : "text-slate-800 dark:text-slate-100"}`}>
            {formatWeek(data.meta.latestPetrojamDate)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
