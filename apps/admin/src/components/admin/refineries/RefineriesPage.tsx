// Stitch: dominion-redesign/eeb97dcb5d294afa83867fd432104b75
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dominionCan } from "@roam/auth-client/dominionPermissions";
import { useAuth } from "../../auth/AuthContext";
import { PriceBoard } from "./PriceBoard";
import { ProductsUnitsTable } from "./ProductsUnitsTable";
import { RefineryCards } from "./RefineryCards";
import { RefineryDialog } from "./RefineryDialog";
import { RefineryHeader } from "./RefineryHeader";
import { RefineryTrendChart, rangeStart, type TrendRange } from "./RefineryTrendChart";
import { SyncHealthCard } from "./SyncHealthCard";
import { WeeklyHistoryTable } from "./WeeklyHistoryTable";
import { refineriesApi } from "./refineriesApi";
import "./refineries.css";
import { useRefineryBoard, useRefineryHistory, useRefineryList, useRefineryRuns, useRefinerySeries } from "./useRefineries";

const RANGES: TrendRange[] = ["12w", "26w", "52w", "5y", "All"];

function startRange(fromUrl: string): TrendRange {
  if (fromUrl && RANGES.includes(fromUrl as TrendRange)) return fromUrl as TrendRange;
  return window.matchMedia("(max-width: 639px)").matches ? "12w" : "52w";
}

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const range = params.get("range") || "";
  return {
    refinery: params.get("refinery") || "",
    week: params.get("week") || "",
    range: RANGES.includes(range as TrendRange) ? range as TrendRange : "",
    year: params.get("year") || "",
  };
}

function writeQuery(next: { refinery: string; week: string; range: string; year: string }) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "fuel-prices");
  const set = (key: string, value: string) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  set("refinery", next.refinery);
  set("week", next.week);
  set("range", next.range);
  set("year", next.year);
  for (const key of ["grade", "pcode", "brand"]) url.searchParams.delete(key);
  window.history.replaceState({ page: "fuel-prices" }, "", `${url.pathname}${url.search}`);
}

