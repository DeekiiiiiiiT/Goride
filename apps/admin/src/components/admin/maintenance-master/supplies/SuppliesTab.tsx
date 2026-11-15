/**
 * Service items — Supplies tab (Active + Retired views).
 * Look: Stitch screens 5 (supplies_tab) + 8 (retired_supplies_and_restore).
 * Content: audit 9c (Drop "Live sync…", version tag, Filter, "Showing 7 of 12", "Auto-replenishment", "⋯" menu,
 * pagination, the bottom cards, "Sort: Last modified", "Archival policies"; Add "N supplies").
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchJobs, fetchSupplies, restoreSupply, type Job, type JobsPayload, type Supply } from "../jobs/jobsApi";
import { jobsUsingSupply, matchesQuery, supplyCounts } from "../jobs/mayNeedModel";
import { T, supplyIcon } from "../jobs/serviceItemsUi";
import { JobDrawer } from "../jobs/JobDrawer";
import { SupplyDrawer } from "./SupplyDrawer";

type Props = { token: string; canWrite: boolean; onCountsChanged?: () => void };

export function SuppliesTab({ token, canWrite, onCountsChanged }: Props) {
  const [data, setData] = useState<JobsPayload | null>(null);
  const [rows, setRows] = useState<Supply[] | null>(null);
  const [view, setView] = useState<"active" | "retired">("active");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<{ supply: Supply | null } | null>(null);
  const [jobOpen, setJobOpen] = useState<Job | null>(null);
  const [clash, setClash] = useState<{ id: string; message: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [payload, list] = await Promise.all([fetchJobs(token), fetchSupplies(token, view)]);
      setData(payload);
      setRows(list.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load supplies.");
    }
  }, [token, view]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const counts = useMemo(() => supplyCounts(data?.supplies ?? []), [data]);
  const filtered = useMemo(
    () => (rows ?? []).filter((s) => matchesQuery(query, s.name, s.code, s.description)),
    [rows, query],
  );

  const refresh = () => {
    void load();
    onCountsChanged?.();
  };

  const restore = async (s: Supply) => {
    setRestoring(s.id);
    setClash(null);
    try {
      await restoreSupply(token, s.id);
      toast.success(`${s.name} restored`);
      refresh();
    } catch (e: unknown) {
      setClash({ id: s.id, message: e instanceof Error ? e.message : "Couldn't restore this supply." });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="mt-6 space-y-6" data-testid="supplies-tab">
      <div className="flex justify-end">
        <span className={`inline-flex items-center gap-2 rounded-full bg-[#ffffff] px-3 py-1 ${T.labelSm} text-[#565e74] shadow-sm`}>
          Active catalog: <b className="font-semibold text-[#161b27]">{counts.active}</b>
          <span className="text-[#c3c6d7]">|</span>
          <span className="material-symbols-outlined text-[14px]">archive</span>
          Archive: <b className="font-semibold text-[#161b27]">{counts.retired}</b>
        </span>
      </div>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#737686]">search</span>
            <input
              type="search"
              aria-label="Search supplies"
              placeholder="Search supplies…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`h-10 w-full rounded-xl bg-[#ffffff] pl-10 pr-3 ${T.bodySm} text-[#161b27] shadow-sm placeholder:text-[#737686] focus:outline-none focus:ring-2 focus:ring-[#0153dc]`}
            />
          </div>
          <div className="inline-flex items-center rounded-xl bg-[#f1f3ff] p-1 shadow-sm" role="group" aria-label="Show">
            <button
              type="button"
              aria-pressed={view === "active"}
              onClick={() => setView("active")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${T.labelMd} transition-all ${
                view === "active" ? "bg-[#ffffff] text-[#161b27] shadow-sm" : "text-[#565e74] hover:text-[#161b27]"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span>Active</span>
              <span className="ml-0.5 text-[11px] font-normal text-[#565e74]">{counts.active}</span>
            </button>
            <button
              type="button"
              aria-pressed={view === "retired"}
              onClick={() => setView("retired")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${T.labelMd} transition-all ${
                view === "retired" ? "bg-[#ffffff] text-[#161b27] shadow-sm" : "text-[#565e74] hover:text-[#161b27]"
              }`}
            >
              <span className="material-symbols-outlined text-[16px] text-[#737686]">archive</span>
              <span>Retired</span>
              <span className="ml-0.5 text-[11px] font-normal text-[#737686]">{counts.retired}</span>
            </button>
          </div>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setDrawer({ supply: null })}
            disabled={!data}
            className={`inline-flex h-10 items-center justify-center gap-1.5 self-end rounded-xl bg-[#0153dc] px-4 ${T.labelMd} font-semibold text-white shadow-md shadow-[#0153dc]/20 hover:brightness-105 disabled:opacity-40 sm:self-auto`}
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>Add supply</span>
          </button>
        ) : null}
      </div>

      <div className="w-full space-y-4 rounded-2xl bg-[#ffffff] p-6 shadow-xl shadow-[#0f172a]/5">
        <div className="flex items-center justify-between pb-2">
          <div className="flex flex-col">
            <span className={`${T.headlineMd} text-[#161b27]`}>{view === "active" ? "Standard consumables" : "Retired supplies"}</span>
            <span className={`${T.labelSm} text-[#565e74]`}>
              {rows == null ? "…" : `${filtered.length} ${filtered.length === 1 ? "supply" : "supplies"}`}
            </span>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-[10px] border border-[#fee2e2] bg-[#fef2f2] p-3.5">
            <span className={`${T.bodySm} font-medium text-[#991b1b]`}>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className={`h-9 rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3.5 ${T.labelMd} text-[#161b27] hover:bg-[#f8fafc]`}
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e9edfe] text-[11px] font-semibold uppercase tracking-wider text-[#565e74]">
                <th scope="col" className="px-4 py-3 pl-3">
                  Supply
                </th>
                <th scope="col" className="px-4 py-3">
                  Unit
                </th>
                <th scope="col" className="px-4 py-3">
                  Used on
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 pr-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#e9edfe] ${T.bodyMd} text-[#161b27]`}>
              {rows == null && !error
                ? [0, 1, 2].map((i) => (
                    <tr key={i} aria-busy="true">
                      <td colSpan={5} className="px-3 py-3.5">
                        <div className="h-10 animate-pulse rounded-xl bg-[#f1f3ff]" />
                      </td>
                    </tr>
                  ))
                : null}
              {rows != null && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`px-3 py-8 text-center ${T.bodySm} text-[#565e74]`}>
                    {query ? `No supply matches “${query}”.` : view === "active" ? "No supplies yet." : "No retired supplies."}
                  </td>
                </tr>
              ) : null}
              {filtered.map((s) => {
                const jobs = data ? jobsUsingSupply(data, s.id) : [];
                const isRetired = s.status === "retired";
                return (
                  <SupplyRow
                    key={s.id}
                    supply={s}
                    jobs={jobs}
                    retired={isRetired}
                    canWrite={canWrite}
                    restoring={restoring === s.id}
                    clash={clash?.id === s.id ? clash.message : null}
                    onDismissClash={() => setClash(null)}
                    onEdit={() => setDrawer({ supply: s })}
                    onRestore={() => void restore(s)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {view === "retired" && rows != null ? (
          <div className="flex items-center gap-2 border-t border-[#e2e8f0] bg-[#f1f3ff]/50 px-6 py-4">
            <span className="material-symbols-outlined text-[17px] text-[#94a3b8]">info</span>
            <span className={`${T.labelSm} text-[#565e74]`}>
              Showing {filtered.length} retired {filtered.length === 1 ? "supply" : "supplies"}. Retired supplies remain preserved in historical
              job logs.
            </span>
          </div>
        ) : null}
      </div>

      {drawer && data ? (
        <SupplyDrawer
          token={token}
          data={data}
          supply={drawer.supply}
          canWrite={canWrite}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            refresh();
          }}
          onRetired={(s, hidden) => {
            setDrawer(null);
            toast.success(
              hidden > 0
                ? `${s.name} retired — hidden from May need on ${hidden} job${hidden === 1 ? "" : "s"}`
                : `${s.name} retired`,
            );
            refresh();
          }}
          onOpenJob={(job) => {
            setDrawer(null);
            setJobOpen(job);
          }}
        />
      ) : null}

      {jobOpen && data ? (
        <JobDrawer
          token={token}
          data={data}
          mode="edit"
          job={jobOpen}
          canWrite={canWrite}
          onClose={() => setJobOpen(null)}
          onSaved={() => {
            setJobOpen(null);
            refresh();
          }}
          onOpenJob={(job) => setJobOpen(job)}
        />
      ) : null}
    </div>
  );
}

function SupplyRow({
  supply: s,
  jobs,
  retired,
  canWrite,
  restoring,
  clash,
  onDismissClash,
  onEdit,
  onRestore,
}: {
  supply: Supply;
  jobs: Job[];
  retired: boolean;
  canWrite: boolean;
  restoring: boolean;
  clash: string | null;
  onDismissClash: () => void;
  onEdit: () => void;
  onRestore: () => void;
}) {
  return (
    <>
      <tr className="group transition-colors duration-150 hover:bg-[#f1f3ff]" data-testid={`supply-row-${s.code}`}>
        <td className="px-4 py-3.5 pl-3">
          <div className="flex items-center gap-3.5">
            <div
              className={
                retired
                  ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#64748b]"
                  : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dae2fd]/40 text-[#0153dc] transition-colors group-hover:bg-[#0153dc] group-hover:text-white"
              }
            >
              <span className="material-symbols-outlined text-[20px]">{supplyIcon(s.iconKey)}</span>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={`truncate ${T.bodyLg} font-semibold text-[#161b27]`}>{s.name}</span>
              <span className={`${T.labelSm} tracking-normal text-[#565e74]`}>{s.code}</span>
            </div>
          </div>
        </td>
        <td className={`px-4 py-3.5 ${T.labelMd} text-[#565e74]`}>{s.unitCode}</td>
        <td className="px-4 py-3.5">
          {retired ? (
            <span className={`flex items-center gap-1.5 ${T.bodySm} text-[#161b27]`}>
              <span className="material-symbols-outlined text-[16px] text-[#94a3b8]">task_alt</span>
              <span>
                On {jobs.length} job{jobs.length === 1 ? "" : "s"}{" "}
                {jobs.length ? <span className="text-[#565e74]">({jobs.map((j) => j.name).join(", ")})</span> : null}
              </span>
            </span>
          ) : jobs.length > 0 ? (
            <button
              type="button"
              onClick={onEdit}
              title={jobs.map((j) => j.name).join(", ")}
              className={`inline-flex items-center gap-1.5 rounded-full bg-[#e9edfe] px-2.5 py-1 ${T.labelSm} text-[#003ea9] transition-colors hover:bg-[#dae2fd]`}
            >
              <span className="material-symbols-outlined text-[14px]">link</span>
              <span>
                On {jobs.length} job{jobs.length === 1 ? "" : "s"}
              </span>
            </button>
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-[#f1f3ff] px-2.5 py-1 ${T.labelSm} text-[#737686]`}>
              <span className="material-symbols-outlined text-[14px]">link_off</span>
              Not on any job
            </span>
          )}
        </td>
        <td className="px-4 py-3.5">
          {retired ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-1 ${T.labelSm} text-[#475569]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]" />
              Retired
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 ${T.labelSm} text-[#047857]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              <span>Active</span>
            </span>
          )}
        </td>
        <td className="px-4 py-3.5 pr-3 text-right">
          <div className="inline-flex items-center justify-end gap-1">
            {retired ? (
              canWrite ? (
                <button
                  type="button"
                  onClick={onRestore}
                  disabled={restoring}
                  aria-label={`Restore ${s.name}`}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[#e2e8f0] bg-[#ffffff] px-3.5 ${T.labelMd} text-[#161b27] transition-all hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:opacity-40`}
                >
                  <span className="material-symbols-outlined text-[16px] text-[#003ea9]">history</span>
                  <span>{restoring ? "Restoring…" : "Restore"}</span>
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`${canWrite ? "Edit" : "View"} ${s.name}`}
                className={`h-8 rounded-lg bg-[#ffffff] px-3 ${T.labelMd} text-[#161b27] shadow-sm transition-all hover:bg-[#e9edfe]`}
              >
                {canWrite ? "Edit" : "View"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {clash ? (
        <tr>
          <td colSpan={5} className="px-2 py-2">
            <div role="alert" className="flex items-center justify-between gap-3 rounded-[10px] border border-[#fee2e2] bg-[#fef2f2] p-3.5">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined shrink-0 text-[20px] text-[#dc2626]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  error
                </span>
                <span className={`${T.bodySm} font-medium text-[#991b1b]`}>{clash}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss notice"
                onClick={onDismissClash}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#94a3b8] transition-colors hover:bg-[#fee2e2]/60 hover:text-[#475569]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
