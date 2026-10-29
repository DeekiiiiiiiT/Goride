import { useCallback, useEffect, useMemo, useState } from "react";
import { gradeLabel, money, peFetch, type Published, type Tab } from "./priceEngineApi";

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

const GRADES = ["e10_87", "e10_90", "diesel", "ulsd"] as const;
type GradeKey = (typeof GRADES)[number];

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "Just now";
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 8) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-JM", { day: "numeric", month: "short" });
}

function stationInitials(name: string): string {
  const parts = name.split(/[\s,|]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarTone(seed: string): string {
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  const tones = [
    "bg-error-container text-on-error-container",
    "bg-error text-on-error",
    "bg-secondary-container text-on-secondary-container",
    "bg-secondary text-on-secondary",
    "bg-tertiary text-on-tertiary",
    "bg-surface-container-highest text-on-surface-variant",
  ];
  return tones[n % tones.length];
}

function gradeFilterClass(grade: GradeKey, active: GradeKey): string {
  if (grade !== active) {
    return "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors";
  }
  switch (grade) {
    case "e10_87":
      return "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-tertiary text-on-tertiary flex items-center gap-1.5 shadow-sm transition-all";
    case "e10_90":
      return "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-error text-on-error flex items-center gap-1.5 hover:opacity-90 transition-opacity";
    case "diesel":
      return "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-inverse-surface text-surface-container-lowest flex items-center gap-1.5 hover:opacity-90 transition-opacity";
    default:
      return "px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-container text-on-surface shadow-sm";
  }
}

function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "e10_87":
      return "px-2 py-1 rounded bg-tertiary-container text-on-tertiary-container text-[11px] font-label font-bold tracking-tight";
    case "e10_90":
      return "px-2 py-1 rounded bg-error-container text-on-error-container text-[11px] font-label font-bold tracking-tight";
    case "diesel":
      return "px-2 py-1 rounded bg-inverse-surface text-surface-container-lowest text-[11px] font-label font-bold tracking-tight";
    default:
      return "px-2 py-1 rounded bg-surface-container-highest text-on-surface text-[11px] font-label font-bold tracking-tight";
  }
}

function confidenceBadge(confidence: string | null) {
  const c = (confidence || "").toLowerCase();
  if (c.includes("high")) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-tertiary-container text-on-tertiary-container"
        title={confidence || undefined}
      >
        <Ms name="check_circle" className="text-[13px]" />
        High
      </span>
    );
  }
  if (c.includes("medium") || c.includes("med")) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-surface-container-high text-on-surface"
        title={confidence || undefined}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-outline" />
        Medium
      </span>
    );
  }
  if (c.includes("low")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container text-outline">
        Low
      </span>
    );
  }
  return <span className="text-[11px] text-outline">{confidence || "—"}</span>;
}

