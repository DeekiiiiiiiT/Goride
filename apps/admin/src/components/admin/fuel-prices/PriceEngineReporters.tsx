import { useCallback, useEffect, useMemo, useState } from "react";
import { peFetch, type Reporter, type Tab } from "./priceEngineApi";

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

type SourceSegment = "fleet" | "plug";

function reporterLabel(key: string, source: string): string {
  if (source === "plug") {
    const short = key.length > 4 ? key.slice(0, 4).toUpperCase() : key.toUpperCase();
    return `Plug user #${short}`;
  }
  const parts = key.split(/[-_]/);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1).toUpperCase()}${parts[0].slice(1, 2).toLowerCase()}. ${parts[1].slice(0, 1).toUpperCase()}.`;
  }
  return key.length > 12 ? `${key.slice(0, 8)}…` : key;
}

function reporterInitials(key: string, source: string): string {
  if (source === "plug") return "#";
  const label = reporterLabel(key, source);
  const letters = label.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  return key.slice(0, 2).toUpperCase();
}

function avatarClass(weight: number, source: string): string {
  if (weight < 1.25) return "bg-error-container/40 text-on-error-container";
  if (weight >= 2.5) return "bg-tertiary-container text-on-tertiary-container";
  if (source === "fleet") return "bg-secondary-fixed text-on-secondary-fixed";
  return "bg-primary-fixed text-on-primary-fixed";
}

function trustBarColor(weight: number): string {
  if (weight < 1.25) return "bg-error";
  if (weight >= 2.4) return "bg-tertiary";
  return "bg-secondary";
}

function formatLastReport(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-JM", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "review", label: "Review" },
    { id: "published", label: "Published prices" },
    { id: "reporters", label: "Reporters" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <div className="flex items-center gap-1 mt-2 bg-surface-container-high/40 p-1 rounded-xl w-fit overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              isActive
                ? "px-4 py-2 rounded-lg text-xs font-headline font-semibold bg-surface-container-lowest text-secondary shadow-sm whitespace-nowrap"
                : "px-4 py-2 rounded-lg text-xs font-headline font-medium text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1.5 whitespace-nowrap"
            }
          >
            {t.label}
            {t.id === "review" && reviewCount > 0 ? (
              <span className="px-1.5 py-0.2 bg-secondary-fixed text-on-secondary-fixed text-[10px] font-mono rounded-full font-bold">
                {reviewCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PriceEngineReportersTab({
  onTab,
  onError,
  reviewCount = 0,
}: {
  onTab: (tab: Tab) => void;
  onError: (message: string) => void;
  reviewCount?: number;
}) {
  const [items, setItems] = useState<Reporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<SourceSegment>("fleet");
  const [search, setSearch] = useState("");
  const [trustFilter, setTrustFilter] = useState<"all" | "high" | "low">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(() => {
    setLoading(true);
    void peFetch<{ items: Reporter[] }>("/admin/prices/reporters")
      .then((body) => setItems(body.items || []))
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [segment, search, trustFilter]);

  const fleetItems = useMemo(() => items.filter((r) => r.source === "fleet"), [items]);
  const plugItems = useMemo(() => items.filter((r) => r.source === "plug"), [items]);
  const segmentItems = segment === "fleet" ? fleetItems : plugItems;

  const kpis = useMemo(() => {
    const active = items.length;
    const avgTrust =
      items.length > 0 ? items.reduce((s, r) => s + Number(r.trust_weight), 0) / items.length : 0;
    const rejected = items.reduce((s, r) => s + (r.owner_rejected || 0), 0);
    const reports = items.reduce((s, r) => s + (r.reports || 0), 0);
    const flagRate = reports > 0 ? (rejected / reports) * 100 : 0;
    return { active, avgTrust, flagRate };
  }, [items]);

  const influential = useMemo(() => {
    const sorted = [...items].sort((a, b) => (b.accepted || 0) - (a.accepted || 0));
    const totalAccepted = sorted.reduce((s, r) => s + (r.accepted || 0), 0) || 1;
    return sorted.slice(0, 5).map((r) => ({
      ...r,
      share: ((r.accepted || 0) / totalAccepted) * 100,
    }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return segmentItems.filter((r) => {
      if (trustFilter === "high" && Number(r.trust_weight) <= 2) return false;
      if (trustFilter === "low" && Number(r.trust_weight) >= 1) return false;
      if (q) {
        const hay = `${r.reporter_key} ${reporterLabel(r.reporter_key, r.source)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [segmentItems, search, trustFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const topTwoShare = influential.slice(0, 2).reduce((s, r) => s + r.share, 0);

  return (
    <div className="px-8 pt-8 pb-12 flex flex-col gap-8 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-2 text-xs font-label text-outline tracking-wide">
          <span className="hover:text-on-surface transition-colors cursor-pointer">Dominion</span>
          <Ms name="chevron_right" className="text-[14px] text-outline-variant" />
          <span className="hover:text-on-surface transition-colors cursor-pointer">Master data</span>
          <Ms name="chevron_right" className="text-[14px] text-outline-variant" />
          <span className="hover:text-on-surface transition-colors cursor-pointer">Fuel</span>
          <Ms name="chevron_right" className="text-[14px] text-outline-variant" />
          <span className="text-on-surface font-semibold">Price Engine</span>
        </nav>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Price Engine — Reporters
            </h1>
            <p className="text-sm text-on-surface-variant font-body mt-1">
              Manage trust ratings and reporting volume for Fleet operators and crowd contributors across Jamaica.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-surface-container px-3.5 py-2 rounded-xl shadow-sm">
              <span className="text-xs font-label text-on-surface-variant uppercase tracking-wider font-semibold">
                Corridor Bias
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono font-medium px-2 py-0.5 rounded bg-tertiary-container text-on-tertiary-container">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                NORMALIZED
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-headline font-semibold shadow-sm hover:opacity-95 transition-opacity"
              onClick={() => onTab("settings")}
            >
              <Ms name="tune" className="text-[16px]" />
              Adjust Engine Weights
            </button>
          </div>
        </div>
        <PriceEngineTabBar active="reporters" onTab={onTab} reviewCount={reviewCount} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
              <Ms name="groups" className="text-[20px]" />
            </div>
            <div>
              <p className="text-xs font-label text-outline font-semibold uppercase tracking-wider">Active Reporters</p>
              <p className="text-xl font-headline font-bold text-on-surface mt-0.5">
                {kpis.active} <span className="text-xs font-normal text-on-surface-variant">island-wide</span>
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <Ms name="speed" className="text-[20px]" />
            </div>
            <div>
              <p className="text-xs font-label text-outline font-semibold uppercase tracking-wider">Avg Trust Weight</p>
              <p className="text-xl font-headline font-bold text-on-surface mt-0.5 font-mono">
                {kpis.avgTrust.toFixed(2)} <span className="text-xs font-normal text-on-surface-variant font-body">/ 3.00</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-mono text-outline bg-surface-container px-2 py-0.5 rounded-full">
              Base 2.00 Fleet
            </span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-error">
              <Ms name="flag" className="text-[20px]" />
            </div>
            <div>
              <p className="text-xs font-label text-outline font-semibold uppercase tracking-wider">Weekly Flag Rate</p>
              <p className="text-xl font-headline font-bold text-on-surface mt-0.5 font-mono">{kpis.flagRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-10 gap-8 items-start">
        <div className="xl:col-span-7 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="inline-flex p-1 bg-surface-container rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setSegment("fleet")}
                className={`px-4 py-1.5 rounded-lg text-xs font-headline flex items-center gap-2 ${
                  segment === "fleet"
                    ? "font-bold bg-surface-container-lowest text-on-surface shadow-sm"
                    : "font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                }`}
              >
                <Ms name="local_shipping" className="text-[16px] text-secondary" />
                Fleet drivers ({fleetItems.length})
              </button>
              <button
                type="button"
                onClick={() => setSegment("plug")}
                className={`px-4 py-1.5 rounded-lg text-xs font-headline flex items-center gap-2 ${
                  segment === "plug"
                    ? "font-bold bg-surface-container-lowest text-on-surface shadow-sm"
                    : "font-medium text-on-surface-variant hover:text-on-surface transition-colors"
                }`}
              >
                <Ms name="person_pin_circle" className="text-[16px]" />
                Plug users ({plugItems.length})
              </button>
            </div>
            <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm text-xs text-on-surface-variant">
              <Ms name="verified_user" className="text-[16px] text-primary" />
              <span>
                Plug IDs anonymized (<span className="font-mono text-[11px] text-on-surface">#4F2A + parish</span>) for
                caller privacy
              </span>
            </div>
          </div>

          <div className="p-3 bg-surface-container-lowest rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative w-full max-w-sm">
                <Ms name="search" className="text-[18px] text-outline absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="w-full pl-9 pr-4 py-1.5 bg-surface-container-low rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container transition-colors"
                  placeholder="Search driver name, ID (#DRV-), parish..."
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 text-[11px] font-label font-medium text-on-surface-variant">
                {(
                  [
                    ["all", "All Trust"],
                    ["high", "High >2.0"],
                    ["low", "Low <1.0"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTrustFilter(value)}
                    className={`px-2.5 py-1 rounded ${
                      trustFilter === value
                        ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                        : "hover:text-on-surface transition-colors"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-on-surface-variant">Loading reporters…</p>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-surface-container-low text-outline text-[11px] font-label font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Reporter</th>
                      <th className="py-3 px-4">Trust Weight</th>
                      <th className="py-3 px-4 text-center">Reports</th>
                      <th className="py-3 px-4 text-center">Accepted</th>
                      <th className="py-3 px-4 text-center">Rejected</th>
                      <th className="py-3 px-4">Last Report</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0 text-on-surface">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-on-surface-variant">
                          No reporters match these filters.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row, idx) => {
                        const weight = Number(row.trust_weight);
                        const barPct = Math.min(100, (weight / 3) * 100);
                        const display = reporterLabel(row.reporter_key, row.source);
                        return (
                          <tr
                            key={row.reporter_key}
                            className={`hover:bg-surface-container-low/60 transition-colors group ${
                              idx % 2 === 1 ? "bg-surface-container-low/20" : ""
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full font-headline font-bold flex items-center justify-center text-xs ${avatarClass(weight, row.source)}`}
                                >
                                  {reporterInitials(row.reporter_key, row.source)}
                                </div>
                                <div>
                                  <div className="font-headline font-semibold text-on-surface">{display}</div>
                                  <div className="text-[11px] text-outline font-mono">{row.reporter_key}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 min-w-[130px]">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-xs font-mono">
                                  <span className={`font-bold ${weight < 1.25 ? "text-error" : weight >= 2.4 ? "text-tertiary" : "text-on-surface"}`}>
                                    {weight.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-outline">max 3.0</span>
                                </div>
                                <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${trustBarColor(weight)}`} style={{ width: `${barPct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono font-semibold">{row.reports}</td>
                            <td className="py-3.5 px-4 text-center font-mono text-tertiary">{row.accepted}</td>
                            <td className="py-3.5 px-4 text-center font-mono text-error">{row.owner_rejected}</td>
                            <td className="py-3.5 px-4 font-mono text-[11px] text-on-surface-variant">
                              {formatLastReport(row.last_report_at)}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                className="px-2.5 py-1 text-[11px] font-label font-medium rounded-lg text-outline-variant hover:text-error hover:bg-error-container/20 transition-all opacity-80 group-hover:opacity-100"
                              >
                                Reset trust
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-surface-container-low/50 flex items-center justify-between text-xs font-label text-outline">
                <span className="text-on-surface-variant">
                  Showing {pageRows.length} of {filtered.length} active {segment === "fleet" ? "Fleet drivers" : "Plug users"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface shadow-xs disabled:opacity-50"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button type="button" className="px-2.5 py-1 rounded bg-secondary text-on-secondary font-semibold">
                    {pageSafe}
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface shadow-xs disabled:opacity-50"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-primary-container text-on-primary-container">
              <Ms name="security_update_good" className="text-[18px]" />
            </div>
            <div className="text-xs">
              <span className="font-headline font-semibold text-on-surface">Auto-Decay Protocol Active:</span>
              <span className="text-on-surface-variant ml-1 font-body">
                Reporters inactive for greater than 30 continuous days without submitting pump verification receipts
                have their trust rating decayed towards island baseline (-0.05/wk).
              </span>
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 flex flex-col gap-6">
          <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-headline font-bold text-on-surface tracking-tight">Most influential this week</h2>
                <span className="text-[10px] font-mono uppercase bg-surface-container text-outline px-2 py-0.5 rounded font-bold">
                  7-Day Share
                </span>
              </div>
              <p className="text-xs text-on-surface-variant font-body mt-1">
                Top contributors ranked by share of accepted reports in system.
              </p>
            </div>
            <div className="flex flex-col gap-1 text-[11px]">
              <span className="font-headline font-semibold text-on-surface">Network Dispersion</span>
              <span className="text-on-surface-variant font-body">
                Top two account for{" "}
                <strong className="text-on-surface font-mono font-semibold">{topTwoShare.toFixed(1)}%</strong> of accepted
                inputs.
              </span>
            </div>
            <div className="space-y-3">
              {influential.map((row, i) => {
                const name = reporterLabel(row.reporter_key, row.source);
                const warn = row.share > 30 && i === 0;
                return (
                  <div key={row.reporter_key}>
                    {warn ? (
                      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-container-low">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-headline font-bold text-on-surface">
                            {i + 1}. {name}{" "}
                            <span className="font-normal text-[11px] text-outline font-mono capitalize">({row.source})</span>
                          </span>
                          <span className="font-mono font-bold text-secondary text-sm">{row.share.toFixed(1)}%</span>
                        </div>
                        <div className="p-2 rounded-lg bg-error-container/20 text-on-error-container text-[11px] flex items-start gap-1.5 leading-snug">
                          <Ms name="warning" className="text-[15px] shrink-0 text-error" />
                          <span>Over 30% concentration — single reporter weighting dominant</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs px-2 py-1">
                        <span className="font-headline font-medium text-on-surface">
                          {i + 1}. {name}{" "}
                          <span className="text-[11px] text-outline font-mono capitalize">({row.source})</span>
                        </span>
                        <span className="font-mono font-bold text-on-surface">{row.share.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-3 rounded-xl bg-surface-container text-on-surface-variant text-[11px] leading-relaxed flex items-start gap-2">
              <Ms name="info" className="text-[16px] text-outline shrink-0 mt-0.5" />
              <span>
                Reporters with &gt;30% network impact have their individual weight capped during consensus recalculation to
                avoid single-source price drift.
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-surface-container-lowest shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-headline font-bold text-on-surface tracking-tight">Trust Weight Formula &amp; Guardrails</h2>
              <Ms name="functions" className="text-[18px] text-primary" />
            </div>
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between items-center text-on-surface">
                <span className="font-label text-outline text-[11px] uppercase font-bold">Absolute Scale</span>
                <span className="font-bold">0.10 min — 3.00 max</span>
              </div>
              <div className="flex justify-between items-center text-on-surface">
                <span className="font-label text-outline text-[11px] uppercase font-bold">Fleet Baseline</span>
                <span className="font-bold text-secondary">2.00 base</span>
              </div>
              <div className="flex justify-between items-center text-on-surface">
                <span className="font-label text-outline text-[11px] uppercase font-bold">Plug Baseline</span>
                <span className="font-bold text-outline">1.00 base</span>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-tertiary-container/30 text-on-tertiary-container">
                <Ms name="add_circle" className="text-[16px] text-tertiary shrink-0 mt-0.5" />
                <div className="font-body">
                  <span className="font-mono font-bold text-tertiary">+0.05</span>
                  <span className="ml-1">per accepted verified receipt.</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-error-container/30 text-on-error-container">
                <Ms name="remove_circle" className="text-[16px] text-error shrink-0 mt-0.5" />
                <div className="font-body">
                  <span className="font-mono font-bold text-error">-0.25</span>
                  <span className="ml-1">per owner rejected bad reading.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
