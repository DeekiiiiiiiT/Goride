// Stitch: dominion-redesign/c48abb51fac94d12855c1a228d093ef9 (P2)
// Stitch: dominion-redesign/7517e96d14c9411ba89ed96f0528fa5b (P3)
// Source: Downloads/.../price_engine_review_queue/code.html + review_item_split_view/code.html
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  gradeLabel,
  money,
  peFetch,
  reasonLabel,
  reportGrade,
  reportPrice,
  rowKey,
  stationName,
  type ReviewItem,
  type Tab,
} from "./priceEngineApi";

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

function pctVsWholesale(price?: number, wholesale?: number): number | null {
  if (price == null || wholesale == null || wholesale === 0) return null;
  return ((price - wholesale) / wholesale) * 100;
}

function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "e10_87":
      return "bg-tertiary text-on-tertiary";
    case "diesel":
    case "ulsd":
      return "bg-on-surface text-surface-container-lowest";
    case "e10_90":
      return "bg-error text-on-error";
    default:
      return "bg-surface-container-highest text-on-surface-variant";
  }
}

function DiffCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[11px] text-outline font-mono">—</span>;
  if (pct <= -15) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-mono font-semibold text-[11px]">
        <span>{pct.toFixed(0)}%</span>
        <span className="text-[9px] font-label uppercase">vs Petrojam</span>
      </span>
    );
  }
  if (pct >= 15) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-mono font-semibold text-[11px]">
        <span>+{pct.toFixed(1)}%</span>
        <span className="text-[9px] font-label uppercase">vs Petrojam</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-mono font-semibold text-[11px]">
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function ReasonChip({ code }: { code: string }) {
  const label = reasonLabel(code);
  const hot = /OUT_OF_BOUNDS|BIG_CHANGE|MAD_OUTLIER|bounds|unusual/i.test(code);
  const gradeish = /GRADE|UNKNOWN/i.test(code);
  if (hot) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container/40 text-on-error-container font-label text-[11px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        <span>{label}</span>
      </span>
    );
  }
  if (gradeish) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label text-[11px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-container/40 text-on-primary-container font-label text-[11px] font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      <span>{label}</span>
    </span>
  );
}

type QueueStatus = "review" | "approved" | "rejected";
type SourceFilter = "all" | "fleet" | "plug";