export function RefineriesPage() {
  const { role } = useAuth();
  const canWrite = dominionCan(role, "catalog.write");
  const client = useQueryClient();
  const initial = useMemo(readQuery, []);
  const list = useRefineryList();
  const [slug, setSlug] = useState(initial.refinery);
  const [week, setWeek] = useState(initial.week);
  const [range, setRange] = useState<TrendRange>(() => startRange(initial.range));
  const [year, setYear] = useState<number | null>(initial.year ? Number(initial.year) : null);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [dialog, setDialog] = useState<null | { step: 1 | 2 }>(null);
  const [syncError, setSyncError] = useState("");
  const [historyFocus, setHistoryFocus] = useState(false);

  const refineries = list.data?.refineries || [];
  const selected = refineries.find((row) => row.slug === slug) || refineries[0];
  const activeSlug = selected?.slug || "";
  const board = useRefineryBoard(activeSlug, week);
  const motor = (board.data?.products || []).filter((product) => product.boardGroup === "motor").map((product) => product.code);
  const seriesCodes = picked.length ? picked : motor;
  const from = rangeStart(range, board.data?.week || selected?.latest_week || null);
  const series = useRefinerySeries(activeSlug, seriesCodes, from, board.data?.week || null, compare);
  const history = useRefineryHistory(activeSlug, year, page);
  const runs = useRefineryRuns(activeSlug);

  useEffect(() => {
    if (!slug && selected) setSlug(selected.slug);
  }, [slug, selected]);

  useEffect(() => {
    writeQuery({ refinery: activeSlug, week, range, year: year ? String(year) : "" });
  }, [activeSlug, week, range, year]);

  function refresh() {
    void client.invalidateQueries({ queryKey: ["refineries"] });
    void client.invalidateQueries({ queryKey: ["refinery-board"] });
    void client.invalidateQueries({ queryKey: ["refinery-series"] });
    void client.invalidateQueries({ queryKey: ["refinery-history"] });
    void client.invalidateQueries({ queryKey: ["refinery-runs"] });
  }

  async function sync(mode: "latest" | "year" | "month" | "all", extra?: { year?: number; month?: number }) {
    if (!activeSlug) return;
    setSyncError("");
    try {
      await refineriesApi.sync(activeSlug, { mode, ...extra });
      refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Could not load refinery prices. Nothing was changed.");
    }
  }

  const failed = list.isError || board.isError;
  const loading = list.isLoading || (Boolean(activeSlug) && board.isLoading);

  return (
    <div className="refineries-stitch p-8 space-y-6 max-w-[1400px] w-full mx-auto min-w-0" data-shell="notifications help_outline">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-outline mb-1 font-normal">
            <span>Dominion</span>
            <span className="text-[10px] text-outline-variant">›</span>
            <span>Master data</span>
            <span className="text-[10px] text-outline-variant">›</span>
            <span>Fuel</span>
            <span className="text-[10px] text-outline-variant">›</span>
            <span className="text-on-surface font-medium">Refineries</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Refineries</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">Every refinery's ex-refinery prices. The benchmark refinery is what pump prices are measured against.</p>
        </div>
        {canWrite ? (
          <button type="button" className="inline-flex items-center gap-2 px-3.5 py-2 bg-secondary text-white text-xs font-medium rounded-lg shadow-sm hover:bg-secondary-dim" onClick={() => setDialog({ step: 1 })}>
            <span className="material-symbols-outlined text-sm">add</span>
            <span>Add refinery</span>
          </button>
        ) : null}
      </div>

      <RefineryCards
        refineries={refineries}
        selected={activeSlug}
        canWrite={canWrite}
        onSelect={(next) => { setSlug(next); setWeek(""); setPage(1); setPicked([]); }}
        onAdd={() => setDialog({ step: 1 })}
      />

      {selected ? (
        <RefineryHeader
          refinery={selected}
          canWrite={canWrite}
          onSync={(mode, extra) => { void sync(mode, extra); }}
          onEnterPrices={() => setDialog({ step: 2 })}
        />
      ) : null}

      {loading ? (
        <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-4 shadow-xs space-y-3">
          <span className="text-[11px] font-mono-code font-semibold text-outline uppercase">Skeleton Shimmer</span>
          <div className="h-7 bg-surface-container rounded w-3/4 animate-pulse" />
        </div>
      ) : null}

      {board.data && selected ? <PriceBoard board={board.data} onWeek={(next) => { setWeek(next); }} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {board.data ? (
          <RefineryTrendChart
            products={board.data.products}
            points={series.data?.points || []}
            range={range}
            refineryName={selected?.name || ""}
            canCompare={refineries.length > 1}
            compare={compare}
            onRange={setRange}
            onProducts={setPicked}
            onCompare={setCompare}
          />
        ) : <div className="lg:col-span-8" />}
        {runs.data ? (
          <SyncHealthCard runs={runs.data} onRevisions={() => setHistoryFocus(true)} />
        ) : <div className="lg:col-span-4" />}
      </div>

      {history.data && activeSlug ? (
        <div className={historyFocus ? "ring-2 ring-secondary/30 rounded-xl" : ""}>
          <WeeklyHistoryTable
            slug={activeSlug}
            history={history.data}
            year={year}
            onYear={(next) => { setYear(next); setPage(1); }}
            onPage={setPage}
          />
        </div>
      ) : null}

      {board.data ? (
        <ProductsUnitsTable products={board.data.products} canWrite={canWrite} onSaved={refresh} />
      ) : null}

      <div className="pt-6 border-t border-surface-variant/60">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono-code text-[11px] uppercase tracking-wider text-outline font-semibold">Console States & Exceptions</span>
          <span className="font-mono-code text-[10px] text-outline">Engine Verification Reference</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-mono-code font-semibold text-outline uppercase">Skeleton Shimmer</span>
              <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" />
            </div>
            <div className="h-3 bg-surface-container rounded w-1/2 animate-pulse" />
            <div className="h-7 bg-surface-container rounded w-3/4 animate-pulse" />
            <div className="h-2 bg-surface-container rounded w-full animate-pulse" />
            <div className="h-2 bg-surface-container rounded w-2/3 animate-pulse" />
          </div>
          <div className={`bg-surface-container-lowest border rounded-xl p-4 shadow-xs flex flex-col justify-between ${failed || syncError ? "border-error/30" : "border-surface-variant/80"}`}>
            <div>
              <div className="flex items-center gap-1.5 text-error text-xs font-semibold">
                <span className="material-symbols-outlined text-sm">error</span>
                <span>Sync Interrupted</span>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1.5 leading-relaxed">
                {syncError || (failed ? "Could not load refinery prices. Nothing was changed." : "Could not load refinery prices. Nothing was changed.")}
              </p>
            </div>
            <div className="mt-3">
              <button type="button" className="px-2.5 py-1 text-xs font-medium rounded bg-surface-container hover:bg-surface-container-high text-on-surface" onClick={() => { setSyncError(""); refresh(); }}>Retry</button>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-4 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-on-surface">No prices yet</div>
              <p className="text-[11px] text-outline mt-1">Data is not in yet for this cycle.</p>
            </div>
            {canWrite ? (
              <div className="flex items-center gap-2 mt-3 font-mono-code text-[11px]">
                <button type="button" className="text-secondary hover:underline" onClick={() => setDialog({ step: 2 })}>Enter week's prices</button>
                <span className="text-outline">·</span>
                <button type="button" className="text-secondary hover:underline" onClick={() => { void sync("latest"); }}>Sync now</button>
              </div>
            ) : null}
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 border border-surface-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-on-surface text-xs font-semibold">
                <span className="material-symbols-outlined text-sm text-outline">lock</span>
                <span>Role Permissions</span>
              </div>
              <p className="text-[11px] text-outline mt-1.5 leading-relaxed">You can view prices. Only the owner can sync or add refineries.</p>
            </div>
            <div className="font-mono-code text-[10px] text-outline mt-2 pt-2 border-t border-surface-variant/40">JMD Ready · Read-Only Mode</div>
          </div>
        </div>
      </div>

      <RefineryDialog
        open={dialog != null}
        step={dialog?.step || 1}
        refinerySlug={activeSlug}
        products={board.data?.products || []}
        existingWeek={board.data?.week || null}
        onClose={() => setDialog(null)}
        onCreated={(next) => { setSlug(next); refresh(); }}
        onSaved={refresh}
      />
    </div>
  );
}
