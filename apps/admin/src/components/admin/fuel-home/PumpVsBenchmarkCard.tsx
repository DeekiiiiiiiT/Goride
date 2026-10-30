// Stitch: dominion-redesign/433e0f61d6af4258983945cb6684a948
import type { FuelOverview } from "./fuelHomeApi";
import {
  activityWhen,
  benchmarkName,
  formatJmd,
  headlineGrade,
  sharePercent,
  signedPercent,
} from "./fuelHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

const ACTIVITY = {
  report: { label: "Price report received", dot: "bg-secondary" },
  publish: { label: "Prices published", dot: "bg-tertiary" },
  refinery_week: { label: "Refinery week added", dot: "bg-outline-variant" },
  station_edit: { label: "Station edited", dot: "bg-outline-variant" },
} as const;

export function PumpVsBenchmarkCard({ data, todayIso }: { data: FuelOverview; todayIso: string }) {
  const name = benchmarkName(data);
  const feature = headlineGrade(data);
  const others = data.prices.by_grade.filter((grade) => grade.grade !== feature?.grade);
  const pump = feature?.avg_pump == null ? null : Number(feature.avg_pump);
  const bench = feature?.benchmark == null ? null : Number(feature.benchmark);
  const hasLive = Boolean(feature && feature.live > 0 && pump != null && bench != null && pump > 0);
  const base = hasLive ? Math.max(0, Math.min(100, Math.round((bench! / pump!) * 100))) : 100;
  const reporter = Number(data.prices.top_reporter_share);
  const outdated = Number(data.prices.outdated_share);

  return (
    <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="pb-3 mb-3">
          <h2 className="text-sm font-headline font-bold text-on-surface">Pump vs benchmark</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Average live pump price against {name}&apos;s ex-refinery price.</p>
        </div>
        {feature ? (
          <div className="p-3 rounded-xl bg-surface-container-low mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-on-surface">{feature.label}</span>
              {hasLive && feature.diff != null ? (
                <span className="font-mono text-xs text-on-surface font-semibold">
                  {Number(feature.diff) >= 0 ? "▲" : "▼"} {formatJmd(Math.abs(Number(feature.diff)))} · {signedPercent(feature.diff_pct)}
                </span>
              ) : (
                <span className="text-xs text-on-surface-variant">No live price yet</span>
              )}
            </div>
            {hasLive ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-label font-semibold text-on-surface-variant block">Pump Avg</span>
                    <span className="font-mono text-sm font-bold text-on-surface">{formatJmd(pump)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-label font-semibold text-on-surface-variant block">{name}</span>
                    <span className="font-mono text-sm font-medium text-on-surface-variant">{formatJmd(bench)}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-surface-container-highest rounded-full flex overflow-hidden mb-1.5">
                  <div className="bg-secondary h-full" style={{ width: `${base}%` }} />
                  <div className="bg-amber-500 h-full" style={{ width: `${100 - base}%` }} />
                </div>
                <span className="text-[10px] font-mono text-on-surface-variant block">Based on {feature.live} prices from {data.prices.priced_stations} stations</span>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2 mb-4 text-xs font-mono">
          {others.map((grade) => (
            <div key={grade.grade} className="flex items-center justify-between py-1 px-1">
              <span className="text-on-surface font-sans">{grade.label}</span>
              <span className="text-on-surface-variant">{grade.live > 0 && grade.avg_pump != null ? formatJmd(grade.avg_pump) : "No live price yet"}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2 mb-5">
          {reporter > 0 ? (
            <div className="p-2.5 rounded-lg bg-amber-500/10 flex items-start gap-2.5">
              <Icon name="warning" className="text-amber-600 text-[18px] shrink-0 mt-0.5" />
              <span className="text-xs text-amber-900 leading-tight">One reporter sends {sharePercent(reporter)} of reports</span>
            </div>
          ) : null}
          {outdated > 0 ? (
            <div className="p-2.5 rounded-lg bg-amber-500/10 flex items-start gap-2.5">
              <Icon name="history_toggle_off" className="text-amber-600 text-[18px] shrink-0 mt-0.5" />
              <span className="text-xs text-amber-900 leading-tight">{sharePercent(outdated)} of published prices are outdated</span>
            </div>
          ) : null}
        </div>
        <div>
          <div className="text-[11px] font-label font-bold uppercase tracking-wider text-on-surface-variant mb-2 px-1">Recent activity</div>
          <div className="space-y-2 text-xs">
            {data.activity.filter((item) => item.at).map((item) => {
              const meta = ACTIVITY[item.kind as keyof typeof ACTIVITY] ?? { label: item.kind, dot: "bg-outline-variant" };
              return (
                <div key={item.kind} className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    <span className="text-on-surface">{meta.label}</span>
                  </div>
                  <span className="font-mono text-on-surface-variant text-[11px]">{activityWhen(item.at!, todayIso)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