function PriceEngineTabBar({
  active,
  onTab,
  reviewCount,
}: {
  active: Tab;
  onTab: (tab: Tab) => void;
  reviewCount: number;
}) {
  const tabs: { id: Tab; label: string; icon?: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "review", label: "Review" },
    { id: "published", label: "Published prices", icon: "local_gas_station" },
    { id: "reporters", label: "Reporters" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-container rounded-xl w-fit overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              isActive
                ? "px-4 py-2 rounded-lg text-xs font-bold text-on-secondary bg-secondary shadow-sm flex items-center gap-1.5 whitespace-nowrap"
                : "px-4 py-2 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50 transition-colors flex items-center gap-2 whitespace-nowrap"
            }
          >
            {t.icon ? <Ms name={t.icon} className="text-[15px]" /> : null}
            {t.label}
            {t.id === "review" && reviewCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-error-container text-on-error-container text-[10px] font-mono font-bold">
                {reviewCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PriceEngineStationDrawer({
  placeId,
  placeName,
  grades,
  onClose,
  onRecalculate,
  recalcBusy,
}: {
  placeId: string;
  placeName: string;
  grades: Published[];
  onClose: () => void;
  onRecalculate: () => void;
  recalcBusy: boolean;
}) {
  const initials = stationInitials(placeName);
  const tone = avatarTone(placeName);
  const live = grades.some((g) => !g.outdated);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-on-surface/20 backdrop-blur-[1px]"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed top-16 right-0 bottom-0 w-[520px] max-w-full bg-surface-container-lowest shadow-2xl z-50 flex flex-col justify-between overflow-hidden"
        style={{ boxShadow: "-8px 0 24px -4px rgba(15, 23, 42, 0.12)" }}
      >
        <div className="px-6 py-5 bg-surface-container-lowest shadow-sm flex items-start justify-between relative z-10">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded flex items-center justify-center font-headline font-bold text-xs shadow-sm ${tone}`}
              >
                {initials.slice(0, 1)}
              </span>
              <h2 className="text-lg font-headline font-bold text-on-surface tracking-tight">{placeName}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {live ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label text-[10px] font-bold tracking-wide">
                  <Ms name="verified" className="text-[12px]" />
                  Live published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-outline font-label text-[10px] font-medium">
                  <Ms name="schedule" className="text-[12px]" />
                  May be outdated
                </span>
              )}
              <span className="text-outline-variant font-mono text-[10px]">ID: {placeId.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close station detail drawer"
            className="p-1.5 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container transition-colors"
            onClick={onClose}
          >
            <Ms name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-label uppercase tracking-wider font-bold text-outline">
                Current Published Benchmarks
              </h3>
              <span className="text-[11px] text-tertiary font-mono font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                Live Engine Active
              </span>
            </div>
            <div className="bg-surface-container-low rounded-xl p-3 space-y-2">
              {grades.length === 0 ? (
                <p className="text-xs text-on-surface-variant p-2">No published grades for this station.</p>
              ) : (
                grades.map((row) => (
                  <div
                    key={row.grade}
                    className="bg-surface-container-lowest p-3 rounded-lg flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={gradeBadgeClass(row.grade)}>{gradeLabel(row.grade)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-mono font-bold text-on-surface">
                            {money(row.price_per_litre)}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="font-semibold text-on-surface">{row.confidence || "—"}</span>
                          <span>•</span>
                          <span>{row.report_count ?? 0} reports</span>
                          <span>•</span>
                          <span className="font-mono">Updated {timeAgo(row.observed_at)}</span>
                        </div>
                        <div className="text-[10px] font-mono text-outline mt-0.5">
                          Fleet {row.fleet_count ?? 0} • Plug {row.plug_count ?? 0}
                          {row.petrojam_week ? ` • Week ${String(row.petrojam_week).slice(0, 10)}` : null}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-outline uppercase bg-surface-container px-2 py-1 rounded shrink-0">
                      {row.outdated ? "Stale" : "Live"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-5 bg-surface-container-lowest shadow-md flex items-center justify-between gap-3 relative z-10">
          <button
            type="button"
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label font-semibold text-xs transition-colors flex items-center justify-center gap-2"
            onClick={() => {
              window.location.hash = "places";
            }}
          >
            <Ms name="map" className="text-[16px]" />
            <span>Open place in Places register</span>
          </button>
          <button
            type="button"
            disabled={recalcBusy}
            className="px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary-dim text-on-secondary font-label font-semibold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
            onClick={onRecalculate}
          >
            <Ms name={`calculate`} className={`text-[16px] ${recalcBusy ? "animate-spin" : ""}`} />
            <span>Recalculate all</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export function PriceEnginePublishedTab({
  onTab,
  onError,
  reviewCount = 0,
  petrojamWeek = "—",
}: {
  onTab: (tab: Tab) => void;
  onError: (message: string) => void;
  reviewCount?: number;
  petrojamWeek?: string;
}) {
  const [items, setItems] = useState<Published[]>([]);
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState<GradeKey>("e10_87");
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("");
  const [showOutdated, setShowOutdated] = useState(true);
  const [drawerPlaceId, setDrawerPlaceId] = useState<string | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(() => {
    setLoading(true);
    void peFetch<{ items: Published[] }>("/admin/prices/published")
      .then((body) => setItems(body.items || []))
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [grade, search, confidenceFilter, showOutdated]);

  const byPlace = useMemo(() => {
    const map = new Map<string, Published[]>();
    for (const row of items) {
      const list = map.get(row.place_id) || [];
      list.push(row);
      map.set(row.place_id, list);
    }
    return map;
  }, [items]);

  const gradeRows = useMemo(() => {
    return items.filter((row) => row.grade === grade);
  }, [items, grade]);

  const stats = useMemo(() => {
    const live = gradeRows.filter((r) => !r.outdated).length;
    const outdated = gradeRows.filter((r) => r.outdated).length;
    let cheapest: Published | null = null;
    for (const row of gradeRows.filter((r) => !r.outdated && r.price_per_litre != null)) {
      if (!cheapest || row.price_per_litre < cheapest.price_per_litre) cheapest = row;
    }
    return { live, outdated, cheapest };
  }, [gradeRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gradeRows.filter((row) => {
      if (!showOutdated && row.outdated) return false;
      if (confidenceFilter) {
        const c = (row.confidence || "").toLowerCase();
        if (confidenceFilter === "high" && !c.includes("high")) return false;
        if (confidenceFilter === "medium" && !c.includes("med")) return false;
        if (confidenceFilter === "low" && !c.includes("low")) return false;
      }
      if (q) {
        const hay = `${row.place_name || ""} ${row.place_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [gradeRows, search, confidenceFilter, showOutdated]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const drawerGrades = drawerPlaceId ? byPlace.get(drawerPlaceId) || [] : [];
  const drawerName = drawerGrades[0]?.place_name || drawerPlaceId || "Station";

  const recalculateAll = () => {
    setRecalcBusy(true);
    void peFetch<{ republished: number }>("/admin/prices/recalculate-all", { method: "POST" })
      .then(() => load())
      .catch((err: Error) => onError(err.message))
      .finally(() => setRecalcBusy(false));
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-label text-outline">
            <span>Dominion</span>
            <span className="text-outline-variant">›</span>
            <span>Master data</span>
            <span className="text-outline-variant">›</span>
            <span>Fuel</span>
            <span className="text-outline-variant">›</span>
            <span className="font-semibold text-on-surface">Price Engine</span>
          </nav>
          <div className="flex items-baseline gap-3 pt-1">
            <h1 className="text-2xl font-bold font-headline tracking-tight text-on-surface">Price Engine</h1>
            <p className="text-xs text-on-surface-variant">
              Turns driver fuel reports into one trusted price per station and grade.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high shadow-sm">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="font-mono text-xs font-semibold text-on-surface tracking-wider">REGION: JM-KGN</span>
          </div>
          <div className="px-2.5 py-1.5 rounded-lg bg-surface-container text-xs font-mono text-outline">
            {petrojamWeek !== "—" ? `PETROJAM ${petrojamWeek}` : "PETROJAM"}
          </div>
        </div>
      </div>

      <PriceEngineTabBar active="published" onTab={onTab} reviewCount={reviewCount} />

      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-tertiary-container text-on-tertiary-container flex items-center justify-center shrink-0">
            <Ms name="insights" className="text-[20px]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-bold text-on-surface flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                {stats.live} live
              </span>
              <span className="text-outline-variant">•</span>
              <span className="font-medium text-outline flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
                {stats.outdated} may be outdated
              </span>
              {stats.cheapest ? (
                <>
                  <span className="text-outline-variant">•</span>
                  <span className="text-on-surface-variant">Cheapest {gradeLabel(grade)}:</span>
                  <span className="font-bold text-on-surface">{stats.cheapest.place_name}</span>
                  <span className="font-mono font-bold text-tertiary bg-tertiary-container/30 px-1.5 py-0.5 rounded">
                    {money(stats.cheapest.price_per_litre)}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 px-3 py-1.5 rounded-lg bg-surface-container-low">
          <div className="text-right">
            <div className="text-[10px] uppercase font-mono text-outline">Grade filter</div>
            <div className="font-mono text-xs font-bold text-on-surface">{gradeLabel(grade)}</div>
          </div>
          <svg className="w-24 h-7 text-secondary" fill="none" viewBox="0 0 100 28" aria-hidden>
            <path
              d="M0 20 Q 20 14, 35 18 T 60 8 T 85 12 T 100 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M0 20 Q 20 14, 35 18 T 60 8 T 85 12 T 100 6 L 100 28 L 0 28 Z"
              fill="currentColor"
              fillOpacity="0.12"
            />
          </svg>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-label uppercase tracking-wider text-outline font-bold mr-1">Grade:</span>
            {GRADES.map((g) => (
              <button key={g} type="button" className={gradeFilterClass(g, grade)} onClick={() => setGrade(g)}>
                {g === "e10_87" ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-tertiary-container" />
                    E-10 87
                  </>
                ) : g === "e10_90" ? (
                  "E-10 90"
                ) : g === "diesel" ? (
                  "Diesel"
                ) : (
                  "ULSD"
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors"
            >
              <Ms name="file_download" className="text-[16px]" />
              Export CSV
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="relative flex-1 min-w-[240px]">
            <Ms name="search" className="absolute left-3 top-2.5 text-[18px] text-outline" />
            <input
              className="w-full bg-surface-container-low text-on-surface placeholder:text-outline text-xs rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:bg-surface-container transition-colors"
              placeholder="Search station, brand, or road..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="appearance-none bg-surface-container-low text-on-surface text-xs font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none cursor-pointer"
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
            >
              <option value="">All Confidence (High, Medium, Low)</option>
              <option value="high">High only</option>
              <option value="medium">Medium only</option>
              <option value="low">Low only</option>
            </select>
            <Ms name="arrow_drop_down" className="pointer-events-none absolute right-2 top-2 text-[18px] text-outline" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
            <input
              checked={showOutdated}
              className="w-4 h-4 rounded text-secondary focus:ring-0 cursor-pointer accent-secondary"
              type="checkbox"
              onChange={(e) => setShowOutdated(e.target.checked)}
            />
            <span className="text-xs font-medium text-on-surface">Show outdated ({stats.outdated})</span>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading published prices…</p>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container text-outline text-[11px] font-label font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Station &amp; Brand</th>
                  <th className="py-3 px-3">Parish</th>
                  <th className="py-3 px-4">Published Price</th>
                  <th className="py-3 px-3">Confidence</th>
                  <th className="py-3 px-4">Reports Breakdown</th>
                  <th className="py-3 px-3">Petrojam Week</th>
                  <th className="py-3 px-3">Updated</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-transparent">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 px-4 text-center text-on-surface-variant">
                      No published prices match these filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const name = row.place_name || row.place_id;
                    const isCheapest =
                      stats.cheapest &&
                      row.place_id === stats.cheapest.place_id &&
                      !row.outdated;
                    return (
                      <tr
                        key={`${row.place_id}-${row.grade}`}
                        className={`hover:bg-surface-container-low/70 transition-colors group cursor-pointer ${
                          isCheapest ? "bg-tertiary-container/5 hover:bg-tertiary-container/10" : ""
                        } ${row.outdated ? "opacity-85" : ""}`}
                        onClick={() => setDrawerPlaceId(row.place_id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-7 h-7 rounded-md font-headline font-bold text-xs flex items-center justify-center shrink-0 ${avatarTone(name)}`}
                            >
                              {stationInitials(name).slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-on-surface group-hover:text-secondary transition-colors">
                                {name}
                              </div>
                              <div className="font-mono text-[10px] text-outline">{row.place_id.slice(0, 12).toUpperCase()}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-medium text-on-surface-variant">—</td>
                        <td className="py-3.5 px-4">
                          {isCheapest ? (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-tertiary">
                                {money(row.price_per_litre)}
                              </span>
                              <span className="text-[9px] uppercase font-bold tracking-tight px-1.5 py-0.5 rounded bg-tertiary text-on-tertiary">
                                Cheapest ({gradeLabel(grade)})
                              </span>
                            </div>
                          ) : (
                            <span
                              className={`font-mono font-bold text-sm ${row.outdated ? "text-outline" : "text-on-surface"}`}
                            >
                              {money(row.price_per_litre)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">{confidenceBadge(row.confidence)}</td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-on-surface-variant">
                          {row.report_count ?? 0}{" "}
                          <span className="text-outline font-normal">
                            (Fleet {row.fleet_count ?? 0} • Plug {row.plug_count ?? 0})
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-xs text-on-surface-variant">
                          {row.petrojam_week ? String(row.petrojam_week).slice(0, 10) : "—"}
                        </td>
                        <td className={`py-3.5 px-3 text-xs ${row.outdated ? "text-outline" : "text-on-surface-variant"}`}>
                          {timeAgo(row.observed_at)}
                        </td>
                        <td className="py-3.5 px-3">
                          {row.outdated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-outline text-[11px] font-medium">
                              <Ms name="schedule" className="text-[12px]" />
                              May be outdated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary text-[11px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                              Live
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            className="p-1 rounded-md text-outline hover:text-secondary hover:bg-surface-container transition-colors"
                            title="Inspect price logs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawerPlaceId(row.place_id);
                            }}
                          >
                            <Ms name="visibility" className="text-[18px]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-on-surface-variant">
            <div className="font-mono flex items-center gap-2 flex-wrap">
              <span>
                Showing <strong className="text-on-surface">{pageRows.length ? (pageSafe - 1) * pageSize + 1 : 0}–{(pageSafe - 1) * pageSize + pageRows.length}</strong> of{" "}
                {filtered.length} stations
              </span>
              <span className="text-outline-variant">•</span>
              <span className="text-tertiary font-bold">{stats.live} Live</span>
              <span className="text-outline-variant">•</span>
              <span className="text-outline">{stats.outdated} Outdated</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-surface-container-lowest text-outline hover:text-on-surface disabled:opacity-40 transition-colors"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <Ms name="chevron_left" className="text-[16px]" />
              </button>
              <span className="px-3 py-1 rounded bg-secondary text-on-secondary font-mono font-bold">{pageSafe}</span>
              {pageSafe < totalPages ? (
                <button
                  type="button"
                  className="px-3 py-1 rounded hover:bg-surface-container-highest text-on-surface font-mono transition-colors"
                  onClick={() => setPage(pageSafe + 1)}
                >
                  {pageSafe + 1}
                </button>
              ) : null}
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-40"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <Ms name="chevron_right" className="text-[16px]" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-surface-container flex items-start gap-3 text-xs text-on-surface-variant">
        <Ms name="rule" className="text-[20px] text-secondary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-on-surface">Price Engine Consensus Algorithm:</span>
          <p className="leading-relaxed text-[11px] text-outline">
            Published retail prices are derived via median aggregation of Fleet driver purchase receipts and verified
            crowd reports within a configurable decay window. Petrojam weekly updates set the wholesale baseline.
            Stations with stale observations automatically flag as{" "}
            <span className="font-medium text-on-surface">May be outdated</span>.
          </p>
        </div>
      </div>

      {drawerPlaceId ? (
        <PriceEngineStationDrawer
          placeId={drawerPlaceId}
          placeName={drawerName}
          grades={drawerGrades}
          onClose={() => setDrawerPlaceId(null)}
          onRecalculate={recalculateAll}
          recalcBusy={recalcBusy}
        />
      ) : null}
    </div>
  );
}
