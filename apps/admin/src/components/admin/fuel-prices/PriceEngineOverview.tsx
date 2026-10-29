import { useEffect, useMemo, useState } from "react";
import {
  peFetch,
  type OverviewPayload,
  type OverviewResponse,
  type Tab,
} from "./priceEngineApi";

const TAB_META: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "insights" },
  { id: "review", label: "Review", icon: "rate_review" },
  { id: "published", label: "Published prices", icon: "local_gas_station" },
  { id: "reporters", label: "Reporters", icon: "badge" },
  { id: "settings", label: "Settings", icon: "tune" },
];

function stitchReasonRows(reasons: Record<string, number> | undefined) {
  const r = reasons || {};
  return [
    { key: "OUT_OF_BOUNDS", label: "Out of bounds", count: r.OUT_OF_BOUNDS ?? 0 },
    { key: "BIG_CHANGE", label: "Big change (>$8 JMD)", count: r.BIG_CHANGE ?? 0 },
    {
      key: "MAD_OUTLIER",
      label: "Unusual for station",
      count: (r.MAD_OUTLIER ?? 0) + (r.UNUSUAL_FOR_STATION ?? 0),
    },
    {
      key: "UNKNOWN_GRADE",
      label: "Grade unknown",
      count: (r.UNKNOWN_GRADE ?? 0) + (r.GRADE_UNKNOWN ?? 0),
    },
    { key: "MOCK_LOCATION", label: "Mock location detected", count: r.MOCK_LOCATION ?? 0 },
    { key: "DUPLICATE", label: "Duplicate submission", count: r.DUPLICATE ?? 0 },
  ];
}

type EngineHealth = {
  review_count?: number;
  oldest_review_at?: string | null;
  outdated_share?: number;
  median_report_count?: number | string | null;
  unusual_share?: number;
  top_reporter_share?: number;
};

type OverviewSettings = {
  mad_k?: number;
  change_pct?: number;
};

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

function formatPetrojamWeekLabel(value: string): string {
  if (!value || value === "—") return "—";
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function pendingAgeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return `${hours}h`;
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.min(100, (n / d) * 100);
}