export function PriceEngineReviewTab({
  onError,
  onChanged,
  onTab,
  reviewCount,
}: {
  onError: (message: string) => void;
  onChanged: () => void;
  onTab: (t: Tab) => void;
  reviewCount: number;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [status, setStatus] = useState<QueueStatus>("review");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [parishFilter, setParishFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [splitItem, setSplitItem] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({ review: reviewCount, approved: 0, rejected: 0 });
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    void peFetch<{ items: ReviewItem[] }>(`/admin/prices/review?status=${status}`)
      .then((body) => {
        setItems(body.items || []);
        setSelectedIds(new Set());
        setRefreshedAt(Date.now());
      })
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoading(false));
  }, [onError, status]);

  const refreshCounts = useCallback(() => {
    void Promise.all(
      (["review", "approved", "rejected"] as const).map(async (s) => {
        const body = await peFetch<{ items: ReviewItem[] }>(`/admin/prices/review?status=${s}`);
        return [s, (body.items || []).length] as const;
      }),
    )
      .then((pairs) => {
        const next = { review: 0, approved: 0, rejected: 0 };
        for (const [s, n] of pairs) next[s] = n;
        setCounts(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts, reviewCount]);
  useEffect(() => {
    setPage(1);
  }, [status, sourceFilter, search, reasonFilter, gradeFilter, parishFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (gradeFilter && reportGrade(item) !== gradeFilter) return false;
      if (parishFilter && item.parish !== parishFilter) return false;
      if (reasonFilter && !(item.reasons || []).includes(reasonFilter)) return false;
      if (q) {
        const hay = `${stationName(item)} ${item.parish || ""} ${item.reporter_key || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, sourceFilter, search, gradeFilter, parishFilter, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const parishes = useMemo(() => [...new Set(items.map((i) => i.parish).filter(Boolean) as string[])].sort(), [items]);
  const reasonOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) for (const r of item.reasons || []) set.add(r);
    return [...set].sort();
  }, [items]);

  const decide = async (item: ReviewItem, decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      await peFetch(`/admin/prices/review/${item.source}/${item.report_id}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      if (splitItem && rowKey(splitItem) === rowKey(item)) setSplitItem(null);
      load();
      refreshCounts();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save that decision");
    } finally {
      setBusy(false);
    }
  };

  const decideMany = async (decision: "approved" | "rejected") => {
    const targets = pageItems.filter((item) => selectedIds.has(rowKey(item)));
    if (!targets.length) return;
    setBusy(true);
    try {
      for (const item of targets) {
        await peFetch(`/admin/prices/review/${item.source}/${item.report_id}`, {
          method: "POST",
          body: JSON.stringify({ decision }),
        });
      }
      setSelectedIds(new Set());
      load();
      refreshCounts();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save bulk decision");
    } finally {
      setBusy(false);
    }
  };

  const setGradeMany = async (grade: string) => {
    const targets = pageItems.filter((item) => selectedIds.has(rowKey(item)));
    if (!targets.length || !grade) return;
    setBusy(true);
    try {
      for (const item of targets) {
        await peFetch(`/admin/prices/review/${item.source}/${item.report_id}/grade`, {
          method: "POST",
          body: JSON.stringify({ grade }),
        });
      }
      setSelectedIds(new Set());
      load();
      refreshCounts();
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not set that grade");
    } finally {
      setBusy(false);
    }
  };

  const focusItem =
    splitItem || pageItems.find((item) => selectedIds.has(rowKey(item))) || pageItems[0] || null;

  useEffect(() => {
    if (status !== "review" || !focusItem || busy) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        void decide(focusItem, "approved");
      } else if (key === "r") {
        event.preventDefault();
        void decide(focusItem, "rejected");
      } else if (key === "n") {
        event.preventDefault();
        const idx = pageItems.findIndex((item) => rowKey(item) === rowKey(focusItem));
        const next = pageItems[idx + 1] || pageItems[0];
        if (next) {
          setSplitItem(next);
          setSelectedIds(new Set([rowKey(next)]));
        }
      } else if (key === "g") {
        event.preventDefault();
        document.getElementById("pe-grade-select")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (splitItem && status === "review") {
    return (
      <ReviewSplitView
        item={splitItem}
        busy={busy}
        reviewCount={counts.review}
        onBack={() => setSplitItem(null)}
        onTab={onTab}
        onDecide={decide}
        onError={onError}
        onChanged={() => {
          load();
          onChanged();
        }}
      />
    );
  }

  const bulkN = selectedIds.size;
  const ago = Math.max(0, Math.floor((Date.now() - refreshedAt) / 1000));
  void tick;

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Top Bar / Breadcrumb & Region Pill — P2 HTML */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-label text-outline">
          <span className="hover:text-on-surface cursor-default transition-colors">Dominion</span>
          <span className="text-outline-variant font-mono">/</span>
          <span className="hover:text-on-surface cursor-default transition-colors">Master data</span>
          <span className="text-outline-variant font-mono">/</span>
          <span className="hover:text-on-surface cursor-default transition-colors">Fuel</span>
          <span className="text-outline-variant font-mono">/</span>
          <span className="font-semibold text-on-surface">Price Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface text-[11px] font-mono tracking-wider shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>REGION: JM-KGN</span>
          </div>
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-container/30 text-on-tertiary-container text-[11px] font-mono">
            <Ms name="sync" className="text-[14px]" />
            <span>LIVE INGESTION</span>
          </div>
        </div>
      </div>

      {/* Header Banner Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-headline font-bold tracking-tight text-on-surface">Price Engine</h1>
            <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary-container text-[11px] font-mono uppercase font-semibold">
              v3.4 Queue
            </span>
          </div>
          <p className="text-sm text-on-surface-variant font-body mt-1">
            Turns driver fuel reports into one trusted price per station and grade across Jamaica.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <div className="px-3.5 py-2 rounded-xl bg-surface-container shadow-sm flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline">
              <Ms name="hourglass_top" className="text-[16px]" />
            </div>
            <div>
              <div className="text-[10px] font-label uppercase tracking-wider text-outline">Pending Verifications</div>
              <div className="text-sm font-mono font-bold text-on-surface">
                {counts.review} report{counts.review === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-surface-container shadow-sm flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-tertiary-container flex items-center justify-center text-on-tertiary-container">
              <Ms name="check_circle" className="text-[16px]" />
            </div>
            <div>
              <div className="text-[10px] font-label uppercase tracking-wider text-outline">Settled (loaded)</div>
              <div className="text-sm font-mono font-bold text-tertiary">{counts.approved} accepted</div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs — P2 text style */}
      <div className="flex items-center gap-2 border-b-0 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onTab("overview")}
          className="px-4 py-2 rounded-lg text-sm font-label text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Overview
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-label font-semibold bg-surface-container-lowest text-secondary shadow-sm flex items-center gap-2"
        >
          <span>Review</span>
          {counts.review > 0 ? (
            <span className="px-1.5 py-0.5 rounded-full bg-error-container text-on-error-container text-[11px] font-mono font-bold">
              {counts.review}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onTab("published")}
          className="px-4 py-2 rounded-lg text-sm font-label text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Published prices
        </button>
        <button
          type="button"
          onClick={() => onTab("reporters")}
          className="px-4 py-2 rounded-lg text-sm font-label text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Reporters
        </button>
        <button
          type="button"
          onClick={() => onTab("settings")}
          className="px-4 py-2 rounded-lg text-sm font-label text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Control Surface & Filters */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-label uppercase tracking-wider text-outline mr-1">Source:</span>
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-transform active:scale-95 ${
                sourceFilter === "all"
                  ? "bg-secondary text-on-secondary shadow-sm"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("fleet")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity ${
                sourceFilter === "fleet"
                  ? "bg-inverse-surface text-surface-container-lowest"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <Ms name="local_shipping" className="text-[15px]" />
              <span>Fleet</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("plug")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity ${
                sourceFilter === "plug" ? "bg-error-dim text-on-error" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <Ms name="phone_iphone" className="text-[15px]" />
              <span>Plug</span>
            </button>
          </div>
          <div className="flex items-center p-1 rounded-lg bg-surface-container">
            <button
              type="button"
              onClick={() => setStatus("review")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 ${
                status === "review"
                  ? "bg-surface-container-lowest text-on-surface font-headline shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface transition-colors"
              }`}
            >
              <span>Waiting</span>
              <span className="w-4 h-4 rounded-full bg-error-container text-on-error-container text-[10px] font-mono flex items-center justify-center font-bold">
                {counts.review}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatus("approved")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 ${
                status === "approved"
                  ? "bg-surface-container-lowest text-on-surface font-headline shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface transition-colors"
              }`}
            >
              <span>Approved</span>
              <span className="text-[11px] font-mono text-outline">{counts.approved}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatus("rejected")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 ${
                status === "rejected"
                  ? "bg-surface-container-lowest text-on-surface font-headline shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface transition-colors"
              }`}
            >
              <span>Rejected</span>
              <span className="text-[11px] font-mono text-outline">{counts.rejected}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="relative">
            <Ms name="search" className="absolute left-3 top-2.5 text-[18px] text-outline" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container text-xs font-body text-on-surface placeholder:text-outline-variant focus:outline-none focus:bg-surface-container-high transition-colors"
              placeholder="Filter reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <Ms name="tune" className="absolute left-3 top-2.5 text-[16px] text-outline pointer-events-none" />
            <select
              className="w-full appearance-none pl-9 pr-8 py-2 rounded-lg bg-surface-container text-xs font-body text-on-surface focus:outline-none focus:bg-surface-container-high"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
            >
              <option value="">Reason (All)</option>
              {reasonOptions.map((r) => (
                <option key={r} value={r}>
                  {reasonLabel(r)}
                </option>
              ))}
            </select>
            <Ms name="arrow_drop_down" className="absolute right-2 top-2 text-[16px] text-outline pointer-events-none" />
          </div>
          <div className="relative">
            <Ms name="local_gas_station" className="absolute left-3 top-2.5 text-[16px] text-outline pointer-events-none" />
            <select
              className="w-full appearance-none pl-9 pr-8 py-2 rounded-lg bg-surface-container text-xs font-body text-on-surface focus:outline-none focus:bg-surface-container-high"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
            >
              <option value="">All grades</option>
              <option value="e10_87">E-10 87</option>
              <option value="e10_90">E-10 90</option>
              <option value="diesel">Diesel</option>
              <option value="ulsd">ULSD</option>
              <option value="unknown">Grade unknown</option>
            </select>
            <Ms name="arrow_drop_down" className="absolute right-2 top-2 text-[16px] text-outline pointer-events-none" />
          </div>
          <div className="relative">
            <Ms name="location_on" className="absolute left-3 top-2.5 text-[16px] text-outline pointer-events-none" />
            <select
              className="w-full appearance-none pl-9 pr-8 py-2 rounded-lg bg-surface-container text-xs font-body text-on-surface focus:outline-none focus:bg-surface-container-high"
              value={parishFilter}
              onChange={(e) => setParishFilter(e.target.value)}
            >
              <option value="">All parishes</option>
              {parishes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Ms name="arrow_drop_down" className="absolute right-2 top-2 text-[16px] text-outline pointer-events-none" />
          </div>
        </div>
      </div>

      {bulkN > 0 && status === "review" ? (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-highest shadow-sm transition-all flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-secondary text-on-secondary flex items-center justify-center font-mono text-xs font-bold">
              {bulkN}
            </div>
            <span className="text-xs font-headline font-semibold text-on-surface">Queue items selected for evaluation</span>
            <span className="text-xs text-outline font-label hidden sm:inline">• Shortcut approval enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void decideMany("approved")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-tertiary text-on-tertiary text-xs font-medium hover:opacity-90 shadow-sm transition-transform active:scale-95 disabled:opacity-50"
            >
              <Ms name="check" className="text-[16px]" />
              <span>
                Approve {bulkN} selected (A)
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decideMany("rejected")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-error text-on-error text-xs font-medium hover:opacity-90 shadow-sm transition-transform active:scale-95 disabled:opacity-50"
            >
              <Ms name="close" className="text-[16px]" />
              <span>
                Reject {bulkN} selected (R)
              </span>
            </button>
            <select
              aria-label="Set grade on selected"
              disabled={busy}
              defaultValue=""
              onChange={(event) => {
                const grade = event.target.value;
                event.target.value = "";
                if (grade) void setGradeMany(grade);
              }}
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-xs font-medium text-on-surface"
            >
              <option value="">Set grade…</option>
              <option value="e10_87">E-10 87</option>
              <option value="e10_90">E-10 90</option>
              <option value="diesel">Diesel</option>
              <option value="ulsd">ULSD</option>
            </select>
            <button
              type="button"
              title="Deselect all"
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 rounded-lg text-outline hover:text-on-surface transition-colors"
            >
              <Ms name="close" className="text-[18px]" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-on-surface-variant">Loading queue…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant">Nothing in this list.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-container text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 w-10">
                      {status === "review" ? (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-secondary accent-secondary focus:ring-0 cursor-pointer"
                          checked={bulkN > 0 && bulkN === pageItems.length}
                          onChange={(e) =>
                            setSelectedIds(e.target.checked ? new Set(pageItems.map(rowKey)) : new Set())
                          }
                        />
                      ) : null}
                    </th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-4">Station &amp; Parish</th>
                    <th className="py-3 px-3">Grade</th>
                    <th className="py-3 px-4">Reported Price &amp; Petrojam</th>
                    <th className="py-3 px-3">Difference</th>
                    <th className="py-3 px-3">Reason</th>
                    <th className="py-3 px-4">Reporter &amp; Trust</th>
                    <th className="py-3 px-3">Reported Time</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent font-body text-on-surface">
                  {pageItems.map((item) => {
                    const k = rowKey(item);
                    const checked = selectedIds.has(k);
                    const grade = reportGrade(item);
                    const price = reportPrice(item);
                    const wholesale = item.detail?.wholesale;
                    const pct = pctVsWholesale(price, wholesale);
                    const time = item.reported_at || item.checked_at;
                    const hotPrice = pct != null && pct < -20;
                    return (
                      <tr
                        key={k}
                        className={`hover:bg-surface-container-low transition-colors ${checked ? "bg-surface-container-low/60" : ""}`}
                      >
                        <td className="py-4 px-4">
                          {status === "review" ? (
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded accent-secondary cursor-pointer"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(k);
                                else next.delete(k);
                                setSelectedIds(next);
                              }}
                            />
                          ) : null}
                        </td>
                        <td className="py-4 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-medium text-[11px] ${
                              item.source === "plug"
                                ? "bg-error-dim text-on-error"
                                : "bg-inverse-surface text-surface-container-lowest"
                            }`}
                          >
                            <Ms name={item.source === "plug" ? "phone_iphone" : "local_shipping"} className="text-[14px]" />
                            <span>{item.source === "fleet" ? "Fleet" : item.source === "plug" ? "Plug" : item.source}</span>
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => status === "review" && setSplitItem(item)}
                          >
                            <div className="font-headline font-semibold text-on-surface text-sm">{stationName(item)}</div>
                            <div className="text-[11px] text-outline font-label flex items-center gap-1">
                              <Ms name="pin_drop" className="text-[12px]" />
                              <span>{item.parish ? `${item.parish}, Jamaica` : "Parish not set"}</span>
                            </div>
                          </button>
                        </td>
                        <td className="py-4 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[10px] ${gradeBadgeClass(grade)}`}
                          >
                            {gradeLabel(grade)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className={`font-mono font-bold text-base ${hotPrice ? "text-error" : "text-on-surface"}`}>
                            {price != null ? `${money(price)} / L` : "—"}
                          </div>
                          <div className="font-mono text-[11px] text-outline">
                            {wholesale != null ? `Petrojam ${money(wholesale)}` : "Petrojam —"}
                          </div>
                        </td>
                        <td className="py-4 px-3">
                          <DiffCell pct={pct} />
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex flex-wrap gap-1">
                            {(item.reasons || []).slice(0, 2).map((r) => (
                              <ReasonChip key={r} code={r} />
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {item.source === "plug" ? (
                            <>
                              <div className="font-mono font-medium text-on-surface">
                                Plug user {item.reporter_key ? `#${item.reporter_key.slice(0, 4).toUpperCase()}` : ""}
                              </div>
                              <div className="font-mono text-[11px] text-outline">Direct ingestion</div>
                            </>
                          ) : (
                            <>
                              <div className="font-medium text-on-surface">
                                Driver: {item.reporter_key ? item.reporter_key.slice(0, 14) : "—"}
                              </div>
                              <div className="font-mono text-[11px] text-outline flex items-center gap-1">
                                <span>Trust rating:</span>
                                <span className="font-bold text-on-surface">
                                  {item.weight != null ? Number(item.weight).toFixed(1) : "—"}
                                </span>
                              </div>
                            </>
                          )}
                        </td>
                        <td className="py-4 px-3 font-mono text-outline text-[11px]">
                          {time
                            ? new Date(time).toLocaleString("en-JM", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="py-4 px-4 text-right">
                          {status === "review" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void decide(item, "approved")}
                                className={`px-2.5 py-1 rounded-lg font-label text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                  checked
                                    ? "bg-tertiary-container/30 text-on-tertiary-container hover:bg-tertiary hover:text-on-tertiary"
                                    : "bg-surface-container text-on-surface hover:bg-tertiary hover:text-on-tertiary"
                                }`}
                              >
                                <Ms name="check" className="text-[14px]" />
                                <span>{checked ? "Approve (A)" : "Approve"}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void decide(item, "rejected")}
                                className={`px-2.5 py-1 rounded-lg font-label text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                  checked
                                    ? "bg-error-container/30 text-on-error-container hover:bg-error hover:text-on-error"
                                    : "bg-surface-container text-on-surface hover:bg-error hover:text-on-error"
                                }`}
                              >
                                <Ms name="close" className="text-[14px]" />
                                <span>{checked ? "Reject (R)" : "Reject"}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] font-mono text-outline capitalize">{item.status}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {status === "review" ? (
              <div className="p-4 bg-surface-container flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant font-label">
                <div className="flex items-center gap-2">
                  <span>
                    Showing{" "}
                    <strong className="text-on-surface font-mono">
                      {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, filtered.length)}
                    </strong>{" "}
                    of <strong className="text-on-surface font-mono">{filtered.length}</strong> pending reports
                  </span>
                  <span className="text-outline-variant font-mono">•</span>
                  <span className="text-[11px] text-outline">Queue refreshed {ago}s ago</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-md bg-surface-container-high text-outline text-xs disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-md bg-surface-container-lowest text-secondary font-mono font-bold text-xs shadow-sm"
                  >
                    {pageSafe}
                  </button>
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 rounded-md bg-surface-container-high text-outline text-xs disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {status === "review" ? (
        <div className="p-3.5 rounded-xl bg-surface-container text-on-surface-variant flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs font-label">
            <span className="flex items-center gap-1.5 font-semibold text-on-surface">
              <Ms name="keyboard" className="text-[18px] text-secondary" />
              <span>Keyboard shortcuts:</span>
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">A</kbd>{" "}
              Approve
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">R</kbd>{" "}
              Reject
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">G</kbd>{" "}
              Change grade
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">N</kbd>{" "}
              Next report
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">⌘K</kbd>{" "}
              Command bar
            </span>
          </div>
          <div className="text-[11px] font-mono text-outline">Dominion Price Resolution Protocol • JM-KGN</div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewSplitView({
  item,
  busy,
  reviewCount,
  onBack,
  onTab,
  onDecide,
  onError,
  onChanged,
}: {
  item: ReviewItem;
  busy: boolean;
  reviewCount: number;
  onBack: () => void;
  onTab: (t: Tab) => void;
  onDecide: (item: ReviewItem, decision: "approved" | "rejected") => Promise<void>;
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  const [grade, setGrade] = useState(reportGrade(item));
  const [fixLitres, setFixLitres] = useState(item.litres != null ? String(item.litres) : "");
  const [fixAmount, setFixAmount] = useState(item.amount != null ? String(item.amount) : "");
  const price = reportPrice(item);
  const wholesale = item.detail?.wholesale;
  const reportLabel = item.report_id.slice(0, 8).toUpperCase();

  useEffect(() => {
    setGrade(reportGrade(item));
    setFixLitres(item.litres != null ? String(item.litres) : "");
    setFixAmount(item.amount != null ? String(item.amount) : "");
  }, [item]);

  const fixAndApprove = async () => {
    const litres = Number(fixLitres);
    const amount = Number(fixAmount);
    if (!(litres > 0) || !(amount > 0)) {
      onError("Enter the corrected amount and litres");
      return;
    }
    try {
      await peFetch(`/admin/prices/review/${item.source}/${item.report_id}/fix`, {
        method: "POST",
        body: JSON.stringify({ litres, amount }),
      });
      onChanged();
      onBack();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not fix that price");
    }
  };

  return (
    <div className="flex flex-col w-full space-y-6 pb-8">
      <nav className="flex items-center gap-2 text-xs font-mono text-outline flex-wrap">
        <span>Dominion</span>
        <span>›</span>
        <span>Master data</span>
        <span>›</span>
        <span>Fuel</span>
        <span>›</span>
        <button type="button" onClick={onBack} className="hover:text-on-surface transition-colors">
          Price Engine
        </button>
        <span>›</span>
        <span className="text-secondary font-semibold">Review #{reportLabel}</span>
      </nav>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Price Engine — Reviewing Report #{reportLabel}
            </h1>
            {(item.reasons || [])[0] ? (
              <span className="px-2 py-0.5 rounded-full bg-error/10 text-error text-xs font-mono font-medium">
                {reasonLabel(item.reasons[0])}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-on-surface-variant font-label mt-1 flex items-center gap-1.5">
            <Ms name="local_gas_station" className="text-[15px] text-outline" />
            <span>
              Station: {stationName(item)}
              {item.parish ? ` • ${item.parish}, Jamaica` : ""}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-xs text-on-surface-variant font-mono self-start md:self-auto shadow-sm">
          <Ms name="keyboard" className="text-[16px] text-secondary" />
          <span>
            Tip: Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-surface-container-highest text-on-surface font-bold">R</kbd> then{" "}
            <kbd className="px-1 py-0.5 rounded bg-surface-container-highest text-on-surface font-bold">Enter</kbd> to reject
            &amp; advance
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => onTab("overview")}
          className="px-4 py-2 text-xs font-headline font-semibold text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
        >
          Overview
        </button>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-xs font-headline font-bold text-on-secondary bg-secondary rounded-lg flex items-center gap-2 shadow-sm"
        >
          <span>Review</span>
          {reviewCount > 0 ? (
            <span className="px-1.5 py-0.5 rounded-full bg-surface-container-lowest text-secondary text-[11px] font-mono">
              {reviewCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onTab("published")}
          className="px-4 py-2 text-xs font-headline font-semibold text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
        >
          Published prices
        </button>
        <button
          type="button"
          onClick={() => onTab("reporters")}
          className="px-4 py-2 text-xs font-headline font-semibold text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
        >
          Reporters
        </button>
        <button
          type="button"
          onClick={() => onTab("settings")}
          className="px-4 py-2 text-xs font-headline font-semibold text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
        >
          Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="p-4 rounded-xl bg-surface-container flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-inverse-surface text-on-primary flex items-center justify-center">
                <Ms name={item.source === "plug" ? "phone_iphone" : "local_shipping"} className="text-[18px]" />
              </div>
              <div>
                <div className="text-xs font-headline font-bold text-on-surface capitalize">
                  Source: {item.source === "fleet" ? "Roam Fleet Driver Report" : `${item.source} report`}
                </div>
                <div className="text-[11px] font-mono text-outline">Report ID: {item.report_id}</div>
              </div>
            </div>
            {item.source === "fleet" ? (
              <div className="flex items-center gap-1.5 text-xs font-mono text-tertiary bg-tertiary-container/30 px-2.5 py-1 rounded-md">
                <Ms name="verified" className="text-[14px]" />
                <span>Authenticated App</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl bg-surface-container shadow-sm p-8 flex flex-col items-center justify-center min-h-[220px] text-center gap-2">
            <Ms name="photo_camera" className="text-[32px] text-outline" />
            <p className="text-sm font-headline font-semibold text-on-surface">Pump photo not attached to this report</p>
            <p className="text-xs text-on-surface-variant max-w-md">
              When capture is stored on the report, the dispenser image shows here. Live price and Petrojam baseline are below.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface-container flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-headline font-bold text-on-surface uppercase tracking-wider">Reported price</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-surface-container-lowest shadow-sm font-mono">
              <span className="text-base font-bold text-on-surface">{price != null ? `${money(price)} / L` : "—"}</span>
              {wholesale != null ? (
                <span className="text-[11px] text-outline">Petrojam wholesale {money(wholesale)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          {(item.reasons || []).length > 0 ? (
            <div className="p-4 rounded-xl bg-amber-500/10 text-on-surface shadow-sm flex items-start gap-3.5">
              <Ms name="warning" className="text-amber-600 text-[24px] mt-0.5" />
              <div className="flex flex-col gap-1">
                <div className="text-xs font-headline font-bold text-amber-700 uppercase tracking-wide">
                  Review rule triggered
                </div>
                <div className="text-xs text-on-surface leading-relaxed">
                  {(item.reasons || []).map(reasonLabel).join(" · ")}
                  {wholesale != null && price != null ? (
                    <>
                      {" "}
                      Reported (<strong className="font-mono text-error">{money(price)}</strong>) vs Petrojam (
                      <strong className="font-mono">{money(wholesale)}</strong>).
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl bg-surface-container p-4 shadow-sm flex flex-col gap-3">
            <div className="text-xs font-headline font-bold text-on-surface uppercase tracking-wider">
              Benchmark Index Comparison
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-error/10 text-error">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  <span className="font-semibold">This Report</span>
                </div>
                <span className="text-sm font-bold">{price != null ? money(price) : "—"}</span>
              </div>
              {wholesale != null ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-lowest">
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <span className="w-2 h-2 rounded-full bg-outline" />
                    <span>Petrojam Wholesale Baseline</span>
                  </div>
                  <span className="font-semibold text-on-surface">{money(wholesale)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container p-4 shadow-sm flex flex-col gap-3">
            <div className="text-xs font-headline font-bold text-on-surface uppercase tracking-wider">
              Fix the reading
            </div>
            <p className="text-[11px] text-on-surface-variant">
              The original stays on the fill. The corrected amount and litres are what get published.
            </p>
            <label className="text-xs text-on-surface-variant flex flex-col gap-1">
              Amount (J$)
              <input
                inputMode="decimal"
                value={fixAmount}
                onChange={(event) => setFixAmount(event.target.value)}
                className="rounded-lg bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              />
              <span className="text-[11px] text-outline line-through">
                Original {item.amount != null ? money(Number(item.amount)) : "—"}
              </span>
            </label>
            <label className="text-xs text-on-surface-variant flex flex-col gap-1">
              Litres
              <input
                inputMode="decimal"
                value={fixLitres}
                onChange={(event) => setFixLitres(event.target.value)}
                className="rounded-lg bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              />
              <span className="text-[11px] text-outline line-through">
                Original {item.litres != null ? `${Number(item.litres)} L` : "—"}
              </span>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void fixAndApprove()}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-on-secondary font-headline font-semibold text-sm shadow-sm disabled:opacity-50"
            >
              Fix and approve
            </button>
          </div>

          <label className="rounded-xl bg-surface-container p-4 shadow-sm block text-xs space-y-2">
            <span className="font-headline font-bold text-on-surface">Grade</span>
            <select
              id="pe-grade-select"
              className="w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-sm font-body"
              value={grade}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                setGrade(next);
                void peFetch(`/admin/prices/review/${item.source}/${item.report_id}/grade`, {
                  method: "POST",
                  body: JSON.stringify({ grade: next }),
                })
                  .then(() => onChanged())
                  .catch((err: Error) => onError(err.message));
              }}
            >
              <option value="unknown">Grade unknown</option>
              <option value="e10_87">E-10 87</option>
              <option value="e10_90">E-10 90</option>
              <option value="diesel">Diesel</option>
              <option value="ulsd">ULSD</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDecide(item, "approved")}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-tertiary text-on-tertiary font-headline font-semibold text-sm shadow-sm disabled:opacity-50"
            >
              <Ms name="check" className="text-[18px]" />
              Approve (A)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDecide(item, "rejected")}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-error text-on-error font-headline font-semibold text-sm shadow-sm disabled:opacity-50"
            >
              <Ms name="close" className="text-[18px]" />
              Reject (R)
            </button>
          </div>
          <button type="button" onClick={onBack} className="text-xs font-mono text-secondary hover:underline self-start">
            ← Back to queue
          </button>
        </div>
      </div>
    </div>
  );
}
