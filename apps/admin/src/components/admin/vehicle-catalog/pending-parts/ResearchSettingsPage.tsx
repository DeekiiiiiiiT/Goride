// Stitch: dominion-redesign/pending_catalog_research_settings_and_health
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./pendingParts.css";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import {
  addCatalogTrustedSource,
  downloadCatalogResearchExportCsv,
  fetchCatalogResearchIncidents,
  fetchCatalogResearchSettings,
  fetchCatalogResearchStrip,
  fetchCatalogTrustedSources,
  patchCatalogResearchSettings,
  patchCatalogTrustedSource,
  reprocessQueuedJobs,
  retryCatalogResearchJob,
  type CatalogResearchIncident,
  type CatalogResearchSettingsResponse,
  type CatalogResearchStrip,
  type CatalogTrustedSource,
} from "../../../../services/pendingPartsCatalogService";
import {
  buildHealthNotices,
  CATALOG_RESEARCH_ENGINE_REV,
} from "./pendingCatalogViewModels";

export function ResearchSettingsPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [data, setData] = useState<CatalogResearchSettingsResponse | null>(null);
  const [strip, setStrip] = useState<CatalogResearchStrip | null>(null);
  const [sources, setSources] = useState<CatalogTrustedSource[]>([]);
  const [incidents, setIncidents] = useState<CatalogResearchIncident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newKind, setNewKind] = useState<"oem_catalog" | "aftermarket_catalog">("oem_catalog");
  const [showAddDomain, setShowAddDomain] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [settings, stripData, trusted, incidentRows] = await Promise.all([
        fetchCatalogResearchSettings(token),
        fetchCatalogResearchStrip(token),
        fetchCatalogTrustedSources(token),
        fetchCatalogResearchIncidents(token),
      ]);
      setData(settings);
      setStrip(stripData);
      setSources(trusted);
      setIncidents(incidentRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const settings = data?.settings;
  const status = data?.status ?? "NOMINAL";
  const notices = useMemo(
    () => buildHealthNotices((data?.health || {}) as Record<string, unknown>, strip),
    [data?.health, strip],
  );

  const statusClass =
    status === "PAUSED"
      ? "bg-surface-container text-on-surface-variant"
      : status === "DEGRADED"
        ? "bg-[#b45309]/10 text-[#b45309]"
        : "bg-[#006e31]/10 text-[#006e31]";

  async function patchSettings(patch: Parameters<typeof patchCatalogResearchSettings>[1]) {
    if (!token) return;
    setBusy(true);
    try {
      await patchCatalogResearchSettings(token, patch);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="pending-parts-stitch p-margin text-error">{error}</div>;
  }

  return (
    <div className="pending-parts-stitch px-margin py-margin max-w-[1440px]">
      <div className="mb-space-lg flex flex-col gap-space-xs">
        <a className="inline-flex items-center gap-1 font-body-sm text-primary hover:underline" href="?page=pending-motor-vehicles&tab=parts">
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Pending catalog
        </a>
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div>
            <h1 className="font-headline-xl text-headline-xl font-semibold tracking-tight text-on-surface">
              Research Settings & Health
            </h1>
            <p className="mt-0.5 max-w-4xl font-body-md text-body-md text-on-surface-variant">
              Configure autonomous catalog ingestion, throttling limits, trusted catalogues, and monitor cluster health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm font-mono-sm text-mono-sm text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high px-space-sm py-0.5 text-on-surface">
              ENGINE_REV: {data?.engineRev ?? CATALOG_RESEARCH_ENGINE_REV}
            </span>
            <span>·</span>
            <span>LATENCY: {data?.latencyMs != null ? `${data.latencyMs}ms` : "—"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter xl:grid-cols-12">
        <div className="xl:col-span-7 flex flex-col gap-gutter">
          <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex items-center justify-between bg-surface-container-low p-space-lg">
              <div className="flex items-center gap-space-md">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-container text-on-primary">
                  <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                </div>
                <div>
                  <p className="font-headline-md text-headline-md font-semibold text-on-surface">Research</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Autonomous crawl routines and intake throttles</p>
                </div>
              </div>
              <span className="rounded bg-surface-container px-space-sm py-0.5 font-label-xs uppercase tracking-wider text-on-surface-variant">
                STATE: {settings?.enabled ? (settings.paused ? "PAUSED" : "ACTIVE") : "OFF"}
              </span>
            </div>
            {settings?.paused && (settings as { paused_reason?: string | null }).paused_reason ? (
              <p className="border-t border-surface-container-high px-space-lg py-space-sm font-body-sm text-body-sm text-error">
                {(settings as { paused_reason?: string }).paused_reason}
              </p>
            ) : null}
            <div className="space-y-space-lg p-space-lg">
              <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-space-md">
                <div>
                  <p className="font-headline-md text-headline-md text-on-surface">Research is on</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Master switch for background catalog research.</p>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={Boolean(settings?.enabled)}
                  disabled={busy}
                  onChange={(e) => void patchSettings({ enabled: e.target.checked, paused: e.target.checked ? settings?.paused : false })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-space-md">
                <div>
                  <p className="font-headline-md text-headline-md text-on-surface">Shadow mode — send everything to review</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Streak {settings?.shadow_approve_streak ?? 0} / 20 consecutive approvals to graduate.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={Boolean(settings?.shadow_mode)}
                  disabled={busy}
                  onChange={(e) => void patchSettings({ shadow_mode: e.target.checked })}
                />
              </div>
              <div className="flex flex-col justify-between gap-space-md rounded-lg bg-surface-container-low p-space-md sm:flex-row sm:items-center">
                <div>
                  <p className="font-headline-md text-headline-md text-on-surface">Jobs per day</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Cluster capacity cap for background ingestion tasks</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-l-lg bg-surface-container-lowest"
                    disabled={busy}
                    onClick={() =>
                      void patchSettings({
                        daily_job_limit: Math.max(1, (settings?.daily_job_limit ?? 40) - 5),
                      })
                    }
                  >
                    −
                  </button>
                  <span className="min-w-[3rem] text-center font-mono-lg font-bold">{settings?.daily_job_limit ?? 40}</span>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-r-lg bg-surface-container-lowest"
                    disabled={busy}
                    onClick={() =>
                      void patchSettings({
                        daily_job_limit: Math.min(500, (settings?.daily_job_limit ?? 40) + 5),
                      })
                    }
                  >
                    +
                  </button>
                  <span className="font-mono-sm text-on-surface-variant">runs / 24h</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-space-sm">
                <button
                  type="button"
                  disabled={busy || !token}
                  className="h-9 rounded-xl bg-surface-container-low px-space-md font-body-sm"
                  onClick={() => token && void downloadCatalogResearchExportCsv(token)}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  disabled={busy || !token}
                  className="h-9 rounded-xl bg-surface-container-low px-space-md font-body-sm"
                  onClick={() => token && void reprocessQueuedJobs(token).then(() => load())}
                >
                  Reprocess all queued
                </button>
                <button
                  type="button"
                  disabled={busy || !settings?.enabled}
                  className="h-9 rounded-xl bg-primary-container px-space-md font-body-sm text-on-primary"
                  onClick={() => void patchSettings({ paused: !settings?.paused })}
                >
                  {settings?.paused ? "Resume Dispatcher" : "Pause Dispatcher"}
                </button>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex items-center justify-between bg-surface-container-low p-space-lg">
              <div className="flex items-center gap-space-md">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-container text-on-primary">
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                </div>
                <div>
                  <p className="font-headline-md text-headline-md font-semibold text-on-surface">Trusted catalogues</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Domain whitelist for verification</p>
                </div>
              </div>
              <span className="rounded bg-surface-container px-space-sm py-0.5 font-mono-sm text-label-xs text-on-surface-variant">
                {sources.filter((s) => s.active).length} DOMAINS ACTIVE
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="font-label-xs uppercase tracking-wider text-on-surface-variant">
                    <th className="px-space-lg py-2">Domain</th>
                    <th className="px-space-md py-2">Kind</th>
                    <th className="px-space-md py-2 text-right">Pages confirmed</th>
                    <th className="px-space-lg py-2 text-right">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <tr key={row.domain} className="border-t border-surface-container-high">
                      <td className="px-space-lg py-space-md font-mono-md font-semibold">{row.domain}</td>
                      <td className="px-space-md py-space-md font-mono-sm text-mono-sm">
                        {row.kind === "aftermarket_catalog" ? "Aftermarket catalogue" : "OEM catalogue"}
                      </td>
                      <td className="px-space-md py-space-md text-right font-mono-md">—</td>
                      <td className="px-space-lg py-space-md text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded px-2 font-label-xs font-semibold uppercase text-on-surface-variant hover:bg-surface-container"
                            disabled={busy || !token || !row.active}
                            aria-label={`remove ${row.domain}`}
                            onClick={() =>
                              token &&
                              void patchCatalogTrustedSource(token, row.domain, false).then(() => load())
                            }
                          >
                            <span className="material-symbols-outlined text-[16px]">remove</span>
                            remove
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded px-2 font-label-xs font-semibold uppercase text-on-surface-variant hover:bg-surface-container"
                            disabled={busy}
                            aria-label={`close ${row.domain}`}
                            onClick={() => setShowAddDomain(false)}
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                            close
                          </button>
                          <input
                            type="checkbox"
                            checked={row.active}
                            disabled={busy || !token}
                            onChange={(e) =>
                              token &&
                              void patchCatalogTrustedSource(token, row.domain, e.target.checked).then(() => load())
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-space-md bg-surface-container-low p-space-lg">
              {showAddDomain ? (
                <div className="grid grid-cols-1 gap-2 rounded-lg bg-surface-container-lowest p-space-md md:grid-cols-12">
                  <input
                    className="md:col-span-6 h-9 rounded bg-surface px-2 font-mono-sm"
                    placeholder="e.g. hondapartsnow.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  />
                  <select
                    className="md:col-span-4 h-9 rounded bg-surface px-2 font-body-sm"
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as "oem_catalog" | "aftermarket_catalog")}
                  >
                    <option value="oem_catalog">OEM catalogue</option>
                    <option value="aftermarket_catalog">Aftermarket catalogue</option>
                  </select>
                  <button
                    type="button"
                    className="md:col-span-2 h-9 rounded bg-primary-container text-on-primary font-label-xs font-semibold uppercase"
                    disabled={busy || !newDomain.trim() || !token}
                    onClick={() =>
                      token &&
                      void addCatalogTrustedSource(token, newDomain.trim(), newKind)
                        .then(() => {
                          setNewDomain("");
                          setShowAddDomain(false);
                          return load();
                        })
                        .catch((e) => toast.error(e instanceof Error ? e.message : "Could not add domain"))
                    }
                  >
                    Save
                  </button>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Only whitelist domains pass strict validators.</span>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded bg-surface-container-highest px-space-md font-label-xs font-semibold uppercase"
                  onClick={() => setShowAddDomain((v) => !v)}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add catalogue
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="xl:col-span-5 flex flex-col gap-gutter">
          <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex items-center justify-between bg-surface-container-low p-space-lg">
              <div>
                <p className="font-headline-md text-headline-md font-semibold text-on-surface">Health</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Live pipeline telemetry</p>
              </div>
              <span className={`rounded px-space-sm py-0.5 font-label-xs font-semibold ${statusClass}`}>
                STATUS: {status}
              </span>
            </div>
            <div className="space-y-space-lg p-space-lg">
              <div className="grid grid-cols-2 gap-space-sm">
                {[
                  { label: "Queue", value: strip?.queued ?? 0, sub: "jobs waiting" },
                  { label: "Working on", value: strip?.workingOn ?? 0, sub: "in flight" },
                  { label: "Needs review", value: strip?.needsReview ?? 0, sub: "awaiting you" },
                  { label: "Failed", value: strip?.failed ?? 0, sub: "last 24h window" },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-lg bg-surface-container-low p-space-md">
                    <span className="font-label-xs uppercase tracking-wider text-on-surface-variant">{tile.label}</span>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="font-mono-lg font-bold text-on-surface">{tile.value}</span>
                      <span className="font-mono-sm text-on-surface-variant">· {tile.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-space-sm">
                <span className="font-label-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Operational Events &amp; Notices
                </span>
                {notices.map((n) => (
                  <div
                    key={n.title}
                    className={`flex items-start gap-space-sm rounded-lg p-space-md ${n.tone === "warn" ? "bg-[#b45309]/10" : "bg-[#006e31]/10"}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{n.tone === "warn" ? "warning" : "check_circle"}</span>
                    <div>
                      <p className="font-body-sm font-semibold text-on-surface">{n.title}</p>
                      <p className="font-body-sm text-on-surface-variant">{n.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="bg-surface-container-low p-space-lg">
              <p className="font-headline-md text-headline-md font-semibold text-on-surface">Incident archive (24h)</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Failed or retried jobs with errors</p>
            </div>
            <div className="max-h-80 overflow-y-auto p-space-lg">
              {incidents.length === 0 ? (
                <p className="font-body-sm text-on-surface-variant">No incidents in the last 24 hours.</p>
              ) : (
                incidents.map((row) => (
                  <div key={row.id} className="mb-space-md rounded-lg border border-surface-variant p-space-md">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-sm text-mono-sm font-semibold">{row.id.slice(0, 8).toUpperCase()}</span>
                      <span className="font-mono-sm text-mono-sm text-on-surface-variant">{row.state}</span>
                    </div>
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{row.last_error || "Unknown error"}</p>
                    <button
                      type="button"
                      className="mt-2 h-8 rounded-lg bg-surface-container px-3 font-label-md font-semibold"
                      disabled={busy || !token}
                      onClick={() =>
                        token &&
                        void retryCatalogResearchJob(token, row.id)
                          .then(() => load())
                          .then(() => toast.success("Job requeued"))
                      }
                    >
                      Retry
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
