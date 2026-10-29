import { useEffect, useMemo, useState } from "react";
import { useBenchmarkName } from "../refineries/useRefineries";
import { peFetch, type Settings, type Tab } from "./priceEngineApi";

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
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
    { id: "published", label: "Published prices" },
    { id: "reporters", label: "Reporters" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  return (
    <div className="flex items-center gap-2 border-b border-surface-variant/50 pb-px overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            className={
              isActive
                ? "px-4 py-2.5 text-xs font-label font-bold text-secondary bg-surface-container-lowest shadow-sm rounded-t-lg border-b-2 border-secondary relative z-10 flex items-center gap-1.5 whitespace-nowrap"
                : "px-4 py-2.5 text-xs font-label font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 rounded-t-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
            }
          >
            {t.icon ? <Ms name={t.icon} className="text-[16px]" /> : null}
            {t.id === "review" ? <span>Review</span> : <span>{t.label}</span>}
            {t.id === "review" && reviewCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold bg-secondary-container text-on-secondary-container">
                {reviewCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PriceEngineSettingsTab({
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
  const benchmarkName = useBenchmarkName();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    void peFetch<{ settings: Settings }>("/admin/prices/settings")
      .then((body) => {
        setSettings(body.settings);
        setDraft(body.settings);
      })
      .catch((err: Error) => onError(err.message));
  }, [onError]);

  const exampleBounds = useMemo(() => {
    if (!draft) return null;
    const baseline = 201.81;
    const low = baseline * draft.bounds_low;
    const high = baseline * draft.bounds_high;
    return { baseline, low, high };
  }, [draft]);

  if (!draft || !settings) {
    return <p className="text-sm text-on-surface-variant p-8">Loading settings…</p>;
  }

  const patchField = (key: keyof Settings, raw: string) => {
    setDraft({ ...draft, [key]: Number(raw) });
  };

  const save = () => {
    setSavedNote("");
    setBusy(true);
    void peFetch<{ settings: Settings }>("/admin/prices/settings", {
      method: "PATCH",
      body: JSON.stringify(draft),
    })
      .then((body) => {
        setSettings(body.settings);
        setDraft(body.settings);
        setSavedNote("Saved.");
      })
      .catch((err: Error) => onError(err.message))
      .finally(() => setBusy(false));
  };

  const resetDefaults = () => {
    setDraft({
      ...draft,
      bounds_low: 0.8,
      bounds_high: 1.5,
      change_pct: 0.12,
      mad_k: 3.5,
      mad_min_reports: 4,
      window_days: 7,
      fleet_weight: 2,
      plug_weight: 1,
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-label text-outline">
            <span className="hover:text-on-surface cursor-pointer">Dominion</span>
            <Ms name="chevron_right" className="text-[12px]" />
            <span className="hover:text-on-surface cursor-pointer">Master data</span>
            <Ms name="chevron_right" className="text-[12px]" />
            <span className="hover:text-on-surface cursor-pointer">Fuel</span>
            <Ms name="chevron_right" className="text-[12px]" />
            <span className="text-on-surface font-semibold">Price Engine</span>
          </nav>
          <div className="flex items-center gap-3 pt-1">
            <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">Price Engine Settings</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-tertiary-fixed text-on-tertiary-fixed">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
              Engine Live
            </span>
          </div>
          <p className="text-xs text-on-surface-variant font-label">
            Configuring consensus thresholds, outlier detection bounds, and contributor trust dynamics.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-surface-container rounded-xl p-2 px-4 shadow-sm self-start md:self-auto">
          <div className="flex items-center gap-2">
            <Ms name="tune" className="text-secondary text-[20px]" />
            <div className="leading-tight">
              <span className="text-[10px] uppercase font-mono text-outline block">Active Profile</span>
              <span className="text-xs font-semibold text-on-surface font-headline">National (KGN-Standard)</span>
            </div>
          </div>
          <div className="h-6 w-px bg-surface-variant/40" />
          <div className="leading-tight">
            <span className="text-[10px] uppercase font-mono text-outline block">{benchmarkName} week</span>
            <span className="text-xs font-mono font-bold text-secondary">{petrojamWeek}</span>
          </div>
        </div>
      </div>

      <PriceEngineTabBar active="settings" onTab={onTab} reviewCount={reviewCount} />

      <div className="bg-secondary-fixed/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-on-secondary shrink-0">
            <Ms name="info" className="text-[20px]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-on-secondary-fixed font-headline">Re-evaluation pipeline active</p>
            <p className="text-xs text-on-secondary-fixed-variant font-label">
              Changing a setting re-checks waiting reports. It never deletes anything.
            </p>
          </div>
        </div>
        {settings.updated_at ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-on-secondary-fixed bg-surface-container-lowest/80 px-3 py-1.5 rounded-lg shrink-0">
            <Ms name="history" className="text-[14px]" />
            <span>
              Last saved{" "}
              <strong className="font-bold">{new Date(settings.updated_at).toLocaleString("en-JM")}</strong>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Ms name="filter_alt" className="text-secondary text-[20px]" />
                <h2 className="text-sm font-headline font-bold text-on-surface">When a report goes to review</h2>
              </div>
              <p className="text-xs text-on-surface-variant font-label">
                Statistical limits and price anomaly boundaries triggering manual moderator validation.
              </p>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface-container text-outline">
              Bounds-v2
            </span>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-on-surface block font-headline">
                Baseline {benchmarkName} price multipliers
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface-container-low p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-on-surface block">Below {benchmarkName} ×</span>
                    <span className="text-[11px] text-outline font-label">Underflow clamp trigger</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-1.5 rounded-md shadow-xs">
                    <span className="text-xs font-mono text-outline">×</span>
                    <input
                      className="w-12 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                      type="text"
                      value={draft.bounds_low}
                      onChange={(e) => patchField("bounds_low", e.target.value)}
                    />
                  </div>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-on-surface block">Above {benchmarkName} ×</span>
                    <span className="text-[11px] text-outline font-label">Surge spike trigger</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-1.5 rounded-md shadow-xs">
                    <span className="text-xs font-mono text-outline">×</span>
                    <input
                      className="w-12 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                      type="text"
                      value={draft.bounds_high}
                      onChange={(e) => patchField("bounds_high", e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {exampleBounds ? (
                <div className="bg-surface-container-high/60 rounded-lg p-3.5 flex items-start gap-3 mt-2">
                  <Ms name="lightbulb" className="text-[18px] text-on-secondary-container mt-0.5 shrink-0" />
                  <div className="text-xs leading-relaxed text-on-surface-variant">
                    <span className="font-semibold text-on-surface">Example for E-10 87</span> (illustrative {benchmarkName} baseline{" "}
                    <span className="font-mono font-bold text-on-surface">J${exampleBounds.baseline.toFixed(2)}</span>): below{" "}
                    <span className="font-mono font-bold text-error">J${exampleBounds.low.toFixed(2)}</span> or above{" "}
                    <span className="font-mono font-bold text-error">J${exampleBounds.high.toFixed(2)}</span> routed to review.
                  </div>
                </div>
              ) : null}
            </div>
            <div className="h-px bg-surface-container-high" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low p-3.5 rounded-lg">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-on-surface font-headline block">
                  Change vs last published price jump
                </span>
                <span className="text-xs text-on-surface-variant font-label">
                  Triggers review if station price jumps by more than the threshold between consecutive reports.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-surface-container-lowest px-3 py-1.5 rounded-md shadow-xs">
                  <input
                    className="w-8 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                    type="text"
                    value={Math.round(draft.change_pct * 100)}
                    onChange={(e) => patchField("change_pct", String(Number(e.target.value) / 100))}
                  />
                  <span className="text-xs font-mono font-semibold text-outline">%</span>
                </div>
              </div>
            </div>
            <div className="bg-surface-container-low p-3.5 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface font-headline">Station Variance Anomaly Detector</span>
                <span className="text-[10px] font-mono text-outline">Z-Score Algorithm</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-md shadow-xs">
                  <span className="text-xs text-on-surface font-label">Unusual after historical reports:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      className="w-8 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                      type="text"
                      value={draft.mad_min_reports}
                      onChange={(e) => patchField("mad_min_reports", e.target.value)}
                    />
                    <span className="text-[11px] font-label text-outline">logs</span>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-md shadow-xs">
                  <span className="text-xs text-on-surface font-label">Sensitivity threshold (σ):</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      className="w-10 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                      type="text"
                      value={draft.mad_k}
                      onChange={(e) => patchField("mad_k", e.target.value)}
                    />
                    <span className="text-[11px] font-mono text-outline">std dev</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Ms name="schedule" className="text-secondary text-[20px]" />
                  <h2 className="text-sm font-headline font-bold text-on-surface">Price Window &amp; Decay</h2>
                </div>
                <p className="text-xs text-on-surface-variant font-label">Temporal validity window for historical fuel reports.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-surface-container-low p-3.5 rounded-lg space-y-2">
                <label className="text-xs font-semibold text-on-surface block font-headline">{benchmarkName} weekly retention</label>
                <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded-md shadow-xs">
                  <span className="text-xs text-on-surface-variant">Include reports up to:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      className="w-8 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                      type="text"
                      value={draft.window_days}
                      onChange={(e) => patchField("window_days", e.target.value)}
                    />
                    <span className="text-xs text-outline font-label">days</span>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low p-3.5 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface font-headline">High Confidence Badge</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-tertiary-fixed text-on-tertiary-fixed font-bold">
                    VERIFIED
                  </span>
                </div>
                <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded-md shadow-xs">
                  <span className="text-xs text-on-surface-variant">Minimum matching entries:</span>
                  <div className="flex items-center gap-1.5">
                    <input className="w-8 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none" type="text" value="3" readOnly />
                    <span className="text-xs text-outline font-label">reports</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-surface-container text-[11px] text-on-surface-variant font-mono space-y-1">
            <div className="flex items-center gap-1.5 text-on-surface font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              Current cycle: {benchmarkName} {petrojamWeek}
            </div>
            <div>Next recalculation: Wednesday 00:00 EST</div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Ms name="shield_person" className="text-secondary text-[20px]" />
                <h2 className="text-sm font-headline font-bold text-on-surface">Trust &amp; Weighting Defaults</h2>
              </div>
              <p className="text-xs text-on-surface-variant font-label">
                Initial weighting multiplier applied to raw price logs before consensus calculation.
              </p>
            </div>
            <span className="text-xs font-mono text-outline self-start sm:self-auto">Weights applied proportionally (Σw &gt; 1.0)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container-low p-4 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-on-surface font-headline">Fleet driver starting trust</span>
                  <Ms name="local_shipping" className="text-[16px] text-secondary" />
                </div>
                <p className="text-[11px] text-on-surface-variant font-label">Verified commercial app users with GPS verification.</p>
              </div>
              <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-lg shadow-xs mt-2">
                <span className="text-xs font-mono text-outline">Weight</span>
                <input
                  className="w-12 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                  type="text"
                  value={draft.fleet_weight}
                  onChange={(e) => patchField("fleet_weight", e.target.value)}
                />
              </div>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-on-surface font-headline">Plug user starting trust</span>
                  <Ms name="groups" className="text-[16px] text-outline" />
                </div>
                <p className="text-[11px] text-on-surface-variant font-label">Default baseline for crowdsourced public fuel submissions.</p>
              </div>
              <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-lg shadow-xs mt-2">
                <span className="text-xs font-mono text-outline">Weight</span>
                <input
                  className="w-12 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none"
                  type="text"
                  value={draft.plug_weight}
                  onChange={(e) => patchField("plug_weight", e.target.value)}
                />
              </div>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-on-surface font-headline">Maximum trust weight cap</span>
                  <Ms name="vertical_align_top" className="text-[16px] text-tertiary" />
                </div>
                <p className="text-[11px] text-on-surface-variant font-label">Upper ceiling to prevent monopolizing consensus.</p>
              </div>
              <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-lg shadow-xs mt-2">
                <span className="text-xs font-mono text-outline">Weight Max</span>
                <input className="w-12 text-xs font-mono font-bold text-on-surface bg-transparent text-right focus:outline-none" type="text" value="3.00" readOnly />
              </div>
            </div>
            <div className="bg-surface-container-low p-4 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-on-surface font-headline">Trust decrement on reject</span>
                  <Ms name="trending_down" className="text-[16px] text-error" />
                </div>
                <p className="text-[11px] text-on-surface-variant font-label">Penalty when a moderator marks a submission invalid.</p>
              </div>
              <div className="flex items-center justify-between bg-surface-container-lowest p-2.5 rounded-lg shadow-xs mt-2">
                <span className="text-xs font-mono text-outline">Penalty</span>
                <input className="w-14 text-xs font-mono font-bold text-error bg-transparent text-right focus:outline-none" type="text" value="-0.25" readOnly />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 z-20 bg-surface-container-lowest/95 backdrop-blur-md rounded-xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs font-label text-on-surface-variant">
          <Ms name="verified_user" className="text-outline text-[18px]" />
          <span>
            {savedNote || "Unsaved changes apply after Save settings."}
            {settings.updated_at ? (
              <>
                {" "}
                Last saved <span className="font-mono text-on-surface font-medium">{new Date(settings.updated_at).toLocaleDateString("en-JM")}</span>
              </>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            className="px-4 py-2 text-xs font-label font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded-lg"
            onClick={resetDefaults}
          >
            Reset to defaults
          </button>
          <button
            type="button"
            disabled={busy}
            className="px-5 py-2 text-xs font-headline font-semibold text-on-secondary bg-secondary hover:bg-secondary-dim shadow-sm rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
            onClick={save}
          >
            <Ms name="save" className="text-[16px]" />
            <span>Save settings</span>
          </button>
          <button
            type="button"
            disabled={busy}
            className="px-4 py-2 text-xs font-label font-medium text-on-surface bg-surface-container rounded-lg disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              void peFetch<{ republished: number }>("/admin/prices/recalculate-all", { method: "POST" })
                .catch((err: Error) => onError(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Recalculate all
          </button>
        </div>
      </div>
    </div>
  );
}
