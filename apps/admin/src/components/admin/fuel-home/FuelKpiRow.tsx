// Stitch: dominion-redesign/433e0f61d6af4258983945cb6684a948
import type { FuelOverview } from "./fuelHomeApi";
import {
  barPercent,
  benchmarkName,
  coverageOnlyLine,
  formatJmd,
  freshnessLabel,
  weekOfLabel,
  wholePercent,
  worstRuleLine,
} from "./fuelHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

export function FuelKpiRow({ data }: { data: FuelOverview }) {
  const total = data.stations.total;
  const verified = data.stations.verified;
  const verifiedPct = barPercent(verified, total);
  const pin = data.quality.rules.find((rule) => rule.key === "pin_checked");
  const brand = data.quality.rules.find((rule) => rule.key === "brand_set");
  const parish = data.quality.rules.find((rule) => rule.key === "parish_match");
  const cause = worstRuleLine(data.quality.rules);
  const score = data.quality.score ?? 0;
  const name = benchmarkName(data);
  const fresh = freshnessLabel(data.benchmark.freshness);
  const freshClass = data.benchmark.freshness === "stale"
    ? "text-rose-800"
    : data.benchmark.freshness === "due"
      ? "text-amber-800"
      : "text-tertiary";
  const dotClass = data.benchmark.freshness === "stale"
    ? "bg-rose-600"
    : data.benchmark.freshness === "due"
      ? "bg-amber-600"
      : "bg-tertiary";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-label font-semibold tracking-wider text-on-surface-variant uppercase">Stations</span>
            <Icon name="local_gas_station" className="text-outline-variant text-[18px]" />
          </div>
          <div className="font-mono text-3xl font-normal text-on-surface tracking-tight">{total}</div>
          <div className="text-xs text-on-surface-variant mt-1">{verified} verified · {data.stations.pending} pending</div>
        </div>
        <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-4 -mb-4 px-4 pb-3 rounded-b-xl">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
            <span className="text-on-surface-variant">{wholePercent(verifiedPct)} verified</span>
            <span className="text-on-surface-variant">{verified} / {total}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-secondary rounded-full" style={{ width: `${verifiedPct}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-label font-semibold tracking-wider text-on-surface-variant uppercase">Data quality</span>
            <Icon name="fact_check" className="text-outline-variant text-[18px]" />
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-mono text-3xl font-normal text-on-surface tracking-tight">{wholePercent(score)}</div>
            {cause ? (
              <span className="text-xs font-medium text-error flex items-center gap-0.5">
                <Icon name="priority_high" className="text-[14px]" />
                {cause}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 space-y-1.5 pt-2">
          {[pin, brand, parish].filter(Boolean).map((rule) => {
            const width = barPercent(rule!.pass, total);
            return (
              <div key={rule!.key}>
                <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant">
                  <span>{rule!.label}</span>
                  <span>{rule!.pass} / {total}</span>
                </div>
                <div className="w-full h-1 bg-surface-container-highest rounded-full mt-0.5 overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-label font-semibold tracking-wider text-on-surface-variant uppercase">Price coverage</span>
            <Icon name="query_stats" className="text-outline-variant text-[18px]" />
          </div>
          <div className="font-mono text-3xl font-normal text-on-surface tracking-tight">{wholePercent(data.prices.coverage_pct)}</div>
          <div className="text-xs text-on-surface-variant mt-1">{data.prices.priced_stations} of {total} stations have a live price</div>
        </div>
        <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-4 -mb-4 px-4 pb-3 rounded-b-xl flex items-center justify-between">
          <span className="text-[11px] font-mono text-on-surface-variant">{coverageOnlyLine(data)}</span>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-on-surface">{name}</span>
              <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-mono text-[10px] font-semibold">Benchmark</span>
            </div>
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${freshClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
              {fresh}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-mono text-3xl font-normal text-on-surface tracking-tight">{formatJmd(data.benchmark.headline.price)}</div>
            <span className="text-[11px] font-mono text-on-surface-variant">{data.benchmark.headline.label} / L</span>
          </div>
        </div>
        <div className="mt-4 pt-3 bg-surface-container-low/50 -mx-4 -mb-4 px-4 pb-3 rounded-b-xl flex items-center justify-between text-xs">
          <span className="text-on-surface-variant">{weekOfLabel(data.benchmark.latest_week)}</span>
          <span className="font-mono text-[11px] text-tertiary font-medium">Ex-refinery base</span>
        </div>
      </div>
    </div>
  );
}