export function PriceEngineOverviewTab({
  onError,
  onTab,
  reviewCount,
  petrojamWeek,
  onRecalculate,
  recalcBusy,
  refreshKey = 0,
}: {
  onError: (message: string) => void;
  onTab: (tab: Tab) => void;
  reviewCount: number;
  petrojamWeek: string;
  onRecalculate: () => void;
  recalcBusy: boolean;
  refreshKey?: number;
}) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    void peFetch<OverviewResponse>("/admin/prices/overview")
      .then((body) => setData(body.overview || null))
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, [onError, refreshKey]);

  const health = (data?.health || {}) as EngineHealth;
  const settings = (data as OverviewPayload & { settings?: OverviewSettings })?.settings;

  const reasons = useMemo(() => stitchReasonRows(data?.reasons), [data?.reasons]);
  const maxReason = useMemo(() => Math.max(1, ...reasons.map((r) => r.count)), [reasons]);

  const live = data?.livePrices ?? 0;
  const verified = data?.verifiedStations ?? 0;
  const livePct = pct(live, verified);
  const pending = data?.reviewCount ?? reviewCount;
  const oldestPending = pendingAgeLabel(data?.oldestReviewAt);
  const fleet = data?.fleetThisWeek ?? 0;
  const plug = data?.plugThisWeek ?? 0;
  const reportsWeek = data?.reportsThisWeek ?? fleet + plug;
  const fleetPct = pct(fleet, reportsWeek);
  const plugPct = pct(plug, reportsWeek);
  const medianRaw = data?.medianReports ?? health.median_report_count;
  const median =
    medianRaw != null && medianRaw !== "" && !Number.isNaN(Number(medianRaw))
      ? Number(medianRaw).toFixed(1)
      : "—";
  const medianNum = median === "—" ? null : Number(median);

  const parishes = data?.parishes || [];
  const parishLabel = `${parishes.length} PARISH${parishes.length === 1 ? "" : "ES"}`;

  const oldestMs = data?.oldestReviewAt ? Date.now() - new Date(data.oldestReviewAt).getTime() : 0;
  const reviewAgeOk = !data?.oldestReviewAt || oldestMs <= 3 * 86400000;
  const allPass = Boolean(data?.dailyJobOk) && reviewAgeOk;

  const unusualPct =
    health.unusual_share != null && !Number.isNaN(Number(health.unusual_share))
      ? `${(Number(health.unusual_share) * 100).toFixed(1)}% flagged unusual`
      : "—";

  const body = loading ? (
    <p className="text-sm text-on-surface-variant font-label">Loading overview…</p>
  ) : !data ? (
    <p className="text-sm text-on-surface-variant font-label">Overview is not available yet.</p>
  ) : (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-outline text-xs font-label">
            <span>Live prices</span>
            <Ms name="check_circle" className="text-[18px] text-tertiary" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-on-surface tracking-tight">
              {live} <span className="text-sm font-normal text-outline">/ {verified}</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">verified stations have price this week</p>
          </div>
          <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
            <div className="bg-tertiary h-full rounded-full" style={{ width: `${livePct}%` }} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onTab("review")}
          className="text-left bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3 group hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-outline text-xs font-label">
            <span>Waiting for review</span>
            <Ms name="report_problem" className="text-[18px] text-on-error-container" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-bold text-on-error-container tracking-tight">
                {pending} reports
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">oldest pending {oldestPending}</p>
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary group-hover:translate-x-0.5 transition-transform">
            <span>Resolve queues</span>
            <Ms name="arrow_forward" className="text-[14px]" />
          </div>
        </button>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-outline text-xs font-label">
            <span>May be outdated</span>
            <Ms name="history" className="text-[18px] text-outline" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-on-surface tracking-tight">
              {data.outdatedPrices ?? 0} prices
            </div>
            <p className="text-[11px] text-on-surface-variant mt-0.5">from an older Petrojam week</p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-outline font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant" />
            <span>stale threshold &gt; 7d</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-outline text-xs font-label">
            <span>Reports this week</span>
            <Ms name="local_shipping" className="text-[18px] text-primary" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-on-surface tracking-tight">{reportsWeek}</div>
            <p className="text-[11px] text-on-surface-variant mt-0.5 font-mono">
              Fleet {fleet} • Plug {plug}
            </p>
          </div>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-surface-container">
            <div className="bg-primary h-full" style={{ width: `${fleetPct}%` }} title={`Fleet: ${fleetPct.toFixed(0)}%`} />
            <div
              className="bg-error-container h-full"
              style={{ width: `${plugPct}%` }}
              title={`Plug: ${plugPct.toFixed(0)}%`}
            />
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-outline text-xs font-label">
            <span>Median reports / price</span>
            <Ms name="hub" className="text-[18px] text-tertiary" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-on-surface tracking-tight">{median}</div>
            {medianNum != null && medianNum >= 2 ? (
              <p className="text-[11px] text-tertiary font-medium mt-0.5">consensus threshold met</p>
            ) : (
              <p className="text-[11px] text-on-surface-variant mt-0.5">building consensus</p>
            )}
          </div>
          <div
            className="text-[10px] text-outline font-mono truncate"
            title="Calculated based on 7-day weighted median"
          >
            7-day weighted median
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-headline font-bold text-on-surface">Why reports went to review</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                LAST 30 DAYS
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mb-6">
              Breakdown of safety trips flagging manual confirmation.
            </p>
            <div className="space-y-4">
              {reasons.map(({ key, label, count }) => {
                const muted = count === 0;
                const barPct = count > 0 ? (count / maxReason) * 100 : 0;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={muted ? "text-outline" : count >= maxReason ? "text-on-surface font-medium" : "text-on-surface"}>
                        {label}
                      </span>
                      <span className={`font-mono font-semibold ${muted ? "text-outline" : "text-outline"}`}>{count}</span>
                    </div>
                    <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-secondary h-full rounded-full transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pt-6 mt-6 bg-surface-container-low -mx-5 -mb-5 p-4 rounded-b-xl flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>
              Engine rejection rule:{" "}
              {settings?.change_pct != null ? `change ${Number(settings.change_pct) * 100}%` : "configured"}
            </span>
            <span className="font-mono font-semibold text-tertiary">{unusualPct}</span>
          </div>
        </div>

        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-headline font-bold text-on-surface">Price this week vs Petrojam</h3>
                <p className="text-xs text-on-surface-variant">
                  E-10 87 average pump price vs wholesale refinery baseline (8 weeks)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-3 mb-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-secondary" />
                <span className="text-on-surface">Average pump (JMD)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-primary-container" />
                <span className="text-outline">Petrojam wholesale</span>
              </div>
            </div>
            <div className="w-full h-52 relative mt-2">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 540 180">
                <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" x1="0" x2="540" y1="20" y2="20" />
                <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" x1="0" x2="540" y1="65" y2="65" />
                <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" x1="0" x2="540" y1="110" y2="110" />
                <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" x1="0" x2="540" y1="155" y2="155" />
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-3 mt-2 border-t-0 font-mono text-outline-variant flex-wrap gap-2">
            <span>
              Current Petrojam week: <strong className="text-on-surface">{formatPetrojamWeekLabel(petrojamWeek)}</strong>
            </span>
            <span>
              Live prices: <strong className="text-secondary">{live}</strong>
            </span>
            <span>
              Outdated: <strong className="text-on-surface">{data.outdatedPrices ?? 0}</strong>
            </span>
          </div>
        </div>

        <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-headline font-bold text-on-surface">Coverage by parish</h3>
              <p className="text-xs text-on-surface-variant">Live station density in current network scope</p>
            </div>
            <span className="text-xs font-mono text-outline">{parishLabel}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 rounded-l-lg">Parish</th>
                  <th className="py-2.5 px-3 font-mono text-right">Stations</th>
                  <th className="py-2.5 px-3 font-mono text-right">Live Price</th>
                  <th className="py-2.5 px-3 font-mono text-right">Outdated</th>
                  <th className="py-2.5 px-4 rounded-r-lg w-44">Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y-0 text-on-surface">
                {parishes.map((row) => {
                  const coverage = pct(row.live, row.stations);
                  const dot = coverage >= 75 ? "bg-secondary" : "bg-outline-variant";
                  const liveClass = row.live > 0 ? "font-semibold text-tertiary" : "text-outline";
                  return (
                    <tr key={row.parish} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-2.5 px-3 font-medium">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                          {row.parish}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right">{row.stations}</td>
                      <td className={`py-2.5 px-3 font-mono text-right ${liveClass}`}>{row.live}</td>
                      <td className="py-2.5 px-3 font-mono text-right text-outline">{row.outdated}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-surface-container rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${row.live > 0 ? "bg-tertiary" : "bg-outline-variant"}`}
                              style={{ width: `${coverage}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-outline w-8 text-right">
                            {Math.round(coverage)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Ms name="verified_user" className="text-tertiary text-[20px]" />
                <h3 className="text-sm font-headline font-bold text-on-surface">Engine health</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                  allPass
                    ? "bg-tertiary-container text-on-tertiary-container"
                    : "bg-error-container text-on-error-container"
                }`}
              >
                {allPass ? "ALL PASS" : "CHECK"}
              </span>
            </div>
            <ul className="space-y-3.5">
              <li className="flex items-start gap-3">
                <Ms
                  name={data.dailyJobOk ? "check_circle" : "error"}
                  className={`${data.dailyJobOk ? "text-tertiary" : "text-error"} text-[18px] mt-0.5 shrink-0`}
                />
                <div className="text-xs">
                  <div className="font-medium text-on-surface">
                    {data.dailyJobOk ? "Daily job succeeded within 48h" : "Daily job not confirmed"}
                  </div>
                  <div className="text-outline text-[11px] font-mono">Job: places-price-engine-daily</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Ms name="check_circle" className="text-tertiary text-[18px] mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-on-surface">
                    Petrojam week {formatPetrojamWeekLabel(petrojamWeek)}
                  </div>
                  <div className="text-outline text-[11px]">Wholesale matrix matching index</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Ms
                  name={reviewAgeOk ? "check_circle" : "error"}
                  className={`${reviewAgeOk ? "text-tertiary" : "text-error"} text-[18px] mt-0.5 shrink-0`}
                />
                <div className="text-xs">
                  <div className="font-medium text-on-surface">
                    {reviewAgeOk
                      ? "No report older than 3 days in review"
                      : "Review queue has reports older than 3 days"}
                  </div>
                  <div className="text-outline text-[11px]">
                    Oldest pending {oldestPending === "—" ? "none" : oldestPending}
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Ms name="check_circle" className="text-tertiary text-[18px] mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-medium text-on-surface">Median {median} reports per published price</div>
                  <div className="text-outline text-[11px] font-mono">
                    Unusual share:{" "}
                    {health.unusual_share != null
                      ? `${(Number(health.unusual_share) * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                </div>
              </li>
            </ul>
          </div>
          <div className="mt-6 pt-4 bg-surface-container rounded-lg p-3 text-xs flex items-center justify-between text-on-surface-variant font-mono">
            <span>Consensus algorithm:</span>
            <span className="text-on-surface font-semibold">WMEDIAN-V2</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col w-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-label text-outline">
          <span className="hover:text-on-surface transition-colors cursor-pointer">Dominion</span>
          <span className="text-outline-variant">›</span>
          <span className="hover:text-on-surface transition-colors cursor-pointer">Master data</span>
          <span className="text-outline-variant">›</span>
          <span className="hover:text-on-surface transition-colors cursor-pointer">Fuel</span>
          <span className="text-outline-variant">›</span>
          <span className="text-on-surface font-semibold">Price Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface text-[11px] font-mono tracking-wider font-semibold uppercase shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
            REGION: JM-KGN
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-headline font-bold tracking-tight text-on-surface">Price Engine</h1>
          <p className="text-sm text-on-surface-variant max-w-xl">
            Turns driver fuel reports into one trusted price per station and grade across Jamaica.
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-xs font-mono">
            <Ms name="calendar_month" className="text-[16px] text-primary" />
            <span>
              Petrojam week:{" "}
              <strong className="text-on-surface font-semibold">{formatPetrojamWeekLabel(petrojamWeek)}</strong>
            </span>
          </div>
          <button
            type="button"
            disabled={recalcBusy}
            onClick={onRecalculate}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-secondary text-on-secondary hover:bg-secondary-dim transition-all text-xs font-medium shadow-sm active:scale-95 disabled:opacity-60"
          >
            <Ms name="sync" className={`text-[16px] ${recalcBusy ? "animate-spin" : ""}`} />
            <span>Recalculate all</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl shadow-sm overflow-x-auto">
        {TAB_META.map((t) => {
          const active = t.id === "overview";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-headline text-xs whitespace-nowrap transition-colors ${
                active
                  ? "bg-surface-container-lowest text-secondary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-medium"
              }`}
            >
              <Ms name={t.icon} className="text-[18px]" />
              {t.label}
              {t.id === "review" && reviewCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-error-container text-on-error-container font-mono text-[10px] font-bold">
                  {reviewCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {body}
    </div>
  );
}
