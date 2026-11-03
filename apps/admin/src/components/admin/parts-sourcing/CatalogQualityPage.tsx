// Stitch: AM-S6 data_quality_auto_match_health
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import {
  exportPositionIssueReport,
  fetchCatalogCompleteness,
  fetchPartMatchHealth,
  fetchPartMatchRuns,
  fetchPartMatchSchedule,
  fetchPositionReports,
  markPositionReportFixed,
  remapPositionReport,
  runCatalogAudit,
} from "../../../services/partsAutoMatchApi";

export function CatalogQualityPage() {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner = role === "platform_owner";
  const [health, setHealth] = useState<Awaited<ReturnType<typeof fetchPartMatchHealth>> | null>(null);
  const [scheduleMeta, setScheduleMeta] = useState<{ nextRun?: string; cron?: string } | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [completeness, setCompleteness] = useState<Record<string, unknown> | null>(null);
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const [positionPending, setPositionPending] = useState<Array<Record<string, unknown>>>([]);
  const [positionHistory, setPositionHistory] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!token) return;
    const t0 = performance.now();
    const [h, s, comp, pending, history, runLog] = await Promise.all([
      fetchPartMatchHealth(token),
      fetchPartMatchSchedule(token),
      fetchCatalogCompleteness(token).catch(() => ({})),
      fetchPositionReports(token, true).catch(() => ({ rows: [] })),
      fetchPositionReports(token, false).catch(() => ({ rows: [] })),
      fetchPartMatchRuns(token, 10).catch(() => ({ rows: [] })),
    ]);
    setRuns(runLog.rows ?? []);
    setCompleteness(comp);
    setPositionPending(pending.rows ?? []);
    setPositionHistory((history.rows ?? []).filter((r) => r.resolved_at));
    setLatencyMs(Math.round(performance.now() - t0));
    setHealth(h);
    setScheduleMeta(typeof s === "object" && s ? s as { nextRun?: string; cron?: string } : { nextRun: typeof s === "string" ? s : undefined });
  }, [token]);

  useEffect(() => {
    void load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load health"));
  }, [load]);

  const lastRun = health?.lastRun;
  const auditOk = lastRun && !lastRun.error && lastRun.finished_at
    && Date.now() - Date.parse(String(lastRun.finished_at)) < 26 * 3600000;
  const openConflicts = Object.values(health?.openConflicts ?? {}).reduce((a, b) => a + Number(b), 0);
  const unresolved = health?.unresolvedPositionReports ?? positionPending.length;
  const schedule = scheduleMeta?.nextRun ?? null;
  const scheduleLabel = (scheduleMeta as { intervalLabel?: string })?.intervalLabel
    || (scheduleMeta?.cron ? scheduleMeta.cron : "nightly");
  const tierHint = health?.tierBreakdown
    ? `T${Object.keys(health.tierBreakdown).sort()[0] ?? "3"}–T${Object.keys(health.tierBreakdown).sort().slice(-1)[0] ?? "4"}`
    : "T1–T5";

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

  return (
    <div className="flex flex-col gap-space-lg p-margin">
      <nav className="font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant">
        DOMINION › PLATFORM › DATA QUALITY
        {latencyMs != null ? ` · LATENCY ${latencyMs}ms` : ""}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline-xl text-headline-xl text-on-surface">Data Quality</h1>
            <span className={`rounded-[0.75rem] px-2 py-0.5 text-xs font-semibold ${auditOk ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {auditOk ? "ENGINE AUDIT ACTIVE" : "ENGINE AUDIT DEGRADED"}
            </span>
            <span className="rounded-[0.75rem] bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm">
              RECON {health?.engineVersion ?? "—"}.{health?.normVersion ?? "—"}
            </span>
          </div>
          <p className="mt-1 text-body-md text-on-surface-variant">Auto-match health, position clean-up, and catalog completeness.</p>
          <p className="font-mono-sm text-mono-sm text-secondary mt-1">
            Interval · {scheduleLabel}{schedule ? ` (next ${new Date(schedule).toLocaleString()})` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-[0.25rem] border border-outline-variant px-3 py-2 text-sm disabled:opacity-40"
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
            Export issue report
          </button>
          <button type="button" className="rounded-[0.25rem] bg-primary-container px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={!owner || busy} onClick={() => { void runAudit(); }}>
            Run catalog audit
          </button>
        </div>
      </div>

      <section className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 pb-3">
          <h2 className="font-headline-md text-headline-md">Auto-match health</h2>
          <span className={`text-xs font-semibold uppercase ${health?.errorCount24h ? "text-red-700" : "text-emerald-700"}`}>
            ENGINE PULSE {health?.errorCount24h ? "DEGRADED" : "NOMINAL"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthTile label="Live matches" value={String(health?.derived?.live ?? 0)} hint="" />
          <HealthTile label="Needs checking" value={String(health?.derived?.needsChecking ?? 0)} hint={tierHint} />
          <HealthTile label="Hidden by listings" value={String(health?.derived?.suppressed ?? 0)} hint="" />
          <HealthTile
            label="Open conflicts"
            value={String(openConflicts)}
            hint="Review →"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("page", "pending-motor-vehicles");
              url.searchParams.set("tab", "conflicts");
              window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
          />
        </div>
        {lastRun ? (
          <p className="mt-4 font-mono-sm text-mono-sm text-secondary">
            Last run {lastRun.finished_at ? new Date(String(lastRun.finished_at)).toLocaleString() : "—"}
            {lastRun.duration_ms != null ? ` · ${lastRun.duration_ms}ms` : ""}
            {lastRun.rows_scanned != null ? ` · Parsed ${lastRun.rows_scanned} records` : ""}
            {lastRun.error ? ` · Error: ${lastRun.error}` : " · 0 runtime errors"}
          </p>
        ) : null}
        {(health?.errorCount24h ?? 0) > 0 ? (
          <div className="mt-3 rounded-[0.25rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 flex flex-wrap items-center gap-2">
            <span>{health?.errorCount24h} ERROR IN 24H · {lastRun?.error || "See run log"}</span>
            <button type="button" className="text-primary font-semibold underline" onClick={() => {
              void fetchPartMatchRuns(token).then((r) => { setRuns(r.rows); setRunsOpen(true); });
            }}>See run log</button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[0.25rem] bg-surface-container-low px-3 py-2">
          <span className="text-sm">Find parts auto-match · {health?.enabled ? "ON" : "OFF"}</span>
          <button type="button" className="text-sm text-secondary" onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("page", "global-settings-general");
            window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}>
            Global settings
          </button>
        </div>
        {unresolved > 0 ? (
          <div className="mt-3 rounded-[0.25rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            {unresolved} old position values couldn&apos;t be read · PARSER FALLBACK ACTIVE ·{" "}
            <button type="button" className="text-primary font-semibold" onClick={() => document.getElementById("position-queue")?.scrollIntoView({ behavior: "smooth" })}>
              Review queue ↓
            </button>
          </div>
        ) : null}
      </section>

      <section id="position-queue" className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-space-lg">
        <h2 className="font-headline-md text-headline-md">Position clean-up queue</h2>
        <p className="mt-1 text-body-sm text-secondary">NORMALIZER v{health?.normVersion ?? "—"} · front / rear / side grammar</p>
        <PositionTable
          title="Pending review"
          rows={positionPending}
          owner={owner}
          token={token}
          onReload={() => { void load(); }}
        />
        <PositionTable title="Fixed history" rows={positionHistory.slice(0, 20)} owner={false} token={token} onReload={() => { void load(); }} history />
      </section>

      <section className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-space-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-headline-md text-headline-md">Catalog completeness</h2>
          <button type="button" className="text-sm text-primary font-semibold" onClick={() => setCompletenessOpen(true)}>Inspect completeness</button>
        </div>
        <p className="mt-2 text-body-sm text-secondary">
          Vehicles with OE numbers: {String(completeness?.vehiclesWithOeNumbers ?? "—")} / {String(completeness?.vehicleCount ?? "—")} · Platform links: {String(completeness?.platformLinkCount ?? "—")}
        </p>
      </section>

      <section className="rounded-[0.5rem] border border-outline-variant bg-surface-container-lowest p-space-lg">
        <h2 className="font-headline-md text-headline-md">Recent validation exceptions</h2>
        {runs.filter((r) => r.error).length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {runs.filter((r) => r.error).slice(0, 8).map((row) => (
              <li key={String(row.run_id || row.id)} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                {String(row.kind || "run")} · {row.finished_at ? new Date(String(row.finished_at)).toLocaleString() : "In progress"} · {String(row.error)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-secondary">No validation exceptions in the last engine runs.</p>
        )}
      </section>

      {runsOpen ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl overflow-y-auto">
          <div className="flex justify-between items-center">
            <h3 className="font-headline-md">Run log</h3>
            <button type="button" onClick={() => setRunsOpen(false)}>✕</button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {runs.map((row) => (
              <li key={String(row.run_id || row.id)} className="rounded border border-outline-variant/40 p-2">
                {String(row.kind || "run")} · {row.finished_at ? new Date(String(row.finished_at)).toLocaleString() : "—"}
                {row.error ? ` · ${String(row.error)}` : ""}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {completenessOpen ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl">
          <div className="flex justify-between">
            <h3 className="font-headline-md">Catalog completeness</h3>
            <button type="button" onClick={() => setCompletenessOpen(false)}>✕</button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {completeness ? Object.entries(completeness).map(([key, val]) => (
              <li key={key} className="flex justify-between gap-2 border-b border-outline-variant/30 pb-1">
                <span className="text-secondary">{key.replace(/([A-Z])/g, " $1")}</span>
                <span className="font-mono font-semibold">{String(val)}</span>
              </li>
            )) : <li>No completeness data yet.</li>}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

function PositionTable({
  title,
  rows,
  owner,
  token,
  onReload,
  history,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  owner: boolean;
  token: string;
  onReload: () => void;
  history?: boolean;
}) {
  const [draftPos, setDraftPos] = useState<Record<string, string>>({});
  const [draftSide, setDraftSide] = useState<Record<string, string>>({});

  return (
    <div className="mt-4">
      <h3 className="font-semibold text-sm">{title} ({rows.length})</h3>
      {rows.length === 0 ? <p className="text-sm text-secondary mt-1">None.</p> : (
        <table className="mt-2 min-w-full text-left text-xs border border-outline-variant/40 rounded overflow-hidden">
          <thead className="bg-surface-container-low uppercase text-on-surface-variant">
            <tr>
              <th className="px-2 py-1">Original</th>
              <th className="px-2 py-1">Suggested fix</th>
              {!history ? <th className="px-2 py-1">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row.id);
              const pos = draftPos[id] ?? "front";
              const side = draftSide[id] ?? "both";
              return (
                <tr key={id} className="border-t border-outline-variant/30">
                  <td className="px-2 py-1 font-mono">{String(row.original_position || "")} / {String(row.original_side || "")}</td>
                  {!history ? (
                    <td className="px-2 py-1">
                      <div className="flex gap-1">
                        <select className="rounded border px-1 py-0.5" value={pos} onChange={(e) => setDraftPos((p) => ({ ...p, [id]: e.target.value }))}>
                          <option value="front">Front</option>
                          <option value="rear">Rear</option>
                        </select>
                        <select className="rounded border px-1 py-0.5" value={side} onChange={(e) => setDraftSide((p) => ({ ...p, [id]: e.target.value }))}>
                          <option value="both">Both</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </td>
                  ) : (
                    <td className="px-2 py-1">{String(row.resolved_position || row.new_position || "")} / {String(row.resolved_side || row.new_side || "")}</td>
                  )}
                  {!history ? (
                    <td className="px-2 py-1 flex gap-1">
                      <button type="button" className="text-primary disabled:opacity-40" disabled={!owner} onClick={() => {
                        if (!window.confirm("Confirm remap for this row?")) return;
                        void remapPositionReport(token, id, { position: pos, side }).then(onReload).catch((e) => toast.error(e instanceof Error ? e.message : "Remap failed"));
                      }}>Remap</button>
                      <button type="button" className="text-secondary disabled:opacity-40" disabled={!owner} onClick={() => {
                        void markPositionReportFixed(token, id).then(onReload);
                      }}>Mark fixed</button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HealthTile({ label, value, hint, onClick }: { label: string; value: string; hint: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-primary">{hint}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="rounded-[0.5rem] border border-outline-variant bg-surface-container-low p-4 text-left hover:bg-surface-container" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="rounded-[0.5rem] border border-outline-variant bg-surface-container-low p-4">{inner}</div>;
}
