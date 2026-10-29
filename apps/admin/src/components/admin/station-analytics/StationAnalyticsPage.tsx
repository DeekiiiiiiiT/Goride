// Stitch: dominion-redesign/4016415050784fcdbbaa4a9e516fa47b
import { useCallback, useEffect, useMemo, useState } from "react";
import { DominionError, DominionLoading } from "../DominionStates";
import { PriceEngineStationDrawer } from "../fuel-prices/PriceEnginePublished";
import { peFetch, type Published } from "../fuel-prices/priceEngineApi";
import { AnalyticsKpiRow } from "./AnalyticsKpiRow";
import { AnalyticsNarrative } from "./AnalyticsNarrative";
import { BrandBars } from "./BrandBars";
import { DataToFixPanel } from "./DataToFixPanel";
import { DataTrustCard } from "./DataTrustCard";
import { ParishTable } from "./ParishTable";
import { PriceTrendChart } from "./PriceTrendChart";
import { StationPriceMap } from "./StationPriceMap";
import { exportStationCsv, StationPriceTable } from "./StationPriceTable";
import type { AnalyticsFilters } from "./stationAnalyticsApi";
import { formatWeek, gradeLabel } from "./stationAnalyticsFormat";
import { useStationAnalytics } from "./useStationAnalytics";
import { useBenchmarkName } from "../refineries/useRefineries";

function readFilters(): AnalyticsFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    grade: params.get("grade") || "e10_87",
    week: params.get("week") || "",
    pcode: params.get("pcode") || "",
    brand: params.get("brand") || "",
  };
}

function writeFilters(filters: AnalyticsFilters) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "fuel-analytics");
  url.searchParams.set("grade", filters.grade);
  const set = (key: string, value: string) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  set("week", filters.week);
  set("pcode", filters.pcode);
  set("brand", filters.brand);
  window.history.replaceState({ page: "fuel-analytics" }, "", `${url.pathname}${url.search}`);
}

export function StationAnalyticsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const benchmarkName = useBenchmarkName();
  const [filters, setFilters] = useState<AnalyticsFilters>(readFilters);
  const [phone, setPhone] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const [brandChoices, setBrandChoices] = useState<Array<{ brandId: string | null; name: string }>>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcError, setRecalcError] = useState("");
  const query = useStationAnalytics(filters);
  const data = query.data;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const onChange = () => setPhone(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!data?.brands || filters.brand) return;
    setBrandChoices(data.brands.map((brand) => ({ brandId: brand.brandId, name: brand.name })));
  }, [data, filters.brand]);

  const update = useCallback((patch: Partial<AnalyticsFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      writeFilters(next);
      return next;
    });
  }, []);

  const openStation = useCallback((placeId: string) => setDrawerId(placeId), []);
  const reviewPrices = useCallback(() => onNavigate("fuel-price-engine"), [onNavigate]);

  const drawer = useMemo(() => data?.stations.find((station) => station.placeId === drawerId) ?? null, [data, drawerId]);
  const grades: Published[] = drawer && drawer.price != null ? [{
    place_id: drawer.placeId,
    place_name: drawer.name,
    grade: data?.meta.grade || filters.grade,
    price_per_litre: drawer.price,
    confidence: drawer.confidence,
    report_count: drawer.reportCount,
    outdated: Boolean(drawer.outdated),
    observed_at: drawer.lastReportAt,
  }] : [];

  async function recalculate() {
    setRecalcBusy(true);
    setRecalcError("");
    try {
      await peFetch("/admin/prices/recalculate-all", { method: "POST" });
      await query.refetch();
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : "Could not recalculate prices");
    } finally {
      setRecalcBusy(false);
    }
  }

  if (query.isLoading && !data) return <DominionLoading />;
  if (query.isError && !data) {
    return <DominionError onRetry={() => { void query.refetch(); }} />;
  }
  if (!data) return <DominionLoading />;

  const weeks = data.meta.availableWeeks || [];
  const gradesList = data.meta.grades?.length ? data.meta.grades : [filters.grade];
  const brands = brandChoices.length ? brandChoices : data.brands;
  const when = data.meta.lastReportAt ? formatWeek(data.meta.lastReportAt) : "no pump report yet";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 text-[13px] text-slate-900 dark:text-slate-100">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs text-slate-500">Dominion › Master data › Fuel › Station analytics</p>
          <h1 className="text-2xl font-bold tracking-tight">Station analytics</h1>
          <p className="text-xs text-slate-500">Pump prices against {benchmarkName}, coverage and data trust by parish and brand.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900"
          onClick={() => exportStationCsv(data, filters, benchmarkName)}
        >
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Grade" value={filters.grade} onChange={(event) => update({ grade: event.target.value })}>
          {gradesList.map((grade) => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Week" value={filters.week || data.meta.week || ""} onChange={(event) => update({ week: event.target.value })}>
          {weeks.map((week) => <option key={week} value={week.slice(0, 10)}>{formatWeek(week)}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Parish" value={filters.pcode} onChange={(event) => update({ pcode: event.target.value })}>
          <option value="">All parishes</option>
          {data.parishes.map((parish) => <option key={parish.pcode} value={parish.pcode}>{parish.name}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Brand" value={filters.brand} onChange={(event) => update({ brand: event.target.value })}>
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand.brandId || "none"} value={brand.brandId || "none"}>{brand.name}</option>
          ))}
        </select>
        <button type="button" className="font-semibold text-[#316bf3]" onClick={() => update({ grade: "e10_87", week: "", pcode: "", brand: "" })}>Reset</button>
        <span className="text-slate-500">
          {benchmarkName} week {formatWeek(data.meta.week)} · Newest pump report {when} · {data.trust.reporters} {data.trust.reporters === 1 ? "reporter" : "reporters"} · Fleet {data.trust.fleet} · Plug {data.trust.plug}
        </span>
      </div>
      {query.isError ? (
        <p className="text-xs text-red-700">
          Could not load station analytics. This is not the same as no data.{" "}
          <button type="button" className="font-semibold" onClick={() => { void query.refetch(); }}>Retry</button>
        </p>
      ) : null}

      <BrandBars brands={data.brands} onSelect={(brand) => update({ brand })} />
      <AnalyticsKpiRow data={data} onOpenStation={openStation} onReviewPrices={reviewPrices} />
      <AnalyticsNarrative data={data} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <StationPriceMap stations={data.stations} onOpen={openStation} />
        <DataTrustCard data={data} onReviewPrices={reviewPrices} />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <ParishTable rows={data.parishes} selected={filters.pcode} onSelect={(pcode) => update({ pcode })} onCoverage={() => onNavigate("plug-places")} />
        <PriceTrendChart data={data} phone={phone} />
      </div>
      <StationPriceTable data={data} onOpen={openStation} />
      <DataToFixPanel quality={data.quality} onNavigate={onNavigate} />
      {recalcError ? <p className="text-xs text-red-700">{recalcError}</p> : null}
      {drawer ? (
        <PriceEngineStationDrawer
          placeId={drawer.placeId}
          placeName={drawer.name}
          grades={grades}
          onClose={() => setDrawerId(null)}
          onRecalculate={() => { void recalculate(); }}
          recalcBusy={recalcBusy}
        />
      ) : null}
    </div>
  );
}
