/** DM1 — Dominion · Maintenance · Jobs list. Look: S43a. Content: docs/engine-service-sections-plan.md. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchJobs, restoreJob, type Job, type JobsPayload } from "./jobsApi";
import { buildGroupViews, listedIn, type GroupView } from "./jobsModel";
import {
  ActionChip,
  CountChip,
  DangerButton,
  FormTypeChip,
  IconButton,
  JobIcon,
  ListedFromChip,
  OutlineButton,
  PrimaryButton,
  StatusChip,
} from "./jobsUi";
import { JobDrawer } from "./JobDrawer";
import { ManageSections } from "./ManageSections";
import { RetireJobDialog } from "./RetireJobDialog";

type Props = { token: string; canWrite: boolean };

export function JobsTab({ token, canWrite }: Props) {
  const [data, setData] = useState<JobsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState<string>("all");
  const [status, setStatus] = useState<"active" | "retired">("active");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<{ mode: "add" } | { mode: "edit"; job: Job } | null>(null);
  const [retiring, setRetiring] = useState<Job | null>(null);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJobs(token);
      setData(payload);
      // First visit: open the first group that has sections, and its first section group.
      setOpenGroups((prev) => {
        if (prev.size) return prev;
        const first = payload.sectionGroups[0];
        return first ? new Set([first.groupId]) : prev;
      });
      setOpenSections((prev) => {
        if (prev.size) return prev;
        const first = [...payload.sectionGroups].sort((a, b) => a.sortOrder - b.sortOrder)[0];
        return first ? new Set(first.sections.map((s) => s.id)) : prev;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load jobs");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const views = useMemo(
    () => (data ? buildGroupViews(data, { status, groupId, search }) : []),
    [data, status, groupId, search],
  );
  const groupName = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.id, g.name])), [data]);
  const searching = search.trim().length > 0;

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const onRestore = async (job: Job) => {
    try {
      await restoreJob(token, job.id);
      toast.success(`${job.name} restored`);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore");
    }
  };

  if (manageGroupId && data) {
    return (
      <ManageSections
        token={token}
        canWrite={canWrite}
        data={data}
        groupId={manageGroupId}
        onGroupChange={setManageGroupId}
        onBack={() => setManageGroupId(null)}
        onChanged={load}
      />
    );
  }

  const activeCount = data?.jobs.filter((j) => j.status === "active").length ?? 0;
  const sectioned = (data?.groups ?? [])
    .map((g) => ({ g, n: (data?.sectionGroups ?? []).filter((sg) => sg.groupId === g.id).reduce((n, sg) => n + sg.sections.length, 0) }))
    .filter((x) => x.n > 0);

  return (
    <div className="mt-6 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-2 text-[18px] text-on-surface-variant">
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs, codes…"
              className="w-full rounded-lg border border-outline-variant/50 bg-[#f4f3fa] py-2 pl-8 pr-3 text-sm text-on-surface"
            />
          </div>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border border-outline-variant/50 bg-[#f4f3fa] px-3 py-2 text-sm text-on-surface"
            aria-label="Group"
          >
            <option value="all">Group: All groups</option>
            {(data?.groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                Group: {g.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-lg border border-outline-variant/50 bg-[#f4f3fa] p-0.5" role="group">
            {(["active", "retired"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  status === s ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                {s === "active" ? "Active" : "Retired"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OutlineButton
            icon="account_tree"
            disabled={!data}
            onClick={() => setManageGroupId(groupId !== "all" ? groupId : sectioned[0]?.g.id ?? data?.groups[0]?.id ?? null)}
          >
            Manage sections
          </OutlineButton>
          {canWrite ? (
            <PrimaryButton icon="add" onClick={() => setDrawer({ mode: "add" })}>
              Add job
            </PrimaryButton>
          ) : null}
        </div>
      </div>

      {data ? (
        <p className="font-code text-[12px] text-on-surface-variant">
          {activeCount} jobs · {data.groups.length} groups
          {sectioned.map(({ g, n }) => ` · ${g.name} has ${n} section${n === 1 ? "" : "s"}`).join("")}
        </p>
      ) : null}

      {/* States */}
      {loading && !data ? <JobsSkeleton /> : null}
      {error ? (
        <div className="rounded-2xl border border-error/30 bg-error/5 p-6 text-center">
          <span className="material-symbols-outlined text-[28px] text-error">cloud_off</span>
          <p className="mt-2 font-semibold text-error">Couldn&apos;t load jobs</p>
          <p className="mt-1 text-sm text-on-surface-variant">Check your connection and try again.</p>
          <OutlineButton icon="refresh" className="mt-4" onClick={() => void load()}>
            Try again
          </OutlineButton>
        </div>
      ) : null}
      {data && !error && views.length === 0 && searching ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 text-center">
          <span className="material-symbols-outlined text-[28px] text-on-surface-variant">search_off</span>
          <p className="mt-2 font-semibold">No job matches &quot;{search.trim()}&quot;</p>
          <p className="mt-1 text-sm text-on-surface-variant">Check the spelling, or choose another group.</p>
          <OutlineButton icon="backspace" className="mt-4" onClick={() => setSearch("")}>
            Clear search
          </OutlineButton>
        </div>
      ) : null}

      {/* Group cards */}
      {data && !error
        ? views.map((v) => (
            <GroupCard
              key={v.group.id}
              view={v}
              data={data}
              groupName={groupName}
              open={searching || openGroups.has(v.group.id)}
              onToggle={() => toggle(openGroups, v.group.id, setOpenGroups)}
              openSections={openSections}
              searching={searching}
              onToggleSection={(id) => toggle(openSections, id, setOpenSections)}
              canWrite={canWrite}
              onEdit={(job) => setDrawer({ mode: "edit", job })}
              onRetire={(job) => setRetiring(job)}
              onRestore={(job) => void onRestore(job)}
              onAddJobs={() => setManageGroupId(v.group.id)}
            />
          ))
        : null}

      {drawer && data ? (
        <JobDrawer
          token={token}
          data={data}
          mode={drawer.mode}
          job={drawer.mode === "edit" ? drawer.job : null}
          presetGroupId={groupId !== "all" ? groupId : undefined}
          canWrite={canWrite}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            void load();
          }}
          onOpenJob={(job) => setDrawer({ mode: "edit", job })}
        />
      ) : null}

      {retiring && data ? (
        <RetireJobDialog
          token={token}
          data={data}
          job={retiring}
          onClose={() => setRetiring(null)}
          onRetired={() => {
            setRetiring(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function GroupCard(props: {
  view: GroupView;
  data: JobsPayload;
  groupName: Map<string, string>;
  open: boolean;
  onToggle: () => void;
  openSections: Set<string>;
  searching: boolean;
  onToggleSection: (id: string) => void;
  canWrite: boolean;
  onEdit: (job: Job) => void;
  onRetire: (job: Job) => void;
  onRestore: (job: Job) => void;
  onAddJobs: () => void;
}) {
  const { view: v, data, groupName, open } = props;
  const listedElsewhere = v.homeJobs
    .map((j) => ({ j, where: listedIn(data, j.id) }))
    .filter((x) => x.where.length > 0);
  const hasSections = v.sectionGroups.length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest">
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <JobIcon iconKey={v.group.iconKey} className="h-10 w-10" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-on-surface">{v.group.name}</h3>
              <CountChip>
                {v.homeJobs.length} job{v.homeJobs.length === 1 ? "" : "s"} ·{" "}
                {v.sectionCount ? `${v.sectionCount} section${v.sectionCount === 1 ? "" : "s"}` : "no sections"}
              </CountChip>
            </div>
            {listedElsewhere.map(({ j, where }) => (
              <p key={j.id} className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
                {j.name} is also listed in {where.map((w) => `${w.groupName} · ${w.sectionName}`).join(", ")}
              </p>
            ))}
          </div>
        </div>
        <IconButton
          icon={open ? "expand_less" : "expand_more"}
          aria-label={open ? `Collapse ${v.group.name}` : `Expand ${v.group.name}`}
          aria-expanded={open}
          onClick={props.onToggle}
        />
      </header>

      {open ? (
        <div className="border-t border-outline-variant/20 px-4 pb-4">
          {v.sectionGroups.map((sg) => (
            <div key={sg.id} className="mt-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-1">
                <span className="font-code text-[11px] uppercase tracking-widest text-on-surface-variant">{sg.name}</span>
                <span className="font-code text-[11px] text-on-surface-variant">
                  {sg.sections.length} section{sg.sections.length === 1 ? "" : "s"}
                </span>
              </div>
              {sg.sections.length === 0 ? (
                <EmptyRow text="0 sections — add one" button="Add section" onClick={props.onAddJobs} />
              ) : null}
              {sg.sections.map((s) => {
                const sOpen = props.searching || props.openSections.has(s.id);
                return (
                  <div key={s.id} className="mt-2 rounded-xl border border-outline-variant/20">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                          {sectionIcon(s.iconKey)}
                        </span>
                        <span className="text-sm font-semibold text-on-surface">{s.name}</span>
                        <CountChip>
                          {s.jobs.length} job{s.jobs.length === 1 ? "" : "s"}
                        </CountChip>
                      </div>
                      <IconButton
                        icon={sOpen ? "expand_less" : "expand_more"}
                        aria-label={sOpen ? `Collapse ${s.name}` : `Expand ${s.name}`}
                        aria-expanded={sOpen}
                        onClick={() => props.onToggleSection(s.id)}
                      />
                    </div>
                    {sOpen ? (
                      s.jobs.length === 0 ? (
                        <EmptyRow text="0 jobs — add some" button="Add jobs" onClick={props.onAddJobs} />
                      ) : (
                        <ul className="divide-y divide-outline-variant/20 border-t border-outline-variant/20">
                          {s.jobs.map((job) => (
                            <JobRow
                              key={job.id}
                              job={job}
                              homeName={job.homeGroupId !== v.group.id ? groupName.get(job.homeGroupId) : undefined}
                              {...props}
                            />
                          ))}
                        </ul>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}

          {v.unsectioned.length > 0 ? (
            <div className="mt-4">
              {hasSections ? (
                <div className="border-b border-outline-variant/20 pb-1">
                  <span className="font-code text-[11px] uppercase tracking-widest text-on-surface-variant">
                    Other {v.group.name.toLowerCase()} jobs
                  </span>
                </div>
              ) : null}
              <ul className="divide-y divide-outline-variant/20">
                {v.unsectioned.map((job) => (
                  <JobRow key={job.id} job={job} {...props} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function JobRow({
  job,
  homeName,
  canWrite,
  onEdit,
  onRetire,
  onRestore,
}: {
  job: Job;
  homeName?: string;
  canWrite: boolean;
  onEdit: (job: Job) => void;
  onRetire: (job: Job) => void;
  onRestore: (job: Job) => void;
}) {
  const retired = job.status === "retired";
  return (
    <li className="flex flex-col gap-2 px-3 py-3 hover:bg-surface-container-low/40 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <JobIcon iconKey={job.iconKey} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-semibold text-on-surface ${retired ? "line-through opacity-70" : ""}`}>
              {job.name}
            </span>
            <FormTypeChip isPart={job.isPart} />
            <ActionChip action={job.defaultAction} />
            {homeName ? <ListedFromChip groupName={homeName} /> : null}
            <StatusChip status={job.status} />
          </div>
          <span className="font-code text-[11px] text-on-surface-variant">
            {job.code}
            {job.opCode ? ` · ${job.opCode}` : ""}
          </span>
        </div>
      </div>
      {canWrite ? (
        <div className="flex shrink-0 items-center gap-2 self-end lg:self-center">
          {retired ? (
            <>
              <span className="max-w-[260px] text-right text-[11px] text-on-surface-variant">
                Restore doesn&apos;t put it back in sections or &apos;also do&apos; links — add them again.
              </span>
              <OutlineButton icon="restore" onClick={() => onRestore(job)}>
                Restore
              </OutlineButton>
            </>
          ) : (
            <>
              <OutlineButton onClick={() => onEdit(job)}>Edit</OutlineButton>
              <DangerButton onClick={() => onRetire(job)}>Retire</DangerButton>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function EmptyRow({ text, button, onClick }: { text: string; button: string; onClick: () => void }) {
  return (
    <div className="m-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-outline-variant/60 px-3 py-3">
      <span className="text-sm text-on-surface-variant">{text}</span>
      <OutlineButton icon="add" onClick={onClick}>
        {button}
      </OutlineButton>
    </div>
  );
}

function JobsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading jobs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
          <div className="h-4 w-40 rounded bg-[#eeedf6]" />
          <div className="mt-3 h-3 w-2/3 rounded bg-[#eeedf6]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[#eeedf6]" />
        </div>
      ))}
    </div>
  );
}

export function sectionIcon(iconKey: string): string {
  const map: Record<string, string> = {
    wind: "air",
    droplet: "water_drop",
    spark: "bolt",
    belt: "cable",
    oil: "oil_barrel",
    thermometer: "thermometer",
    gears: "settings",
    wrench: "build",
  };
  return map[iconKey] ?? "category";
}
