/**
 * S2 Pending catalog → Vehicles — Stitch screens 6 (list), 7 (vehicle proposal drawer) and 8 (Research this model).
 * Rows are vehicle research jobs: a new version a fleet needs, a car's identity (frame code), or every version of a
 * model. Approve writes vehicle_catalog through approve_vehicle_proposal; nothing is overwritten until confirmed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import {
  researchApi,
  type ResearchCar,
  type ResearchJobDetail,
  type ResearchJobListItem,
  type VehicleProposal,
} from "../../../services/researchEngineService";
import { fetchVehicleCatalogBriefs, type VehicleCatalogBrief } from "../../../services/pendingPartsCatalogService";
import {
  D_CARD,
  D_MONO,
  D_MUTED,
  D_TXT,
  DIcon,
  PartsButton,
  RE_SOFT,
  ReCode,
  ReDrawer,
  ReError,
  RePill,
  ReReasonDialog,
  ReSavedText,
  ReSkeleton,
  ReStatePill,
  ReToast,
} from "./ReKit";
import { carCodes, carLabel, readOnLabel, statePill, yearsLabel } from "./researchModel";

type VFilter = "all" | "needs_review" | "researching" | "waiting" | "added" | "not_found";
const V_FILTERS: Array<{ id: VFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs review" },
  { id: "researching", label: "Researching" },
  { id: "waiting", label: "Waiting its turn" },
  { id: "added", label: "Added" },
  { id: "not_found", label: "Couldn't find" },
];

function vFilter(state: string): Exclude<VFilter, "all"> {
  if (state === "needs_review") return "needs_review";
  if (state === "researching" || state === "checking") return "researching";
  if (state === "added" || state === "auto_added") return "added";
  if (state === "not_found" || state === "failed") return "not_found";
  return "waiting";
}

/** "Toyota Roomy 2020 on · 2WD" — from the car, the first proposal, or the job's subject. */
export function vehicleRowTitle(j: Pick<ResearchJobListItem, "jobType" | "car" | "subject" | "vehicleProposals">): string {
  if (j.jobType === "vehicle_model" && j.subject) return `${j.subject.make} ${j.subject.model} — every version`;
  if (j.car) {
    return [`${j.car.make} ${j.car.model} ${yearsLabel(j.car.production_start_year, j.car.production_end_year)}`.trim(), j.car.drivetrain]
      .filter(Boolean)
      .join(" · ");
  }
  const p = j.vehicleProposals?.[0];
  if (p) {
    return [`${p.make} ${p.model} ${yearsLabel(p.production_start_year, p.production_end_year)}`.trim(), p.drivetrain].filter(Boolean).join(" · ");
  }
  if (j.subject) return [j.subject.make, j.subject.model, j.subject.year].filter(Boolean).join(" ");
  return "Car version";
}

export function vehicleRowKind(j: Pick<ResearchJobListItem, "jobType" | "vehicleProposals">): string | null {
  if (j.jobType === "vehicle_model") return "Every version";
  if (j.jobType === "vehicle_identity") return (j.vehicleProposals?.length ?? 0) > 0 ? "Identity filled" : null;
  return "New version";
}

