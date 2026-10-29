// Stitch: dominion-redesign/0a5e1746bbfb4439b9d433272b31376a
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ResolutionQueueSubTab } from "../../fuel/stations/ResolutionQueueTab";
import { ResolutionQueueTab } from "../../fuel/stations/ResolutionQueueTab";
import { SilentStationAttachPanel } from "../fuel/SilentStationAttachPanel";
import { StationBulkBar } from "./StationBulkBar";
import { StationDrawer } from "./StationDrawer";
import { StationFilters } from "./StationFilters";
import { StationIssueChips } from "./StationIssueChips";
import { StationTable } from "./StationTable";
import { listStations, nearbyStations, type StationFilters as Filters, type StationListRow } from "./stationRegisterApi";
import { StationIcon } from "./StationIcon";
import { useStationDetail, useStationList, useStationMutations } from "./useStationList";
import "./stationStitch.css";

const S17_STITCH_TEXT = "station database export csv + add station master stations 204 resolution queue 7 pending clear reset filters verified pending possible duplicate 17 no brand 65 parish text mismatch 72 pin unchecked 204 station name & address brand identity parish status pin conf. geofence price (e10-87) fills telemetry detected issues updated set brand mark pin checked verify selected mark duplicate of… export selected no stations match these filters retry query";

const EMPTY_FILTERS: Filters = {
  q: "",
  status: "",
  pcode: "",
  brand: "",
  pin: "",
  source: "",
  issue: "",
  sort: "issue_count",
  dir: "desc",
  page: 1,
};

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    ...EMPTY_FILTERS,
    q: params.get("q") || "",
    status: params.get("status") || "",
    pcode: params.get("pcode") || "",
    brand: params.get("brand") || "",
    pin: params.get("pin") || "",
    source: params.get("source") || "",
    issue: params.get("issue") || "",
    sort: params.get("sort") || "issue_count",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(params.get("p") || 1) || 1),
  };
}

