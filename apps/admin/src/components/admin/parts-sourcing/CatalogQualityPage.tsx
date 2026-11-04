// Stitch: AM-S6 data_quality_auto_match_health
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { MaterialIcon } from "../parts-database/import/MaterialIcon";
import "../parts-database/partsDatabase.css";
import {
  exportPositionIssueReport,
  fetchCatalogCompleteness,
  fetchCatalogValidationExceptions,
  fetchPartMatchHealth,
  fetchPartMatchRuns,
  fetchPartMatchSchedule,
  fetchPositionReports,
  markPositionReportFixed,
  confirmPositionReportMerge,
  remapPositionReport,
  runCatalogAudit,
} from "../../../services/partsAutoMatchApi";
import {
  COMPLETENESS_DRAWER_ROWS,
  formatActiveLogsLabel,
  formatErrorCount24hLabel,
  formatPositionReportRowId,
  historyAuditTrail,
  historyNormalizedTarget,
  lastError24hMessage,
  normalizerLabelFromHealth,
  oeCoveragePercent,
  parseRemapSelectValue,
  positionReasonNarrative,
  remapBodyFromSelect,
  scheduleIntervalChip,
  specSheetCoveragePercent,
  tierRangeHint,
} from "./catalogQualityUi";

function formatDurationMs(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min} min ${rem} s` : `${min} min`;
}

function formatFoundWhen(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CatalogQualityPage() {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner = role === "platform_owner";
  const [health, setHealth] = useState<Awaited<ReturnType<typeof fetchPartMatchHealth>> | null>(null);
  const [scheduleMeta, setScheduleMeta] = useState<{ nextRun?: string; cron?: string; intervalLabel?: string } | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [completeness, setCompleteness] = useState<Record<string, unknown> | null>(null);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [positionPending, setPositionPending] = useState<Array<Record<string, unknown>>>([]);
  const [positionHistory, setPositionHistory] = useState<Array<Record<string, unknown>>>([]);
  const [validationExceptions, setValidationExceptions] = useState<Array<Record<string, unknown>>>([]);
  const [positionTab, setPositionTab] = useState<"pending" | "history">("pending");

  const load = useCallback(async () => {
    if (!token) return;
    const t0 = performance.now();
    const [h, s, comp, pending, history, runLog, validation] = await Promise.all([
      fetchPartMatchHealth(token),
      fetchPartMatchSchedule(token),
      fetchCatalogCompleteness(token).catch(() => null),
      fetchPositionReports(token, true).catch(() => ({ rows: [] })),
      fetchPositionReports(token, false).catch(() => ({ rows: [] })),
      fetchPartMatchRuns(token, 10).catch(() => ({ rows: [] })),
      fetchCatalogValidationExceptions(token, 50).catch(() => ({ rows: [] })),
    ]);
    setRuns(runLog.rows ?? []);
    setCompleteness(comp);
    setPositionPending(pending.rows ?? []);
    setPositionHistory((history.rows ?? []).filter((r) => r.resolved_at));
    setValidationExceptions(validation.rows ?? []);
    setLatencyMs(Math.round(performance.now() - t0));
    setHealth(h);
    setScheduleMeta(typeof s === "object" && s ? s as { nextRun?: string; cron?: string; intervalLabel?: string } : null);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load health"));
  }, [load]);

  const lastRun = health?.lastRun;
  const auditOk = Boolean(
    lastRun && !lastRun.error && lastRun.finished_at
    && Date.now() - Date.parse(String(lastRun.finished_at)) < 26 * 3600000,
  );
  const openConflicts = Object.values(health?.openConflicts ?? {}).reduce((a, b) => a + Number(b), 0);
  const unresolved = health?.unresolvedPositionReports ?? positionPending.length;
  const tierHint = tierRangeHint(health?.tierBreakdown);
  const intervalChip = scheduleIntervalChip(scheduleMeta?.intervalLabel, scheduleMeta?.cron);
  const reconLabel = `RECON V${health?.engineVersion ?? "—"}.${health?.normVersion ?? "—"}`;
  const oePct = oeCoveragePercent(completeness);
  const specPct = specSheetCoveragePercent(completeness);
  const vehicleCount = Number(completeness?.vehicleCount ?? 0);
  const platformLinks = Number(completeness?.platformLinkCount ?? 0);
  const platformPct = vehicleCount > 0 ? Math.round((platformLinks / vehicleCount) * 1000) / 10 : null;
  const partsWithSpec = Number(completeness?.partsWithSpecAttributes ?? 0);
  const partsTotal = Number(completeness?.parts ?? 0);
  const normalizerLabel = normalizerLabelFromHealth(health?.normVersion, health?.normMode);
  const errorCount24h = Number(health?.errorCount24h ?? 0);
  const lastError24h = health?.lastError24h && typeof health.lastError24h === "object"
    ? health.lastError24h as Record<string, unknown>
    : null;

  async function runAudit() {
    if (!owner || !token) return;
    setBusy(true);
    try {
      await runCatalogAudit(token);
      toast.success("Catalog audit started");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start audit");
    } finally {
      setBusy(false);
    }
  }

  function openCompletenessDrawer() {
    setCompletenessOpen(true);
    if (completeness) return;
    setCompletenessLoading(true);
    void fetchCatalogCompleteness(token)
      .then((comp) => setCompleteness(comp))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load completeness"))
      .finally(() => setCompletenessLoading(false));
  }

  return (
    <div className="parts-database-stitch catalog-quality-record box-border flex w-full max-w-full flex-col gap-space-xl bg-background px-6 py-2 text-on-surface lg:px-10 min-h-[600px]">
      <div className="catalog-quality-subbar flex flex-col gap-space-xs sm:flex-row sm:items-center sm:justify-between py-space-sm">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant"
        >
          <span>DOMINION</span>
          <span className="text-on-surface-variant/70">/</span>
          <span>PLATFORM</span>
          <span className="text-on-surface-variant/70">/</span>
          <span className="font-semibold text-primary">DATA QUALITY</span>
        </nav>
        <div className="flex items-center gap-1.5 font-mono-sm text-mono-sm text-on-surface-variant shrink-0">
          <span>{`LATENCY: ${latencyMs != null ? `${latencyMs}ms` : "—"}`}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md mb-space-xl pb-space-lg bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-space-sm flex-wrap">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight break-words">Data Quality</h1>
            <div className={`catalog-quality-audit-chip inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${auditOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-900"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${auditOk ? "bg-emerald-600 animate-pulse" : "bg-amber-600"}`} />
              <span className="font-mono-sm text-mono-sm font-semibold tracking-wider uppercase">
                {auditOk ? "Engine audit active" : "Engine audit degraded"}
              </span>
            </div>
            <span className="font-mono-sm text-mono-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">{reconLabel}</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-3xl break-words">
            Auto-match health, position clean-up, and catalog completeness.
          </p>
        </div>
        <div className="flex items-center gap-space-sm flex-shrink-0 flex-wrap">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container font-mono-sm text-mono-sm text-on-surface-variant">
            <MaterialIcon name="update" className="text-[16px] text-secondary" />
            <span className="break-words">{intervalChip}</span>
          </div>
          <button
            type="button"
            className="h-9 px-3.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm flex items-center gap-1.5 shadow-sm transition-colors border border-outline-variant/30"
            disabled={!token || busy}
            onClick={() => {
              void exportPositionIssueReport(token).then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "position-issue-report.csv";
                a.click();
                URL.revokeObjectURL(url);
              }).catch((e) => toast.error(e instanceof Error ? e.message : "Export failed"));
            }}
          >
            <MaterialIcon name="file_download" className="text-[18px] text-secondary" />
            <span>Export issue report</span>
          </button>
          <button
            type="button"
            className="catalog-quality-primary-btn h-9 px-4 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40"
            disabled={!owner || busy}
            onClick={() => { void runAudit(); }}
          >
            <MaterialIcon name="play_arrow" className="text-[18px]" />
            <span className="font-medium">Run catalog audit</span>
          </button>
        </div>
      </div>

      <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-space-xl">
        <div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-sm bg-surface-container-low/60">
          <div className="flex items-center gap-space-sm min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary shrink-0">
              <MaterialIcon name="neurology" className="text-[20px]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-headline-md text-headline-md text-on-surface">Auto-match health</h2>
              <span className="font-mono-sm text-mono-sm text-secondary break-words">
                {`Matching brain v${health?.engineVersion ?? "—"}.${health?.normVersion ?? "—"} · ${health?.normMode ?? "strict"} norm`}
              </span>
            </div>
          </div>
          <span className="catalog-quality-engine-pulse px-2.5 py-1 rounded bg-secondary-container/60 text-primary font-mono-sm text-mono-sm font-semibold tracking-wide break-words uppercase">
            {`Engine pulse: ${errorCount24h ? "degraded" : "nominal"} · matching brain v${health?.engineVersion ?? "—"}.${health?.normVersion ?? "—"}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md p-space-lg">
          <HealthTile
            label="Live matches"
            value={String(health?.derived?.live ?? 0)}
            footer="Active in master catalog"
            footerIcon="verified"
            sync
          />
          <HealthTile
            label="Needs checking"
            value={String(health?.derived?.needsChecking ?? 0)}
            hint={tierHint}
            valueClass={Number(health?.derived?.needsChecking) > 0 ? "text-amber-700" : undefined}
            footer="Requires architect review"
            footerIcon="pending_actions"
            footerClass="text-amber-800"
          />
          <HealthTile
            label="Hidden by listings"
            value={String(health?.derived?.suppressed ?? 0)}
            footer="Superseded by manual entries"
          />
          <HealthTile
            label="Open conflicts"
            value={String(openConflicts)}
            highlight
            reviewLink
            footer="Cross-brand fitment ambiguities"
          />
        </div>

        <div className="px-space-lg pb-space-lg space-y-space-xs">
          {lastRun ? (
            <div className="p-3 rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-body-sm text-body-sm text-on-surface break-words">
                  Last full run{" "}
                  <span className="font-mono-md text-mono-md font-semibold">
                    {lastRun.finished_at ? new Date(String(lastRun.finished_at)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                  {" · Duration "}
                  <span className="font-mono-md text-mono-md">{formatDurationMs(lastRun.duration_ms)}</span>
                  {lastRun.rows_scanned != null ? (
                    <>
                      {" · Parsed "}
                      <span className="font-mono-md text-mono-md">{lastRun.rows_scanned}</span>
                      {" records"}
                    </>
                  ) : null}
                </span>
              </div>
              <span className="catalog-quality-runtime-chip font-mono-sm text-mono-sm text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded font-semibold self-start sm:self-auto uppercase">
                {lastRun.error ? "Runtime error" : "0 runtime errors"}
              </span>
            </div>
          ) : null}
          {errorCount24h > 0 ? (
            <div className="catalog-quality-error-strip p-3 rounded-xl bg-red-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="px-2 py-0.5 rounded bg-error text-on-error font-mono-sm text-mono-sm font-semibold shrink-0 uppercase">
                  {formatErrorCount24hLabel(errorCount24h)}
                </div>
                <div className="font-body-sm text-body-sm text-red-950 break-words min-w-0">
                  {lastError24hMessage(lastError24h, lastRun?.error ?? null)}
                </div>
              </div>
              <button
                type="button"
                className="font-mono-sm text-mono-sm text-error hover:text-red-900 font-semibold inline-flex items-center gap-1 shrink-0"
                onClick={() => {
                  void fetchPartMatchRuns(token).then((r) => { setRuns(r.rows); setRunsOpen(true); });
                }}
              >
                <span>See run log</span>
                <MaterialIcon name="north_east" className="text-[14px]" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="bg-surface-container-lowest">
          <div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md hover:bg-surface-container-low/20 transition-colors">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-surface-container text-on-surface-variant mt-0.5 shrink-0">
                <MaterialIcon name={health?.enabled ? "toggle_on" : "toggle_off"} className="text-[20px]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-headline-md text-headline-md text-on-surface">Auto-matching in Find parts</span>
                  <span className={`px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold uppercase ${health?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {health?.enabled ? "On" : "Off"}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-secondary mt-0.5 max-w-2xl break-words">
                  Matches are computed and can be reviewed. Find parts surfaces your own listings until this flag is enabled.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-mono-sm text-mono-sm text-primary font-medium self-start md:self-auto hover:underline shrink-0"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("page", "global-settings-general");
                window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              <span>Configure in Global settings</span>
              <MaterialIcon name="open_in_new" className="text-[14px]" />
            </button>
          </div>
          {unresolved > 0 ? (
            <div className="catalog-quality-position-banner p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-amber-50/50">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-900 shrink-0">
                  <MaterialIcon name="warning" className="text-[20px]" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <span className="font-body-sm text-body-sm text-amber-950 font-semibold break-words">
                    {unresolved} old position values could not be read
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 font-mono-sm text-mono-sm font-semibold shrink-0 uppercase">
                    Parser fallback active
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-label-md text-label-md font-semibold transition-colors self-start md:self-auto shadow-sm shrink-0"
                onClick={() => document.getElementById("cleanupPanel")?.scrollIntoView({ behavior: "smooth" })}
              >
                <span>Review queue</span>
                <MaterialIcon name="arrow_downward" className="text-[16px]" />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section id="cleanupPanel" className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-space-xl">
        <div className="p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-low/40">
          <div className="min-w-0">
            <div className="flex items-center gap-space-sm flex-wrap">
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Position clean-up queue</h2>
              <span className="catalog-quality-normalizer-chip px-2 py-0.5 rounded bg-primary-fixed text-primary font-mono-sm text-mono-sm font-semibold uppercase">
                {normalizerLabel}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-secondary mt-1 break-words">
              Legacy rows where position or side failed strict parser grammar.
            </p>
          </div>
          <div className="flex items-center p-1 rounded-xl bg-surface-container-high self-start lg:self-auto">
            <button
              type="button"
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-all ${positionTab === "pending" ? "bg-surface-container-lowest shadow-sm text-on-surface font-semibold" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setPositionTab("pending")}
            >
              {`Pending review (${positionPending.length})`}
            </button>
            <button
              type="button"
              className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-all ${positionTab === "history" ? "bg-surface-container-lowest shadow-sm text-on-surface font-semibold" : "text-secondary hover:text-on-surface"}`}
              onClick={() => setPositionTab("history")}
            >
              {`Fixed history (${positionHistory.length})`}
            </button>
          </div>
        </div>

        {positionTab === "pending" ? (
          <PositionPendingTable rows={positionPending} owner={owner} token={token} onReload={() => { void load(); }} />
        ) : (
          <PositionHistoryTable rows={positionHistory.slice(0, 50)} />
        )}

        <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm text-secondary font-mono-sm text-mono-sm">
          <div className="flex items-center gap-2 min-w-0">
            <MaterialIcon name="info" className="text-[16px] shrink-0" />
            <span className="break-words">Unresolved entries default to loose non-positional containment</span>
          </div>
          <button
            type="button"
            className="text-primary hover:underline shrink-0"
            disabled={!token}
            onClick={() => {
              void exportPositionIssueReport(token).then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "position-anomalies.csv";
                a.click();
                URL.revokeObjectURL(url);
              });
            }}
          >
            Download raw anomalies .csv
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-xl">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm space-y-space-md">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Catalog completeness</h3>
              <p className="font-body-sm text-body-sm text-secondary">Master fitment parameter saturation</p>
            </div>
            <MaterialIcon name="data_saver_on" className="text-primary" />
          </div>
          <div className="space-y-space-md pt-2">
            <CompletenessBar
              label="OE numbers coverage"
              pct={oePct}
              detail={completeness ? `${completeness.vehiclesWithOeNumbers ?? "—"} of ${completeness.vehicleCount ?? "—"} vehicles linked` : "—"}
            />
            <CompletenessBar
              label="Platform linkages"
              pct={platformPct}
              detail={completeness ? `${platformLinks} platform links on file` : "—"}
              tone="emerald"
            />
            <CompletenessBar
              label="Spec sheet attributes"
              pct={specPct}
              detail={
                completeness && partsTotal > 0
                  ? `${partsWithSpec} of ${partsTotal} parts with index or approval specs`
                  : "Dimensions, thread pitch, connectors"
              }
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono-sm text-mono-sm text-primary hover:underline font-medium disabled:opacity-40"
            disabled={completenessLoading}
            onClick={openCompletenessDrawer}
          >
            <span>{completenessLoading ? "Loading completeness…" : "Inspect completeness logs"}</span>
            <MaterialIcon name="arrow_forward" className="text-[14px]" />
          </button>
        </div>

        <div className="lg:col-span-2 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-space-md gap-2 flex-wrap">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Recent validation exceptions</h3>
                <p className="font-body-sm text-body-sm text-secondary">Real-time catalog sanitization and ingestion alerts</p>
              </div>
              <span className="catalog-quality-active-logs px-2 py-0.5 rounded bg-surface-container text-secondary font-mono-sm text-mono-sm font-medium shrink-0">
                {formatActiveLogsLabel(validationExceptions.length)}
              </span>
            </div>
            {validationExceptions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-surface-container-low font-label-xs text-label-xs text-secondary uppercase tracking-wider h-8">
                      <th className="px-3 py-1.5">Exception</th>
                      <th className="px-3 py-1.5">Affected spec</th>
                      <th className="px-3 py-1.5">Source</th>
                      <th className="px-3 py-1.5 text-right">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high text-body-sm font-body-sm">
                    {validationExceptions.slice(0, 20).map((row) => {
                      const detailMsg = String((row.detail as { message?: string })?.message ?? row.detail ?? "");
                      return (
                        <tr key={String(row.id)}>
                          <td className="px-3 py-2.5 font-mono-sm text-mono-sm text-on-surface">
                            <div className="font-semibold text-on-surface break-words">{String(row.code || "—")}</div>
                            {detailMsg ? <div className="text-secondary text-[11px] break-words">{detailMsg}</div> : null}
                          </td>
                          <td className="px-3 py-2.5 font-mono-sm text-mono-sm text-secondary break-words">{String(row.affected_ref || "—")}</td>
                          <td className="px-3 py-2.5 font-body-sm text-body-sm text-on-surface break-words">{String(row.source || "—")}</td>
                          <td className="px-3 py-2.5 text-right">
                            <SeverityBadge severity={String(row.severity || "")} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="font-body-sm text-body-sm text-secondary">No validation exceptions on file.</p>
            )}
          </div>
        </div>
      </div>

      {runsOpen ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl overflow-y-auto">
          <div className="flex justify-between items-center">
            <h3 className="font-headline-md">Run log</h3>
            <button type="button" onClick={() => setRunsOpen(false)} aria-label="Close">✕</button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {runs.map((row) => (
              <li key={String(row.run_id || row.id)} className="rounded border border-outline-variant/40 p-2 break-words">
                {String(row.kind || "run")} · {row.finished_at ? new Date(String(row.finished_at)).toLocaleString() : "—"}
                {row.error ? ` · ${String(row.error)}` : ""}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {completenessOpen ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl overflow-y-auto">
          <div className="flex justify-between items-center">
            <h3 className="font-headline-md">Catalog completeness</h3>
            <button type="button" onClick={() => setCompletenessOpen(false)} aria-label="Close">✕</button>
          </div>
          {completenessLoading ? <p className="mt-4 text-sm text-secondary">Loading completeness…</p> : null}
          <ul className="mt-4 space-y-2 text-sm">
            {completeness ? COMPLETENESS_DRAWER_ROWS.map(({ key, label }) => (
              completeness[key] != null ? (
                <li key={key} className="flex justify-between gap-2 border-b border-outline-variant/30 pb-1">
                  <span className="text-secondary break-words">{label}</span>
                  <span className="font-mono font-semibold shrink-0">{String(completeness[key])}</span>
                </li>
              ) : null
            )) : !completenessLoading ? <li>No completeness data yet.</li> : null}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

function CompletenessBar({
  label,
  pct,
  detail,
  tone = "primary",
}: {
  label: string;
  pct: number | null;
  detail: string;
  tone?: "primary" | "emerald";
}) {
  const width = pct != null ? `${Math.min(100, Math.max(0, pct))}%` : "0%";
  return (
    <div>
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="font-body-sm text-body-sm text-on-surface font-medium break-words">{label}</span>
        <span className={`font-mono-sm text-mono-sm font-semibold shrink-0 ${tone === "emerald" ? "text-emerald-700" : "text-primary"}`}>
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${tone === "emerald" ? "bg-emerald-600" : "bg-primary-container"}`} style={{ width }} />
      </div>
      <span className="font-mono-sm text-mono-sm text-secondary block mt-0.5 break-words">{detail}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const cls = s === "high" ? "bg-red-100 text-red-800"
    : s === "medium" ? "bg-amber-100 text-amber-900"
      : "bg-surface-container text-secondary";
  return (
    <span className={`px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold uppercase ${cls}`}>
      {severity || "—"}
    </span>
  );
}

function HealthTile({
  label,
  value,
  hint,
  footer,
  footerIcon,
  footerClass,
  valueClass,
  sync,
  highlight,
  reviewLink,
}: {
  label: string;
  value: string;
  hint?: string;
  footer?: string;
  footerIcon?: string;
  footerClass?: string;
  valueClass?: string;
  sync?: boolean;
  highlight?: boolean;
  reviewLink?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary break-words">{label}</span>
        {sync ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 font-mono-sm text-mono-sm shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Sync
          </span>
        ) : null}
        {hint ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono-sm text-mono-sm font-semibold shrink-0">{hint}</span>
        ) : null}
        {reviewLink ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/70 hover:bg-amber-300 text-amber-950 font-label-md text-label-md font-semibold transition-colors shrink-0"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("page", "pending-motor-vehicles");
              url.searchParams.set("tab", "conflicts");
              window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          >
            <span>Review</span>
            <MaterialIcon name="arrow_forward" className="text-[14px]" />
          </button>
        ) : null}
      </div>
      <div className="my-space-sm">
        <div className={`font-mono-lg text-[28px] leading-8 font-semibold tracking-tight ${valueClass ?? (highlight ? "text-amber-900" : "text-on-surface")}`}>
          {value}
        </div>
      </div>
      {footer ? (
        <div className={`font-body-sm text-body-sm flex items-center gap-1 break-words ${footerClass ?? "text-secondary"}`}>
          {footerIcon ? <MaterialIcon name={footerIcon} className="text-[16px] shrink-0" /> : null}
          <span>{footer}</span>
        </div>
      ) : null}
    </>
  );
  const shell = highlight
    ? "catalog-quality-open-conflicts-tile p-space-md rounded-xl bg-amber-50/70 shadow-sm flex flex-col justify-between"
    : "p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between hover:bg-surface-container-low/30 transition-colors";
  return <div className={shell}>{body}</div>;
}