export function ResearchVehiclesTab({ onCount }: { onCount?: (n: number) => void }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [jobs, setJobs] = useState<ResearchJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VFilter>("all");
  const [market, setMarket] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openJob, setOpenJob] = useState<ResearchJobListItem | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const PAGE = 25;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setJobs(await researchApi.jobs(token, ["vehicle", "vehicle_identity", "vehicle_model"]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onCount?.(jobs.filter((j) => j.state === "needs_review").length);
  }, [jobs, onCount]);

  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) for (const p of j.vehicleProposals ?? []) if (p && (p as { market?: string | null }).market) set.add(String((p as { market?: string }).market));
    return [...set].sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter !== "all" && vFilter(j.state) !== filter) return false;
      if (market !== "all" && !(j.vehicleProposals ?? []).some((p) => (p as { market?: string | null }).market === market)) return false;
      if (!needle) return true;
      return `${vehicleRowTitle(j)} ${carCodes(j.car)} ${(j.vehicleProposals ?? []).map((p) => `${p.chassis_code ?? ""} ${p.grade ?? ""}`).join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [jobs, filter, market, query]);

  useEffect(() => setPage(0), [filter, market, query]);
  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));

  if (openJob && openJob.jobType === "vehicle_model") {
    return (
      <ModelReview
        token={token}
        job={openJob}
        onBack={() => {
          setOpenJob(null);
          void load();
        }}
      />
    );
  }

  if (loading && jobs.length === 0) return <ReSkeleton rows={4} />;
  if (error && jobs.length === 0) return <ReError title="Couldn't load the queue" message={error} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col gap-6" data-testid="research-vehicles-tab">
      {toastMsg ? <ReToast onClose={() => setToastMsg(null)}>{toastMsg}</ReToast> : null}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {V_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`vfilter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-[#0153dc] text-white shadow-sm"
                  : "border border-[#c5c6d0] bg-white text-[#434655] hover:bg-[#ededf9] dark:border-[#334155] dark:bg-[#111a2e] dark:text-[#94a3b8]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex w-64 items-center">
            <DIcon name="search" className={`absolute left-3 text-[18px] ${D_MUTED}`} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search car or version"
              className="h-10 w-full rounded-lg border border-[#c5c6d0] bg-white pl-9 pr-3 text-[13px] text-[#30323b] shadow-sm outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#111a2e] dark:text-[#e2e8f0]"
            />
          </div>
          <label className="parts-btn parts-btn--secondary !min-h-[40px] cursor-pointer gap-2">
            <DIcon name="public" className="text-[16px]" />
            <span>Market:</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="cursor-pointer bg-transparent text-[12px] font-medium outline-none"
              data-testid="market-filter"
            >
              <option value="all">All</option>
              {markets.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={`${D_CARD} flex flex-col overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={`bg-[#f3f3ff] text-[12px] font-medium uppercase tracking-wider dark:bg-[#0b1220] ${D_MUTED}`}>
                <th className="px-6 py-3.5">Vehicle</th>
                <th className="px-4 py-3.5">Kind</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Next action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`px-6 py-12 text-center text-[13px] ${D_MUTED}`}>
                    Nothing here.
                  </td>
                </tr>
              ) : (
                pageRows.map((j) => {
                  const p = j.vehicleProposals?.[0];
                  const codes = j.car ? carCodes(j.car) : [p?.chassis_code, p?.grade].filter(Boolean).join(" · ");
                  const title = vehicleRowTitle(j);
                  const kind = vehicleRowKind(j);
                  return (
                    <tr
                      key={j.jobId}
                      data-testid="vehicles-row"
                      onClick={() => setOpenJob(j)}
                      className="cursor-pointer border-t border-[#e6e7ee] transition-colors hover:bg-[#f3f3ff] dark:border-[#1e293b] dark:hover:bg-[#0b1220]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ededf9] text-[16px] font-semibold text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]">
                            {(title[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className={`truncate text-[14px] font-medium ${D_TXT}`}>{title}</span>
                            {codes ? <span className={`text-[13px] ${D_MONO} ${D_MUTED}`}>{codes}</span> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {kind ? <span className={`text-[13px] ${D_MUTED}`}>{kind}</span> : <span className={D_MUTED}>—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <ReStatePill pill={statePill(j.state)} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <PartsButton
                          variant={j.state === "needs_review" ? "primary" : "icon"}
                          aria-label="Open"
                          className={j.state === "needs_review" ? "!min-h-[32px]" : ""}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenJob(j);
                          }}
                        >
                          {j.state === "needs_review" ? "Review" : <DIcon name="chevron_right" className="text-[18px]" />}
                        </PartsButton>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between bg-[#f3f3ff]/60 px-6 py-3 dark:bg-[#0b1220]">
          <span className={`text-[12px] ${D_MUTED}`}>
            Showing {pageRows.length} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <PartsButton variant="secondary" className="!min-h-[28px] !px-2.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </PartsButton>
            <PartsButton variant="secondary" className="!min-h-[28px] !px-2.5" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </PartsButton>
          </div>
        </div>
      </div>

      {openJob && openJob.jobType !== "vehicle_model" ? (
        <VehicleProposalDrawer
          token={token}
          job={openJob}
          onClose={() => setOpenJob(null)}
          onChanged={(msg) => {
            setToastMsg(msg);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Screen 7

const FACTS: Array<{ key: keyof VehicleProposal | "years" | "range"; label: string; mono?: boolean }> = [
  { key: "chassis_code", label: "Frame code", mono: true },
  { key: "range", label: "Frame range", mono: true },
  { key: "years", label: "Years" },
  { key: "engine_code", label: "Engine", mono: true },
  { key: "drivetrain", label: "Drivetrain" },
  { key: "transmission", label: "Gearbox" },
  { key: "grade", label: "Grade" },
];

export function factValue(p: VehicleProposal, key: (typeof FACTS)[number]["key"]): string | null {
  if (key === "years") return yearsLabel(p.production_start_year, p.production_end_year) || null;
  if (key === "range") return p.chassis_serial_from || p.chassis_serial_to ? `${p.chassis_serial_from ?? ""} ~ ${p.chassis_serial_to ?? ""}`.trim() : null;
  const v = p[key];
  return v == null || String(v).trim() === "" ? null : String(v);
}

function actionPill(action: string | null | undefined) {
  if (action === "update") return <RePill tone="blue" icon="upgrade">Update</RePill>;
  if (action === "same") return <RePill tone="grey" icon="check">Same</RePill>;
  return <RePill tone="blue">New version</RePill>;
}

function VehicleProposalDrawer({
  token,
  job,
  onClose,
  onChanged,
}: {
  token: string;
  job: ResearchJobListItem;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [detail, setDetail] = useState<ResearchJobDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<VehicleProposal | null>(null);
  const [showText, setShowText] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await researchApi.job(token, job.jobId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load this car");
    }
  }, [token, job.jobId]);
  useEffect(() => {
    void load();
  }, [load]);

  const proposals = (detail?.vehicleProposals ?? []).filter((p) => p.status !== "rejected");
  const p = proposals.find((x) => x.status === "open") ?? proposals[0] ?? null;
  const title = p
    ? [`${p.make} ${p.model} ${yearsLabel(p.production_start_year, p.production_end_year)}`.trim(), p.drivetrain].filter(Boolean).join(" · ")
    : vehicleRowTitle(job);
  const kept = (p?.sources ?? []).filter((s) => !s.dropped && s.block);
  const firstRead = kept[0]?.readId ? detail?.reads.find((r) => r.id === kept[0].readId)?.read_at : undefined;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      onChanged(msg);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f3ff] text-[#0153dc] shadow-sm dark:bg-[#0b1220]">
          <DIcon name="directions_car" filled className="text-[20px]" />
        </div>
        <ReStatePill pill={statePill(job.state)} />
        {p ? actionPill(p.action) : null}
      </div>
      <h2 className={`text-[22px] font-semibold leading-tight tracking-tight ${D_TXT}`} data-testid="vehicle-drawer-title">
        {title}
      </h2>
      {p?.market ? <p className={`text-[13px] ${D_MUTED}`}>Market: {p.market}</p> : null}
    </div>
  );

  const footer =
    p && p.status === "open" ? (
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <PartsButton
            variant="primary"
            className="!min-h-[40px] flex-1"
            disabled={busy || p.action === "same"}
            data-testid="approve-vehicle"
            onClick={() => void run(() => researchApi.approveVehicle(token, p.id), `Added ${title} to Vehicles`)}
          >
            <DIcon name="done_all" className="text-[18px]" /> Approve — add this car
          </PartsButton>
          <PartsButton variant="secondary" className="!min-h-[40px]" disabled={busy} onClick={() => void run(() => researchApi.retry(token, job.jobId), `${title} is back in the queue`)}>
            <DIcon name="refresh" className="text-[18px]" /> Research again
          </PartsButton>
        </div>
        <div className="flex items-center justify-between pt-1">
          <PartsButton variant="danger" disabled={busy} onClick={() => setRejecting(p)} data-testid="reject-vehicle">
            <DIcon name="close" className="text-[16px]" /> Reject proposal…
          </PartsButton>
          <PartsButton variant="danger" disabled={busy} onClick={() => void run(() => researchApi.notFound(token, job.jobId), `${title} marked Couldn't find`)}>
            <DIcon name="search_off" className="text-[16px]" /> Couldn&apos;t find it
          </PartsButton>
        </div>
      </div>
    ) : job.state === "not_found" || job.state === "failed" ? (
      <PartsButton variant="secondary" disabled={busy} onClick={() => void run(() => researchApi.retry(token, job.jobId), `${title} is back in the queue`)}>
        <DIcon name="refresh" className="text-[16px]" /> Research again
      </PartsButton>
    ) : undefined;

  return (
    <>
      <ReDrawer open onClose={onClose} header={header} footer={footer} testId="vehicle-proposal-drawer">
        {!detail ? <ReSkeleton rows={3} /> : null}
        {detail && !p ? (
          <div className={`${D_CARD} p-5 text-[14px] ${D_MUTED}`}>Roam hasn&apos;t found this car&apos;s versions yet.</div>
        ) : null}
        {p ? (
          <>
            <div
              className={`flex items-start gap-2 rounded-xl p-4 ${
                p.action === "new" ? "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]" : "bg-[#dbe1ff] text-[#00174b] dark:bg-[#1e3a8a]/40 dark:text-[#dbe1ff]"
              }`}
              data-testid="duplicate-check"
            >
              <DIcon name={p.action === "new" ? "check_circle" : "info"} filled className="mt-0.5 text-[20px]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[16px] font-semibold">
                  {p.action === "new" ? "Duplicate check passed" : p.action === "update" ? "Matches a car on file" : "Already on file"}
                </span>
                <p className="text-[13px] leading-snug">
                  {p.action === "new"
                    ? "No car on file has this frame code, engine and years."
                    : p.action === "update"
                      ? "Approving fills the facts that car is missing. Nothing is overwritten."
                      : "Every fact matches the car on file. Nothing to add."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={`text-[16px] font-semibold tracking-tight ${D_TXT}`}>Vehicle identity</span>
              <div className="grid grid-cols-2 gap-2" data-testid="fact-grid">
                {FACTS.map((f) => {
                  const v = factValue(p, f.key);
                  return (
                    <div key={f.label} className={`flex flex-col gap-1 rounded-lg px-2.5 py-1.5 ${RE_SOFT}`}>
                      <span className={`text-[12px] font-medium ${D_MUTED}`}>{f.label}</span>
                      <div className="flex items-center justify-between gap-2">
                        {v ? (
                          f.mono ? <ReCode strong>{v}</ReCode> : <span className={`text-[14px] font-medium ${D_TXT}`}>{v}</span>
                        ) : (
                          <span className={`text-[13px] italic ${D_MUTED}`}>Not on file</span>
                        )}
                        {v ? (
                          kept.length ? <RePill tone="green" icon="check">Confirmed</RePill> : <RePill tone="amber">Needs checking</RePill>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`flex flex-col gap-2 rounded-xl p-3 ${RE_SOFT}`} data-testid="vehicle-source-row">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className={`text-[13px] font-semibold ${D_TXT}`}>{kept[0]?.domain ?? "No catalogue page saved"}</span>
                  {firstRead ? <span className={`text-[12px] ${D_MUTED}`}>{readOnLabel(firstRead)}</span> : null}
                </div>
                {kept.length ? (
                  <PartsButton variant="secondary" className="!min-h-[28px]" onClick={() => setShowText((v) => !v)}>
                    <DIcon name="description" className="text-[14px]" /> Saved text
                  </PartsButton>
                ) : null}
              </div>
              {showText && kept.length ? (
                <ReSavedText title="Saved page text" text={kept.map((s) => s.block).join("\n\n")} onHide={() => setShowText(false)} />
              ) : null}
            </div>
          </>
        ) : null}
      </ReDrawer>
      <ReReasonDialog
        open={Boolean(rejecting)}
        busy={busy}
        onCancel={() => setRejecting(null)}
        onReject={(reason) => {
          const r = rejecting;
          setRejecting(null);
          if (r) void run(() => researchApi.rejectVehicle(token, r.id, reason), `Proposal for ${title} rejected`);
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------ Screen 8

export function changedFields(p: VehicleProposal, onFile: VehicleCatalogBrief | ResearchCar | null | undefined): string[] {
  const out: string[] = [];
  if (p.chassis_serial_from || p.chassis_serial_to) out.push("Frame range added");
  if (!onFile) return out;
  const blank = (v: unknown) => v == null || String(v).trim() === "";
  if (blank(onFile.drivetrain) && !blank(p.drivetrain)) out.push("Drivetrain added");
  if (blank(onFile.transmission) && !blank(p.transmission)) out.push("Gearbox added");
  if (blank(onFile.engine_code) && !blank(p.engine_code)) out.push("Engine added");
  if (blank(onFile.chassis_code) && !blank(p.chassis_code)) out.push("Frame code added");
  return out;
}

function ModelReview({ token, job, onBack }: { token: string; job: ResearchJobListItem; onBack: () => void }) {
  const [detail, setDetail] = useState<ResearchJobDetail | null>(null);
  const [onFile, setOnFile] = useState<Map<string, VehicleCatalogBrief>>(new Map());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<VehicleProposal | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await researchApi.job(token, job.jobId);
      setDetail(d);
      const ids = d.vehicleProposals.map((p) => p.existing_vehicle_catalog_id).filter(Boolean) as string[];
      setOnFile(ids.length ? await fetchVehicleCatalogBriefs(token, ids) : new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load this model");
    }
  }, [token, job.jobId]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = (detail?.vehicleProposals ?? []).filter((p) => p.status !== "rejected");
  const newOpen = rows.filter((p) => p.action === "new" && p.status === "open");
  const counts = { same: rows.filter((p) => p.action === "same").length, update: rows.filter((p) => p.action === "update").length, new: rows.filter((p) => p.action === "new").length };
  const name = job.subject ? `${job.subject.make} ${job.subject.model}` : "This model";

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      setToastMsg(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="model-review">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0153dc] shadow-sm dark:bg-[#111a2e]">
            <DIcon name="directions_car" className="text-[28px]" />
          </div>
          <div className="flex flex-col">
            <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>{name} — every version</h1>
            <p className={`mt-0.5 text-[14px] ${D_MUTED}`}>
              Roam found <span className={`font-semibold ${D_TXT}`}>{rows.length} {rows.length === 1 ? "version" : "versions"}</span>.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <PartsButton variant="secondary" className="!min-h-[40px]" onClick={onBack} data-testid="back-to-vehicles">
            <DIcon name="arrow_back" className="text-[16px]" /> Back to Vehicles
          </PartsButton>
          <PartsButton
            variant="primary"
            className="!min-h-[40px]"
            disabled={busy || newOpen.length === 0}
            data-testid="approve-all-new"
            onClick={() =>
              void run(async () => {
                for (const p of newOpen) await researchApi.approveVehicle(token, p.id);
              }, `Added ${newOpen.length} new ${newOpen.length === 1 ? "version" : "versions"} of ${name} to Vehicles`)
            }
          >
            <DIcon name="done_all" className="text-[18px]" /> Approve all new ({newOpen.length})
          </PartsButton>
        </div>
      </div>

      {toastMsg ? <ReToast onClose={() => setToastMsg(null)}>{toastMsg}</ReToast> : null}

      <div className={`${D_CARD} flex flex-col overflow-hidden`}>
        <div className="flex flex-col justify-between gap-2 bg-[#f3f3ff] px-6 py-4 sm:flex-row sm:items-center dark:bg-[#0b1220]">
          <span className={`text-[16px] font-semibold ${D_TXT}`}>Versions</span>
          <div className={`flex items-center gap-3 text-[12px] font-medium ${D_MUTED}`} data-testid="model-summary">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#94a3b8]" /> {counts.same} Unchanged
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#0153dc]" /> {counts.update} Update
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#006e31]" /> {counts.new} New
            </span>
          </div>
        </div>
        {!detail ? (
          <div className="p-4">
            <ReSkeleton rows={3} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className={`text-[12px] font-semibold uppercase tracking-wider ${D_MUTED}`}>
                  <th className="px-6 py-3">Version</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const existing = p.existing_vehicle_catalog_id ? onFile.get(p.existing_vehicle_catalog_id) : null;
                  const changes = p.action === "update" ? changedFields(p, existing) : [];
                  return (
                    <tr key={p.id} className="border-t border-[#e6e7ee] align-top dark:border-[#1e293b]" data-testid="model-row">
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[16px] font-semibold ${D_TXT}`}>{yearsLabel(p.production_start_year, p.production_end_year) || "Years not found"}</span>
                          {p.drivetrain ? <ReCode>{p.drivetrain}</ReCode> : null}
                          {p.chassis_code ? <ReCode>{p.chassis_code}</ReCode> : null}
                        </div>
                        {p.engine_code ? (
                          <div className={`mt-1 flex items-center gap-2 ${D_MUTED}`}>
                            <span className="text-[12px]">Engine:</span>
                            <span className={`text-[13px] font-semibold ${D_MONO} ${D_TXT}`}>{p.engine_code}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">{actionPill(p.action)}</td>
                      <td className="px-4 py-4">
                        {p.action === "same" ? (
                          <span className={`text-[14px] ${D_TXT}`}>Matches the car on file</span>
                        ) : p.action === "update" ? (
                          <div className="flex flex-col gap-1" data-testid="model-row-changes">
                            {(changes.length ? changes : ["Facts the car on file is missing"]).map((c) => (
                              <span key={c} className="flex items-center gap-1 text-[13px] font-semibold text-[#0153dc] dark:text-[#93b4ff]">
                                <DIcon name="add_circle" className="text-[16px]" /> {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={`text-[14px] font-medium ${D_TXT}`}>{[p.transmission, p.grade].filter(Boolean).join(" · ") || "—"}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {p.status === "promoted" ? (
                          <RePill tone="green" icon="check">Added</RePill>
                        ) : p.action === "same" ? (
                          <span className={`rounded bg-[#f3f3ff] px-2 py-1 text-[12px] dark:bg-[#0b1220] ${D_MUTED}`}>Already on file</span>
                        ) : p.status === "open" ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <PartsButton
                              variant="secondary"
                              disabled={busy}
                              data-testid="model-row-approve"
                              onClick={() => void run(() => researchApi.approveVehicle(token, p.id), `Added ${name} ${yearsLabel(p.production_start_year, p.production_end_year)} to Vehicles`)}
                            >
                              <DIcon name="done" className="text-[16px] text-[#0153dc]" /> Approve
                            </PartsButton>
                            <PartsButton variant="danger" disabled={busy} data-testid="model-row-reject" onClick={() => setRejecting(p)}>
                              <DIcon name="close" className="text-[16px]" /> Reject
                            </PartsButton>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className={`text-center text-[13px] ${D_MUTED}`}>Nothing is overwritten until confirmed.</p>
      <ReReasonDialog
        open={Boolean(rejecting)}
        busy={busy}
        onCancel={() => setRejecting(null)}
        onReject={(reason) => {
          const r = rejecting;
          setRejecting(null);
          if (r) void run(() => researchApi.rejectVehicle(token, r.id, reason), "Version rejected");
        }}
      />
    </div>
  );
}

export { carLabel };
