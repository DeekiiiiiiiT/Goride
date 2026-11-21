/**
 * S1 Pending catalog → Parts — Stitch screens 1 (list), 5 (all caught up) and 17 (states).
 * Rows are research jobs for parts and specs, plus fleet requests that have no research job (answered by hand).
 * Never shows who asked, when, or how many (RE-23).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import {
  researchApi,
  type ResearchJobListItem,
  type ResearchSummary,
} from "../../../services/researchEngineService";
import {
  fetchPartsBrowseNameMap,
  fetchVehicleCatalogBriefs,
  formatPartLabel,
  formatPartRequestExtras,
  formatVehicleHeadline,
  listPendingPartsQueue,
  type PendingPartsQueueGroup,
  type VehicleCatalogBrief,
} from "../../../services/pendingPartsCatalogService";
import { ResearchJobDrawer, type DrawerOutcome } from "./ResearchJobDrawer";
import {
  D_CARD,
  D_MONO,
  D_MUTED,
  D_TXT,
  DIcon,
  PartsButton,
  ReCode,
  ReError,
  RePaused,
  ReSkeleton,
  ReStatePill,
  ReToast,
  pauseReasonText,
} from "./ReKit";
import {
  PARTS_FILTERS,
  carCodes,
  carLabel,
  filterForState,
  jobItemName,
  placeLabel,
  siteName,
  statePill,
  trustRouteLine,
  type PartsFilter,
  type StatePill,
} from "./researchModel";

const PAGE_SIZE = 25;

type Row = {
  key: string;
  jobId: string | null;
  group: PendingPartsQueueGroup | null;
  filter: Exclude<PartsFilter, "all">;
  pill: StatePill;
  routeLine: string | null;
  car: string;
  codes: string;
  item: string;
  place: string | null;
  sites: string[];
  result: string | null;
  conflict: boolean;
};

export function ResearchPartsTab({ onCount }: { onCount?: (n: number) => void }) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [summary, setSummary] = useState<ResearchSummary | null>(null);
  const [jobs, setJobs] = useState<ResearchJobListItem[]>([]);
  const [groups, setGroups] = useState<PendingPartsQueueGroup[]>([]);
  const [cars, setCars] = useState<Map<string, VehicleCatalogBrief>>(new Map());
  const [partNames, setPartNames] = useState<Awaited<ReturnType<typeof fetchPartsBrowseNameMap>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PartsFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [showList, setShowList] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const [toastMsg, setToastMsg] = useState<DrawerOutcome | null>(null);
  const [resuming, setResuming] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [s, j, q, names] = await Promise.all([
        researchApi.summary(token),
        researchApi.jobs(token, ["part", "spec"]),
        listPendingPartsQueue(token).catch(() => ({ items: [] as PendingPartsQueueGroup[], total: 0, weeklyTarget: 0 })),
        fetchPartsBrowseNameMap(token).catch(() => new Map()),
      ]);
      setSummary(s);
      setJobs(j);
      setGroups(q.items);
      setPartNames(names);
      const handIds = q.items.filter((g) => !g.researchJobId).map((g) => g.vehicleCatalogId || g.platformId).filter(Boolean) as string[];
      setCars(handIds.length ? await fetchVehicleCatalogBriefs(token, handIds) : new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the queue");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // "/" focuses the search box (Stitch screen 1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && t && !["INPUT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows: Row[] = useMemo(() => {
    const groupByJob = new Map(groups.filter((g) => g.researchJobId).map((g) => [String(g.researchJobId), g]));
    const out: Row[] = jobs.map((j) => {
      const pill = statePill(j.state, j.conflictOpen, j.closedNote);
      return {
        key: j.jobId,
        jobId: j.jobId,
        group: groupByJob.get(j.jobId) ?? null,
        filter: j.conflictOpen && j.state !== "added" && j.state !== "auto_added" ? "needs_review" : filterForState(j.state, j.closedNote),
        pill,
        routeLine: j.state === "added" || j.state === "auto_added" ? trustRouteLine(j.trustRoute) : null,
        car: carLabel(j.car),
        codes: carCodes(j.car),
        item: jobItemName(j),
        // A fleet request knows the exact place ("Front", "Before the catalyst"); the job keeps only front / rear.
        place: (groupByJob.get(j.jobId) ? formatPartRequestExtras(groupByJob.get(j.jobId)!).whereOnCar : null) ?? placeLabel(j.fitDescriptor),
        sites: j.siteDomains,
        result: j.resultPartNumber && j.resultPartNumber !== "—" ? j.resultPartNumber : null,
        conflict: j.conflictOpen,
      };
    });
    const jobIds = new Set(jobs.map((j) => j.jobId));
    for (const g of groups) {
      if (g.researchJobId && jobIds.has(String(g.researchJobId))) continue;
      if (g.status === "resolved" || g.status === "rejected") continue;
      const v = cars.get(String(g.vehicleCatalogId || g.platformId || ""));
      const part = formatPartLabel(g.componentId, null, partNames, null);
      out.push({
        key: `group:${g.groupId}`,
        jobId: null,
        group: g,
        filter: "needs_review",
        pill: { label: g.status === "in_progress" ? "Looking" : "Needs review", tone: g.status === "in_progress" ? "blue" : "amber" },
        routeLine: null,
        car: v ? formatVehicleHeadline(v).split(" · ")[0] : "Car not on file",
        codes: v ? carCodes(v) : "",
        item: part.title,
        place: formatPartRequestExtras(g).whereOnCar ?? placeLabel(g.fitDescriptor ?? g.side),
        sites: [],
        result: null,
        conflict: false,
      });
    }
    return out;
  }, [jobs, groups, cars, partNames]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(PARTS_FILTERS.map((f) => [f.id, 0])) as Record<PartsFilter, number>;
    c.all = rows.length;
    for (const r of rows) c[r.filter] += 1;
    return c;
  }, [rows]);

  useEffect(() => {
    onCount?.(counts.needs_review + counts.browser_check);
  }, [counts, onCount]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.filter !== filter) return false;
      if (!needle) return true;
      return `${r.car} ${r.codes} ${r.item} ${r.place ?? ""} ${r.result ?? ""}`.toLowerCase().includes(needle);
    });
  }, [rows, filter, query]);

  useEffect(() => setPage(0), [filter, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const needsYou = counts.needs_review + counts.browser_check;
  const caughtUp = !loading && !error && needsYou === 0 && !showList && filter === "all" && !query;

  async function resume() {
    setResuming(true);
    try {
      await researchApi.patchSettings(token, { paused: false });
      toast.success("Research resumed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resume");
    } finally {
      setResuming(false);
    }
  }

  async function undo(jobId: string) {
    try {
      await researchApi.undo(token, jobId);
      setToastMsg(null);
      toast.success("Undone. It is back for review.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't undo");
    }
  }

  if (loading && !summary) return <ReSkeleton rows={4} />;
  if (error && !summary) return <ReError title="Couldn't load the queue" message={error} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col" data-testid="research-parts-tab">
      <SummaryCards summary={summary} />

      {summary?.paused ? (
        <div className="mb-4">
          <RePaused reason={pauseReasonText(summary.pausedReason, summary.autoResumeAt)} busy={resuming} onResume={() => void resume()} />
        </div>
      ) : null}

      {toastMsg ? (
        <ReToast onClose={() => setToastMsg(null)} onUndo={toastMsg.undoJobId ? () => void undo(toastMsg.undoJobId!) : undefined}>
          {toastMsg.message}
        </ReToast>
      ) : null}

      {caughtUp ? (
        <CaughtUp summary={summary} onSeeWaiting={() => { setShowList(true); setFilter("waiting"); }} />
      ) : (
        <>
          <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0" role="tablist" aria-label="Filter">
              {PARTS_FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`filter-${f.id}`}
                    onClick={() => setFilter(f.id)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-[#0153dc] text-white shadow-sm"
                        : "border border-[#c5c6d0] bg-[#ededf9] text-[#30323b] hover:bg-[#e1e1ed] dark:border-[#334155] dark:bg-[#1e293b] dark:text-[#e2e8f0]"
                    }`}
                  >
                    {f.dot && !active ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${f.dot === "amber" ? "bg-[#d97706]" : "bg-[#0153dc]"} ${f.dot === "pulse" ? "animate-pulse" : ""}`}
                      />
                    ) : null}
                    {f.label} ({counts[f.id]})
                    {f.id === "browser_check" && summary ? (
                      <span className="opacity-80">· {summary.browserCheckOpen} of {summary.browserCheckMax} open</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="relative w-full shrink-0 lg:w-80">
              <DIcon name="search" className={`absolute left-3 top-2.5 text-[18px] ${D_MUTED}`} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search car or part... (Press '/' to focus)"
                data-testid="parts-search"
                className="h-10 w-full rounded-lg border border-[#c5c6d0] bg-white pl-9 pr-10 text-[13px] text-[#30323b] shadow-sm outline-none placeholder:text-[#5d5f68] focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#111a2e] dark:text-[#e2e8f0]"
              />
              <span className={`absolute right-2.5 top-2.5 rounded bg-[#ededf9] px-1.5 py-0.5 text-[12px] ${D_MONO} ${D_MUTED} dark:bg-[#1e293b]`}>/</span>
            </div>
          </div>

          <div className={`${D_CARD} mb-8 overflow-hidden`}>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={`bg-[#f3f3ff] text-[12px] font-semibold uppercase tracking-wider dark:bg-[#0b1220] ${D_MUTED}`}>
                    <th className="px-4 py-3.5">Car &amp; model</th>
                    <th className="px-4 py-3.5">Part &amp; place</th>
                    <th className="px-4 py-3.5">Source catalogue</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Result number</th>
                    <th className="px-4 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={`text-[13px] ${D_TXT}`}>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={`px-4 py-12 text-center ${D_MUTED}`}>
                        Nothing here.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((r) => (
                      <tr
                        key={r.key}
                        data-testid="parts-row"
                        className="cursor-pointer border-t border-[#e6e7ee] transition-colors hover:bg-[#f3f3ff] dark:border-[#1e293b] dark:hover:bg-[#0b1220]"
                        onClick={() => setOpen(r)}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ededf9] shadow-sm dark:bg-[#1e293b]">
                              <DIcon name="directions_car" className="text-[20px] text-[#ba1a1a] dark:text-[#f87171]" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold">{r.car}</div>
                              {r.codes ? <div className={`text-[13px] ${D_MONO} ${D_MUTED}`}>{r.codes}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium">{r.item}</div>
                          {r.place ? <div className={`text-[13px] ${D_MUTED}`}>{r.place}</div> : null}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.sites.length ? (
                              r.sites.slice(0, 3).map((d) => (
                                <span key={d} className={`rounded bg-[#ededf9] px-2 py-0.5 text-[12px] font-medium dark:bg-[#1e293b] ${D_MUTED}`} title={d}>
                                  {siteName(d)}
                                </span>
                              ))
                            ) : (
                              <span className={D_MUTED}>—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <ReStatePill pill={r.pill} testId="row-state" />
                            {r.routeLine ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#006e31] dark:text-[#4ade80]" data-testid="row-route-line">
                                <DIcon name="done_all" className="text-[12px]" />
                                {r.routeLine}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">{r.result ? <ReCode strong>{r.result}</ReCode> : <span className={D_MUTED}>—</span>}</td>
                        <td className="px-4 py-4 text-right">
                          <RowAction row={r} onOpen={() => setOpen(r)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Phone: each row becomes a card. */}
            <div className="flex flex-col gap-2 p-3 md:hidden" data-testid="parts-cards">
              {pageRows.map((r) => (
                <div key={r.key} data-testid="parts-card" role="button" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(r); }} className={`flex cursor-pointer flex-col gap-2 rounded-xl border border-[#e6e7ee] p-4 dark:border-[#1e293b]`}>
                  <div className="font-semibold">{r.car}</div>
                  <div className={`text-[13px] ${D_MUTED}`}>{[r.item, r.place].filter(Boolean).join(" · ")}</div>
                  <div className="flex items-center justify-between gap-2">
                    <ReStatePill pill={r.pill} />
                    <RowAction row={r} onOpen={() => setOpen(r)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between bg-[#f3f3ff]/60 px-4 py-3 dark:bg-[#0b1220]">
              <span className={`text-[12px] ${D_MUTED}`} data-testid="parts-showing">
                Showing {pageRows.length} of {filtered.length} pending parts
              </span>
              <div className="flex items-center gap-2">
                <PartsButton variant="secondary" className="!min-h-[28px] !px-2.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </PartsButton>
                {Array.from({ length: Math.min(pageCount, 5) }).map((_, i) => (
                  <PartsButton
                    key={i}
                    variant={i === page ? "primary" : "secondary"}
                    className="!min-h-[28px] !px-2.5"
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </PartsButton>
                ))}
                <PartsButton variant="secondary" className="!min-h-[28px] !px-2.5" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </PartsButton>
              </div>
            </div>
          </div>
        </>
      )}

      {open ? (
        <ResearchJobDrawer
          token={token}
          jobId={open.jobId}
          group={open.group}
          fallbackTitle={open.item}
          fallbackCar={open.car}
          browserChecks={summary ? { open: summary.browserCheckOpen, max: summary.browserCheckMax } : null}
          onClose={() => setOpen(null)}
          onChanged={(o) => {
            if (o) setToastMsg(o.message.startsWith("Added") && open.jobId ? { ...o, undoJobId: open.jobId } : o);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function RowAction({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };
  if (row.conflict) {
    return (
      <PartsButton variant="secondary" className="!min-h-[32px]" onClick={stop}>
        Choose
      </PartsButton>
    );
  }
  if (row.filter === "needs_review") {
    return (
      <PartsButton variant="primary" className="!min-h-[32px]" onClick={stop} data-testid="row-review">
        Review
      </PartsButton>
    );
  }
  if (row.filter === "browser_check") {
    return (
      <PartsButton variant="secondary" className="!min-h-[32px]" onClick={stop} data-testid="row-open-browser-check">
        Open browser check
      </PartsButton>
    );
  }
  return (
    <PartsButton variant="icon" aria-label="Open" onClick={stop} data-testid="row-open">
      <DIcon name="chevron_right" className="text-[16px]" />
    </PartsButton>
  );
}

function SummaryCards({ summary }: { summary: ResearchSummary | null }) {
  const s = summary;
  const card = (title: string, dot: string, value: ReactNode, sub?: string | null, testId?: string) => (
    <div className={`${D_CARD} flex flex-col justify-between p-5`} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-[12px] font-medium uppercase tracking-wider ${D_MUTED}`}>{title}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <div className={`text-[28px] font-semibold leading-8 tracking-tight ${D_TXT}`}>{value}</div>
      {sub ? <p className={`mt-1 truncate text-[13px] ${D_MUTED}`}>{sub}</p> : null}
    </div>
  );
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {card("Needs review", "bg-[#d97706] ring-4 ring-[#fff4dc] dark:ring-[#451a03]", s?.needsReview ?? 0, null, "card-needs-review")}
      {card(
        "Browser checks waiting",
        "bg-[#0153dc] ring-4 ring-[#dbe1ff] dark:ring-[#1e3a8a]",
        <>
          {s?.browserCheckOpen ?? 0} <span className={`text-[18px] font-normal ${D_MUTED}`}>of {s?.browserCheckMax ?? 25}</span>
        </>,
        null,
        "card-browser-checks",
      )}
      {card("Researching now", "bg-[#0153dc] animate-pulse", s?.researching ?? 0, s?.researchingCar ?? null, "card-researching")}
      {card("Added this week", "bg-[#006e31] ring-4 ring-[#e6f4ea] dark:ring-[#14532d]", s?.addedThisWeek ?? 0, null, "card-added-week")}
    </div>
  );
}

/** Screen 5: nothing waiting for the owner. The strip counts come from the fill plan, never from Fleet demand. */
function CaughtUp({ summary, onSeeWaiting }: { summary: ResearchSummary | null; onSeeWaiting: () => void }) {
  const plan = summary?.fillPlan ?? { cars: 0, ready: 0, inProgress: 0, waiting: 0 };
  const pct = (n: number) => (plan.cars ? `${(n / plan.cars) * 100}%` : "0%");
  return (
    <div className={`${D_CARD} mb-8 flex flex-col items-center justify-center px-8 py-14 text-center`} data-testid="all-caught-up">
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f3f3ff] dark:bg-[#0b1220]">
          <DIcon name="inventory_2" className="text-[44px] text-[#0153dc] dark:text-[#93b4ff]" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#006e31] text-white shadow-sm">
          <DIcon name="check" filled className="text-[18px]" />
        </div>
      </div>
      <h2 className={`mb-2 text-[26px] font-semibold ${D_TXT}`}>You&apos;re all caught up</h2>
      <p className={`mb-8 max-w-md text-[15px] ${D_MUTED}`}>Roam is filling the most-used cars first. Other cars wait their turn.</p>
      {plan.cars > 0 ? (
        <div className="mb-8 flex w-full max-w-xl flex-col gap-2 rounded-xl bg-[#f3f3ff] p-4 dark:bg-[#0b1220]" data-testid="fill-strip">
          <div className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] ${D_MONO} ${D_MUTED}`}>
            <span className={`font-semibold ${D_TXT}`}>Cars being filled first: {plan.cars}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#006e31]" />
              fully ready {plan.ready}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0153dc]" />
              in progress {plan.inProgress}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#d9d9e5]" />
              waiting {plan.waiting}
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#e7e7f3] dark:bg-[#1e293b]">
            <div className="h-full bg-[#006e31]" style={{ width: pct(plan.ready) }} />
            <div className="h-full bg-[#0153dc]" style={{ width: pct(plan.inProgress) }} />
            <div className="h-full bg-[#d9d9e5]" style={{ width: pct(plan.waiting) }} />
          </div>
        </div>
      ) : null}
      <PartsButton variant="secondary" onClick={onSeeWaiting} data-testid="see-whats-waiting">
        See what&apos;s waiting
      </PartsButton>
    </div>
  );
}