function PositionPendingTable({
  rows,
  owner,
  token,
  onReload,
}: {
  rows: Array<Record<string, unknown>>;
  owner: boolean;
  token: string;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function applyRow(row: Record<string, unknown>) {
    const id = String(row.id);
    const raw = draft[id] ?? "";
    const parsed = parseRemapSelectValue(raw, row);
    if (!parsed) {
      await markPositionReportFixed(token, id);
      onReload();
      return;
    }
    if (parsed.kind === "merge") {
      if (!window.confirm("Confirm merge — keep the survivor listing and close this report?")) return;
      await confirmPositionReportMerge(token, id, parsed.survivorId);
      onReload();
      return;
    }
    const body = remapBodyFromSelect(parsed);
    await remapPositionReport(token, id, body);
    onReload();
  }

  if (!rows.length) {
    return <p className="p-space-lg font-body-sm text-secondary">None pending.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[960px]">
        <thead>
          <tr className="bg-surface-container-low font-label-xs text-label-xs text-secondary uppercase tracking-wider h-10">
            <th className="px-space-lg py-2">Table</th>
            <th className="px-space-md py-2">Row id</th>
            <th className="px-space-md py-2">Original value</th>
            <th className="px-space-lg py-2">What happened</th>
            <th className="px-space-md py-2">Found</th>
            <th className="px-space-lg py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-high text-body-sm font-body-sm">
          {rows.map((row) => {
            const id = String(row.id);
            const narrative = positionReasonNarrative(row);
            const original = String(row.original_position || row.original_side || "—");
            const isDup = String(row.reason) === "duplicate_after_normalization";
            const survivorId = String(row.survivor_id || "");
            return (
              <tr key={id} className="hover:bg-surface-container-low/40 transition-colors">
                <td className="px-space-lg py-3 font-mono-sm text-mono-sm text-secondary font-medium break-words">{String(row.table_name || "—")}</td>
                <td className="px-space-md py-3 font-mono-sm text-mono-sm text-primary font-semibold">{formatPositionReportRowId(row.row_id ?? row.id)}</td>
                <td className="px-space-md py-3">
                  <span className="catalog-quality-original-chip inline-flex items-center px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold break-words">
                    {`"${original}"`}
                  </span>
                </td>
                <td className="px-space-lg py-3">
                  <div className="flex items-center gap-1.5 text-on-surface min-w-0">
                    <MaterialIcon name={narrative.icon} className="text-[16px] text-amber-600 shrink-0" />
                    <span className="break-words">{narrative.text}</span>
                  </div>
                </td>
                <td className="px-space-md py-3 font-mono-sm text-mono-sm text-secondary whitespace-nowrap">{formatFoundWhen(row.created_at)}</td>
                <td className="px-space-lg py-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <select
                      className="h-8 pl-2 pr-7 rounded-lg bg-surface-container-lowest text-on-surface font-mono-sm text-mono-sm shadow-sm border border-outline-variant/40 max-w-[12rem]"
                      value={draft[id] ?? ""}
                      disabled={!owner}
                      onChange={(e) => setDraft((p) => ({ ...p, [id]: e.target.value }))}
                    >
                      <option value="">Remap position…</option>
                      <option value="any">Any position / side</option>
                      <option value="front|both">Front · both sides</option>
                      <option value="rear|both">Rear · both sides</option>
                      <option value="front|left">Front left</option>
                      <option value="front|right">Front right</option>
                      {isDup && survivorId ? (
                        <option value={`merge:${survivorId}`}>{`Confirm merge ${formatPositionReportRowId(survivorId)}`}</option>
                      ) : null}
                    </select>
                    <button
                      type="button"
                      className="catalog-quality-primary-btn h-8 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-mono-sm text-mono-sm font-semibold transition-colors shadow-sm disabled:opacity-40"
                      disabled={!owner}
                      onClick={() => {
                        void applyRow(row).catch((e) => toast.error(e instanceof Error ? e.message : "Action failed"));
                      }}
                    >
                      Mark fixed
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionHistoryTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) {
    return <p className="p-space-lg font-body-sm text-secondary">No fixed rows yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[960px]">
        <thead>
          <tr className="bg-surface-container-low font-label-xs text-label-xs text-secondary uppercase tracking-wider h-10">
            <th className="px-space-lg py-2">Table</th>
            <th className="px-space-md py-2">Row id</th>
            <th className="px-space-md py-2">Previous value</th>
            <th className="px-space-lg py-2">Normalized target</th>
            <th className="px-space-md py-2">Date resolved</th>
            <th className="px-space-lg py-2 text-right">Audit trail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-high text-body-sm font-body-sm">
          {rows.map((row) => (
            <tr key={String(row.id)} className="hover:bg-surface-container-low/40">
              <td className="px-space-lg py-3 font-mono-sm text-mono-sm text-secondary break-words">{String(row.table_name || "—")}</td>
              <td className="px-space-md py-3 font-mono-sm text-mono-sm text-on-surface">{formatPositionReportRowId(row.row_id ?? row.id)}</td>
              <td className="px-space-md py-3 font-mono-sm text-mono-sm text-secondary line-through break-words">{`"${String(row.original_position || "—")}"`}</td>
              <td className="px-space-lg py-3 font-mono-sm text-mono-sm text-emerald-700 font-semibold break-words">{historyNormalizedTarget(row)}</td>
              <td className="px-space-md py-3 font-mono-sm text-mono-sm text-secondary whitespace-nowrap">{formatFoundWhen(row.resolved_at)}</td>
              <td className="px-space-lg py-3 text-right">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-surface-container text-secondary font-mono-sm text-mono-sm font-medium max-w-full">
                  <MaterialIcon name="check_circle" className="text-[14px] text-emerald-600 shrink-0" />
                  <span className="break-words">{historyAuditTrail(row)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