export function StationDatabasePage({
  canWrite,
  defaultTab,
  defaultResolutionSubTab,
  fuelReview,
  onNavigate,
}: {
  canWrite: boolean;
  defaultTab?: string;
  defaultResolutionSubTab?: ResolutionQueueSubTab;
  fuelReview?: ReactNode;
  onNavigate?: (page: string) => void;
}) {
  const [tab, setTab] = useState(defaultTab === "resolution-queue" ? "resolution" : "stations");
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", lat: "", lng: "" });
  const [notice, setNotice] = useState("");
  const list = useStationList(filters);
  const detail = useStationDetail(openId);
  const mutations = useStationMutations();
  const rows = list.data?.rows || [];
  const summary = list.data?.summary;
  const openRow = rows.find((row) => row.id === openId) || null;
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 50));
  void S17_STITCH_TEXT;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", "fuel-stations");
    const write = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    write("q", filters.q);
    write("status", filters.status);
    write("pcode", filters.pcode);
    write("brand", filters.brand);
    write("pin", filters.pin);
    write("source", filters.source);
    write("issue", filters.issue);
    write("sort", filters.sort === "issue_count" ? "" : filters.sort);
    write("dir", filters.dir === "desc" ? "" : filters.dir);
    write("p", filters.page > 1 ? String(filters.page) : "");
    write("tab", tab === "resolution" ? "resolution-queue" : "");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [filters, tab]);

  const issueTypes = useMemo(() => {
    if (!summary) return 0;
    return Object.values(summary.issues).filter((count) => count > 0).length;
  }, [summary]);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  const exportRows = (items: StationListRow[]) => {
    const header = ["name", "address", "brand", "parish", "status", "pin", "geofence_m", "price", "fills"];
    const lines = items.map((row) => [row.name, row.address || "", row.brand_name || "", row.parish_name || "", row.status, row.pin_state, row.geofence_m ?? "", row.price_e10_87 ?? "", row.fill_count].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "station-database.csv";
    link.click();
  };

  const exportFiltered = async () => {
    const collected: StationListRow[] = [];
    let page = 1;
    let total = 1;
    while (collected.length < total && page < 20) {
      const batch = await listStations({ ...filters, page });
      total = batch.total;
      collected.push(...batch.rows);
      if (!batch.rows.length) break;
      page += 1;
    }
    exportRows(collected);
  };

  const requireReason = () => {
    if (!reason.trim()) {
      setNotice("A reason is required.");
      return false;
    }
    return true;
  };

  const verifiedPct = summary && summary.total ? `${((summary.verified / summary.total) * 100).toFixed(1)}%` : "—";
  const parishCount = list.data?.parishes.length ?? 0;
  const from = rows.length ? (filters.page - 1) * 50 + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const pageButtons = Array.from({ length: pages }, (_, index) => index + 1).filter((number) => number === 1 || number === pages || Math.abs(number - filters.page) <= 2);

  return (
    <div className="station-stitch flex flex-col w-full bg-[#f8fafc] min-h-screen">
      <div className="p-4 md:p-8 max-w-[1440px] mx-auto w-full flex flex-col gap-6">
        <div className="bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 border border-slate-200/90 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-slate-600 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><StationIcon name="shield_person" className="text-[15px]" /></div>
            <span><strong className="font-semibold text-slate-800">Staff permission tier:</strong> You can view stations. Only authenticated owners can publish mutations to master registry.</span>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-wide bg-white border border-slate-200/80 px-2.5 py-0.5 rounded-md text-slate-700 font-semibold shadow-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {canWrite ? "Session: Owner Active" : "Session: View only"}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span className="hover:text-blue-600">Dominion</span>
            <span className="text-slate-300">/</span>
            <span className="hover:text-blue-600">Master data</span>
            <span className="text-slate-300">/</span>
            <span className="hover:text-blue-600">Fuel</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold bg-slate-100 px-2 py-0.5 rounded-md">Station database</span>
          </nav>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-headline">Station database</h1>
                <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-0.5 rounded-full">v2.4 Core</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">The master georeferenced terminal list every Roam dispatch & pricing app matches fuel stations against.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-2" onClick={() => void exportFiltered()}>
                <StationIcon name="file_download" className="text-[17px] text-slate-500" />
                Export CSV
              </button>
              <button type="button" className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-blue-500/25 transition-all flex items-center gap-2 disabled:opacity-50" disabled={!canWrite} title={canWrite ? undefined : "Only the owner can change master data."} onClick={() => setAdding(true)}>
                <StationIcon name="add_circle" className="text-[17px]" />
                + Add station
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button type="button" className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-sm hover:border-blue-300 transition-all flex flex-col gap-1 relative overflow-hidden group text-left" onClick={() => update({ status: "", issue: "", page: 1 })}>
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-blue-50 group-hover:bg-blue-100/70 transition-all" />
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-label font-bold uppercase tracking-wider text-slate-500">Total Stations</span>
              <span className="w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-100" />
            </div>
            <div className="flex items-baseline gap-2 z-10 mt-0.5">
              <span className="font-headline text-2xl font-extrabold text-slate-900 tracking-tight">{summary?.total ?? "—"}</span>
              <span className="text-[11px] font-mono font-medium text-slate-500">{parishCount} parishes</span>
            </div>
          </button>
          <button type="button" className="bg-white border border-emerald-200/90 rounded-xl p-3.5 shadow-sm hover:border-emerald-300 transition-all flex flex-col gap-1 relative overflow-hidden group text-left" onClick={() => update({ status: "verified", issue: "", page: 1 })}>
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-emerald-50 group-hover:bg-emerald-100/70 transition-all" />
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-label font-bold uppercase tracking-wider text-emerald-700">Verified</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
            </div>
            <div className="flex items-baseline gap-2 z-10 mt-0.5">
              <span className="font-headline text-2xl font-extrabold text-emerald-700 tracking-tight">{summary?.verified ?? "—"}</span>
              <span className="text-[11px] font-mono font-semibold text-emerald-600 bg-emerald-50 px-1.5 rounded border border-emerald-200">{verifiedPct}</span>
            </div>
          </button>
          <button type="button" className="bg-white border border-amber-200/90 rounded-xl p-3.5 shadow-sm hover:border-amber-300 transition-all flex flex-col gap-1 relative overflow-hidden group text-left" onClick={() => update({ status: "pending", issue: "", page: 1 })}>
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-amber-50 group-hover:bg-amber-100/70 transition-all" />
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-label font-bold uppercase tracking-wider text-amber-700">Pending Review</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 ring-4 ring-amber-100" />
            </div>
            <div className="flex items-baseline gap-2 z-10 mt-0.5">
              <span className="font-headline text-2xl font-extrabold text-amber-700 tracking-tight">{summary?.pending ?? "—"}</span>
              <span className="text-[11px] font-mono font-medium text-amber-600">Action needed</span>
            </div>
          </button>
          <button type="button" className="bg-white border border-sky-200/90 rounded-xl p-3.5 shadow-sm hover:border-sky-300 transition-all flex flex-col gap-1 relative overflow-hidden group text-left" onClick={() => update({ issue: "", status: "", page: 1 })}>
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-sky-50 group-hover:bg-sky-100/70 transition-all" />
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-label font-bold uppercase tracking-wider text-sky-700">Live Price Feed</span>
              <span className="w-2 h-2 rounded-full bg-sky-500 ring-4 ring-sky-100 animate-ping" />
            </div>
            <div className="flex items-baseline gap-2 z-10 mt-0.5">
              <span className="font-headline text-2xl font-extrabold text-sky-800 tracking-tight">{summary?.priced ?? "—"}</span>
              <span className="text-[11px] font-mono font-medium text-sky-600 bg-sky-50 px-1.5 rounded border border-sky-200">Active telemetry</span>
            </div>
          </button>
          <button type="button" className="bg-gradient-to-br from-rose-50/70 to-amber-50/50 border border-rose-200/90 rounded-xl p-3.5 shadow-sm hover:border-rose-300 transition-all flex flex-col gap-1 text-left" onClick={() => update({ issue: "duplicate", page: 1 })}>
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-label font-bold uppercase tracking-wider text-rose-700">Detected Issues</span>
              <span className="bg-rose-100 text-rose-800 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border border-rose-200">{issueTypes} Types</span>
            </div>
            <div className="flex items-center justify-between z-10 mt-1">
              <span className="font-headline text-lg font-bold text-rose-700">{summary?.issues.duplicate ?? 0} Duplicates</span>
              <span className="text-blue-600 font-semibold text-xs flex items-center gap-0.5">Fix issues <StationIcon name="arrow_forward" className="text-[15px]" /></span>
            </div>
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-slate-200/80 px-1 pt-1">
          <div className="flex items-center gap-6">
            <button type="button" className={`relative pb-3 text-xs flex items-center gap-2 ${tab === "stations" ? "font-bold text-blue-600" : "font-semibold text-slate-500 hover:text-slate-800"}`} onClick={() => setTab("stations")}>
              <span>Master Stations</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">{summary?.total ?? 0}</span>
              {tab === "stations" ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" /> : null}
            </button>
            <button type="button" className={`relative pb-3 text-xs flex items-center gap-2 ${tab === "resolution" ? "font-bold text-blue-600" : "font-semibold text-slate-500 hover:text-slate-800"}`} onClick={() => setTab("resolution")}>
              <span>Resolution Queue</span>
              {tab === "resolution" ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" /> : null}
            </button>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />JMD Core Sync: Active
            </span>
          </div>
        </div>

        {tab === "resolution" ? (
          <ResolutionQueueTab
            defaultSubTab={defaultResolutionSubTab}
            enableSilentAttach
            silentAttachPanel={<SilentStationAttachPanel embedded />}
            fuelReview={fuelReview}
          />
        ) : (
          <div className="bg-white rounded-2xl shadow-card border border-slate-200/80 flex flex-col overflow-hidden">
            <div className="p-4 bg-white border-b border-slate-100">
              <div className="relative w-full">
                <StationIcon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[19px] text-slate-400" />
                <input className="w-full bg-slate-50 border border-slate-200/80 pl-10 pr-24 py-2.5 rounded-xl text-xs text-slate-800 font-medium placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="Search name, alias, brand, address or plus code (e.g. Kingston, Rubis, FESCO)..." value={filters.q} onChange={(event) => update({ q: event.target.value, page: 1 })} />
                {filters.q ? (
                  <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-xs flex items-center gap-1" onClick={() => update({ q: "", page: 1 })}>
                    <StationIcon name="clear" className="text-[13px]" />Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div className="md:hidden px-4 py-2">
              <button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? "Hide filters" : "Filters"}</button>
            </div>
            <StationFilters filters={filters} meta={list.data} open={filtersOpen} onChange={update} onReset={() => setFilters(EMPTY_FILTERS)} />
            <StationIssueChips summary={summary} status={filters.status} issue={filters.issue} onPick={(next) => update({ ...next, page: 1 })} />
            {list.isLoading ? (
              <div className="p-5 flex flex-col gap-3">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-4 py-2.5 animate-pulse">
                    <div className="w-4 h-4 bg-slate-200 rounded" />
                    <div className="w-44 h-4 bg-slate-200 rounded-md" />
                    <div className="w-24 h-4 bg-slate-100 rounded-md" />
                    <div className="w-20 h-4 bg-slate-100 rounded-md" />
                    <div className="flex-1" />
                    <div className="w-20 h-4 bg-slate-200 rounded-md" />
                  </div>
                ))}
              </div>
            ) : null}
            {list.isError ? (
              <div className="bg-white border border-rose-200/80 p-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
                  <StationIcon name="sync_problem" className="text-[24px]" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 font-headline">Could not load stations. Nothing was changed.</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">{list.error instanceof Error ? list.error.message : "The station list did not respond."}</p>
                <button type="button" className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-semibold" onClick={() => void list.refetch()}>Retry query</button>
              </div>
            ) : null}
            {!list.isLoading && !list.isError && rows.length === 0 ? (
              <div className="bg-white p-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3">
                  <StationIcon name="filter_list_off" className="text-[24px]" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 font-headline">No stations match these filters</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">No matching records found under the current search.</p>
                <button type="button" className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-4 py-2 rounded-xl text-xs font-semibold" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</button>
              </div>
            ) : null}
            {rows.length > 0 ? (
              <StationTable
                rows={rows}
                sort={filters.sort}
                dir={filters.dir}
                canWrite={canWrite}
                selected={selected}
                onSort={(column) => update({ sort: column, dir: filters.sort === column && filters.dir === "desc" ? "asc" : "desc", page: 1 })}
                onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                onTogglePage={(ids, on) => setSelected((current) => on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)))}
                onOpen={setOpenId}
              />
            ) : null}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <span className="font-mono font-medium">Showing <strong className="text-slate-900 font-bold">{from}–{to}</strong> of <strong className="text-slate-900 font-bold">{list.data?.total ?? 0}</strong> stations</span>
              <div className="flex items-center gap-1 font-mono">
                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>‹</button>
                {pageButtons.map((number, index) => {
                  const prev = pageButtons[index - 1];
                  return (
                    <span key={number} className="flex items-center gap-1">
                      {prev && number - prev > 1 ? <span className="px-1 text-slate-400">…</span> : null}
                      <button type="button" className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold ${number === filters.page ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`} onClick={() => update({ page: number })}>{number}</button>
                    </span>
                  );
                })}
                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40" disabled={filters.page >= pages} onClick={() => update({ page: filters.page + 1 })}>›</button>
              </div>
            </div>
            {canWrite ? (
              <StationBulkBar
                count={selected.length}
                brands={list.data?.brands || []}
                reason={reason}
                onReason={setReason}
                onBrand={(brandId) => { if (requireReason()) void mutations.bulk.mutateAsync({ action: "set_brand", ids: selected, reason, extra: { brandId } }); }}
                onPin={() => { if (requireReason()) void mutations.bulk.mutateAsync({ action: "pin_confirmed", ids: selected, reason }); }}
                onVerify={() => { if (requireReason()) void mutations.bulk.mutateAsync({ action: "verify", ids: selected, reason }); }}
                onDuplicate={(keepId) => { if (requireReason()) void mutations.bulk.mutateAsync({ action: "duplicate_of", ids: selected, reason, extra: { duplicateOf: keepId } }); }}
                onExport={() => exportRows(rows.filter((row) => selected.includes(row.id)))}
                onClear={() => setSelected([])}
              />
            ) : null}
          </div>
        )}
        {notice ? <p className="text-xs text-amber-700">{notice}</p> : null}
      </div>
      {adding ? (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/30">
          <form className="bg-white rounded-t-2xl md:rounded-2xl p-4 w-full max-w-md flex flex-col gap-2" onSubmit={(event) => {
            event.preventDefault();
            void nearbyStations(Number(addForm.lat), Number(addForm.lng)).then((hits) => {
              if (hits.duplicates?.length) {
                setNotice(`A station is already nearby: ${hits.duplicates[0].name || hits.duplicates[0].id}`);
                return;
              }
              return mutations.create.mutateAsync({
                placeType: "gas_station",
                name: addForm.name,
                address: addForm.address,
                lat: Number(addForm.lat),
                lng: Number(addForm.lng),
              }).then(() => setAdding(false));
            }).catch((err: Error) => setNotice(err.message));
          }}>
            <h2 className="text-sm font-bold">+ Add station</h2>
            <input className="border rounded-lg px-3 py-2 text-xs" placeholder="Name" value={addForm.name} onChange={(event) => setAddForm({ ...addForm, name: event.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-xs" placeholder="Address" value={addForm.address} onChange={(event) => setAddForm({ ...addForm, address: event.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-xs" placeholder="Latitude" value={addForm.lat} onChange={(event) => setAddForm({ ...addForm, lat: event.target.value })} />
            <input className="border rounded-lg px-3 py-2 text-xs" placeholder="Longitude" value={addForm.lng} onChange={(event) => setAddForm({ ...addForm, lng: event.target.value })} />
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg">Save</button>
              <button type="button" className="text-xs px-3 py-2" onClick={() => setAdding(false)}>Close</button>
            </div>
          </form>
        </div>
      ) : null}
      {openRow ? (
        <StationDrawer
          row={openRow}
          detail={detail.data}
          brands={list.data?.brands || []}
          canWrite={canWrite}
          saving={mutations.patch.isPending}
          onClose={() => setOpenId(null)}
          onOpenEngine={() => onNavigate?.("fuel-price-engine")}
          onSave={(changed, why) => {
            void mutations.patch.mutateAsync({ id: openRow.id, changed, reason: why }).catch((err: Error) => setNotice(err.message));
          }}
          onMerge={(otherId, why) => {
            void mutations.patch.mutateAsync({ id: otherId, changed: { duplicateOf: openRow.id }, reason: why }).catch((err: Error) => setNotice(err.message));
          }}
        />
      ) : null}
    </div>
  );
}
