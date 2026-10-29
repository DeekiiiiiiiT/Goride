import { useBenchmarkName } from "../refineries/useRefineries";
import { fewReports, formatJmd } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";

function Spark({ points, color }: { points: Array<number | null>; color: string }) {
  const values = points.filter((point): point is number => point != null);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 75;
    const y = 20 - ((value - min) / span) * 14;
    return { x, y };
  });
  const d = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg className="h-7 w-24 overflow-visible" viewBox="0 0 80 24" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

function Move({ value, suffix }: { value: number | null; suffix: string }) {
  if (value == null) return <span className="font-mono text-[11px] text-slate-400">—</span>;
  const down = value < 0;
  return (
    <span className="mt-1 flex items-center gap-1 font-mono text-[11px]">
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 ${down ? "bg-red-500/15 text-red-700" : "bg-emerald-500/15 text-emerald-800"}`}>
        {down ? "▼" : "▲"} {formatJmd(Math.abs(value))}
      </span>
      <span className="text-[10px] text-slate-400">{suffix}</span>
    </span>
  );
}

const shell = "relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-1 dark:border-slate-700 dark:bg-slate-900";

export function AnalyticsKpiRow({
  data,
  onOpenStation,
  onReviewPrices,
}: {
  data: StationAnalytics;
  onOpenStation: (placeId: string) => void;
  onReviewPrices: () => void;
}) {
  const benchmarkName = useBenchmarkName();
  const { kpis, meta, trend } = data;
  const pump = trend.map((point) => point.pumpMedian).slice(-12);
  const petro = trend.map((point) => point.petrojam).slice(-12);
  const gapNow = kpis.pumpMedian != null && meta.petrojam != null ? kpis.pumpMedian - meta.petrojam : null;
  const gapPrev = kpis.pumpMedianPrev != null && meta.petrojamPrev != null ? kpis.pumpMedianPrev - meta.petrojamPrev : null;
  const gapDelta = gapNow != null && gapPrev != null ? gapNow - gapPrev : null;
  const wow = kpis.pumpMedian != null && kpis.pumpMedianPrev != null ? kpis.pumpMedian - kpis.pumpMedianPrev : null;
  const petroWow = meta.petrojam != null && meta.petrojamPrev != null ? meta.petrojam - meta.petrojamPrev : null;
  const petroYoy = meta.petrojam != null && meta.petrojamYearAgo != null ? meta.petrojam - meta.petrojamYearAgo : null;
  const gapPct = gapNow != null && meta.petrojam ? (gapNow / meta.petrojam) * 100 : null;
  const coverage = kpis.stationsInScope ? (kpis.stationsPriced / kpis.stationsInScope) * 100 : 0;
  const spread = kpis.min && kpis.max ? kpis.max.price - kpis.min.price : null;
  const money = (value: number) => formatJmd(value).replace("/L", "");

  return (
    <dl className="grid grid-cols-1 gap-3.5 md:grid-cols-5">
      <div className={`${shell} before:bg-gradient-to-r before:from-[#316bf3] before:to-indigo-500`}>
        <dt className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#316bf3]" />Pump median</span>
          {fewReports(kpis.nStations) ? <span className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-700">Few reports</span> : null}
        </dt>
        {kpis.pumpMedian == null ? (
          <dd className="mt-2 text-sm text-slate-500">No pump price this week. <button type="button" className="font-semibold text-[#316bf3]" onClick={onReviewPrices}>Review prices</button></dd>
        ) : (
          <dd>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#316bf3]">{money(kpis.pumpMedian)}<span className="text-xs font-medium text-slate-400">/L</span></div>
            <Move value={wow} suffix="vs last week" />
            <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              <div>Sample</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">{kpis.nStations} stns · {kpis.nReports} reps</div>
            </div>
            <div className="mt-3 flex justify-end"><Spark points={pump} color="#316bf3" /></div>
          </dd>
        )}
      </div>

      <div className={`${shell} before:bg-gradient-to-r before:from-slate-700 before:to-slate-900`}>
        <dt className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-700" />{benchmarkName} ex-refinery</span>
          <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-700">Official</span>
        </dt>
        {meta.petrojam == null ? (
          <dd className="mt-2 text-sm text-slate-500">No {benchmarkName} price for this grade</dd>
        ) : (
          <dd>
            <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{money(meta.petrojam)}<span className="text-xs font-medium text-slate-400">/L</span></div>
            <Move value={petroWow} suffix={petroWow != null && meta.petrojamPrev ? `(${((petroWow / meta.petrojamPrev) * 100).toFixed(1)}%) WoW` : "WoW"} />
            <div className="mt-2 flex items-center justify-between rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-[10px]">
              <span className="text-slate-600">vs LY</span>
              <span className="font-semibold text-emerald-700">{petroYoy == null ? "—" : `${petroYoy < 0 ? "▼" : "▲"} ${formatJmd(Math.abs(petroYoy))} YoY`}</span>
            </div>
            <div className="mt-3 flex justify-end"><Spark points={petro} color="#475569" /></div>
          </dd>
        )}
      </div>

      <div className={`${shell} before:bg-gradient-to-r before:from-amber-500 before:to-orange-500`}>
        <dt className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Gap above refinery</span>
          {gapPct != null ? <span className="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-800">{gapPct.toFixed(1)}% margin</span> : null}
        </dt>
        <dd>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-amber-700">{gapNow == null ? "—" : <>{money(gapNow)}<span className="text-xs font-medium text-slate-400">/L</span></>}</div>
          <Move value={gapDelta} suffix="vs last week" />
          <div className="mt-2 truncate rounded border border-amber-500/15 bg-amber-500/5 px-2 py-1 font-mono text-[10px] text-slate-600">Taxes, distributor & retail</div>
          <div className="mt-3 flex justify-end"><Spark points={pump.map((value, index) => (value != null && petro[index] != null ? value - (petro[index] as number) : null))} color="#d97706" /></div>
        </dd>
      </div>

      <div className={`${shell} before:bg-gradient-to-r before:from-teal-500 before:to-emerald-500`}>
        <dt className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" />Price range</span>
          {spread != null ? <span className="shrink-0 rounded-md border border-teal-500/20 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[9px] text-teal-800">Spread {spread.toFixed(2)}</span> : null}
        </dt>
        <dd>
          {kpis.nStations < 2 || !kpis.min || !kpis.max ? (
            <p className="mt-2 text-sm text-slate-500">Need 2 priced stations</p>
          ) : (
            <>
              <div className="mt-2 font-mono text-base font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">{formatJmd(kpis.min.price)} – {formatJmd(kpis.max.price).replace("J$", "")}</div>
              <div className="mt-2 space-y-1 font-mono text-[10px]">
                <button type="button" className="flex w-full items-center justify-between rounded border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-emerald-800" onClick={() => kpis.min && onOpenStation(kpis.min.placeId)}>
                  <span className="text-[9px] font-semibold">LOW</span>
                  <span className="truncate font-bold">{kpis.min.name.split(" ")[0]} {formatJmd(kpis.min.price)}</span>
                </button>
                <button type="button" className="flex w-full items-center justify-between rounded border border-red-200 bg-red-50 px-2 py-0.5 text-red-700" onClick={() => kpis.max && onOpenStation(kpis.max.placeId)}>
                  <span className="text-[9px] font-semibold">HIGH</span>
                  <span className="truncate font-bold">{kpis.max.name.split(" ")[0]} {formatJmd(kpis.max.price)}</span>
                </button>
              </div>
            </>
          )}
        </dd>
      </div>

      <div className={`${shell} before:bg-gradient-to-r before:from-blue-600 before:to-cyan-500`}>
        <dt className="flex items-start justify-between gap-1 text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Stations priced</span>
          <span className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 font-mono text-[9px] text-blue-700">{coverage.toFixed(1)}% complete</span>
        </dt>
        <dd>
          <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{kpis.stationsPriced} <span className="text-sm font-normal text-slate-400">/ {kpis.stationsInScope}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full border border-slate-200/60 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-[#316bf3] to-cyan-400" style={{ width: `${Math.min(100, coverage)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
            <span className="font-semibold text-emerald-700">{kpis.nStations} priced this week</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Verified: {kpis.verified}</span>
          </div>
        </dd>
      </div>
    </dl>
  );
}
