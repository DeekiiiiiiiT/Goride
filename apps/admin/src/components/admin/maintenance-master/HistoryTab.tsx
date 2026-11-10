/** History tab — look: S43g. Content: Dominion's own changes only (plan DM5). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMaintenanceHistoryKind } from "./maintenanceMasterApi";
import { fetchJobs } from "./jobs/jobsApi";
import { buildHistoryEntries, initials, type HistoryEntry, type HistoryKind, type HistoryNames } from "./historySentences";
import { IconButton, OutlineButton } from "./jobs/jobsUi";

type Props = { token: string; onExport: () => void };

const KINDS: Array<{ id: "all" | "jobs" | "sections" | "links" | "schedules"; label: string }> = [
  { id: "all", label: "All" },
  { id: "jobs", label: "Jobs" },
  { id: "sections", label: "Sections" },
  { id: "links", label: "Also-do links" },
  { id: "schedules", label: "Schedules" },
];

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 0, label: "All time" },
];

const KIND_CHIP: Record<HistoryKind, { label: string; cls: string }> = {
  job: { label: "Job", cls: "bg-[#dbe1ff] text-[#0047c0]" },
  section: { label: "Section", cls: "bg-[#eeedf6] text-[#5d5f68]" },
  link: { label: "Also do", cls: "bg-[#dbe1ff] text-[#0047c0]" },
  schedule: { label: "Schedule", cls: "bg-[#dbe1ff] text-[#0047c0]" },
};

export function HistoryTab({ token, onExport }: Props) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [names, setNames] = useState<HistoryNames | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    setRows(null);
    try {
      const [items, jobs] = await Promise.all([fetchMaintenanceHistoryKind(token, kind), fetchJobs(token)]);
      const job = new Map(jobs.jobs.map((j) => [j.id, j.name]));
      const group = new Map(jobs.groups.map((g) => [g.id, g.name]));
      const section = new Map(jobs.sectionGroups.flatMap((sg) => sg.sections.map((s) => [s.id, s.name] as const)));
      setNames({
        job: (id) => job.get(String(id)) ?? "a job",
        group: (id) => group.get(String(id)) ?? "a group",
        section: (id) => section.get(String(id)) ?? "a section",
      });
      setRows(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load history");
    }
  }, [token, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => {
    if (!rows || !names) return [];
    const since = days ? Date.now() - days * 86400000 : 0;
    const s = q.trim().toLowerCase();
    return buildHistoryEntries(rows, names).filter(
      (e) => (!since || Date.parse(e.createdAt) >= since) && (!s || e.sentence.toLowerCase().includes(s)),
    );
  }, [rows, names, days, q]);

  const byDay = useMemo(() => {
    const out: Array<{ day: string; items: HistoryEntry[] }> = [];
    for (const e of entries) {
      const day = new Date(e.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="relative max-w-xs">
            <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-2 text-[18px] text-on-surface-variant">
              filter_list
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by job…"
              className="w-full rounded-lg border border-outline-variant/50 bg-[#f4f3fa] py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <div className="inline-flex flex-wrap rounded-lg border border-outline-variant/50 bg-[#f4f3fa] p-0.5" role="group">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  kind === k.id ? "bg-white text-on-surface shadow-sm" : "text-on-surface-variant"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-outline-variant/50 bg-white px-3 py-2 text-sm"
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <OutlineButton icon="download" onClick={onExport}>
            Export CSV
          </OutlineButton>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-error/30 bg-white p-6 text-center">
          <span className="material-symbols-outlined text-[28px] text-error">error</span>
          <p className="mt-2 font-semibold text-on-surface">Couldn&apos;t load history</p>
          <p className="mt-1 text-sm text-on-surface-variant">Check your connection and try again.</p>
          <OutlineButton icon="refresh" className="mt-4" onClick={() => void load()}>
            Try again
          </OutlineButton>
        </div>
      ) : !rows ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl border border-outline-variant/20 bg-white p-4">
              <div className="h-8 w-8 rounded-full bg-[#eeedf6]" />
              <div className="h-3 flex-1 rounded bg-[#eeedf6]" />
            </div>
          ))}
        </div>
      ) : byDay.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-6 text-center">
          <span className="material-symbols-outlined text-[28px] text-on-surface-variant">history</span>
          <p className="mt-2 font-semibold text-on-surface">No changes in this range</p>
          <p className="mt-1 text-sm text-on-surface-variant">Try a wider date range or another filter.</p>
          {days !== 0 ? (
            <OutlineButton className="mt-4" onClick={() => setDays(0)}>
              Show all time
            </OutlineButton>
          ) : null}
        </div>
      ) : (
        byDay.map((d) => (
          <section key={d.day} className="space-y-2">
            <p className="flex items-center gap-2 font-code text-[11px] uppercase tracking-widest text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              {d.day}
            </p>
            {d.items.map((e) => {
              const isOpen = open === e.key;
              const chip = KIND_CHIP[e.kind];
              return (
                <div key={e.key} className="mm-light-card rounded-xl border border-outline-variant/30 bg-white">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                        e.actor === "Roam setup" ? "bg-[#545f74]" : "bg-[#0153dc]"
                      }`}
                    >
                      {initials(e.actor)}
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-on-surface">{e.sentence}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}>{chip.label}</span>
                    <span className="font-code text-[12px] text-on-surface-variant">
                      {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <IconButton
                      icon={isOpen ? "expand_more" : "chevron_right"}
                      aria-label={isOpen ? "Hide details" : "Show details"}
                      aria-expanded={isOpen}
                      disabled={!e.changes.length}
                      onClick={() => setOpen(isOpen ? null : e.key)}
                    />
                  </div>
                  {isOpen && e.changes.length ? (
                    <div className="mx-4 mb-4 grid gap-3 rounded-xl bg-[#f4f3fa] p-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-error">
                          <span className="material-symbols-outlined text-[14px]">remove_circle</span>Before
                        </p>
                        {e.changes.map((c) => (
                          <p key={`b-${c.field}`} className="rounded bg-white px-2 py-1 font-code text-[12px] text-on-surface">
                            {c.field}: <span className="text-error">{c.before || "—"}</span>
                          </p>
                        ))}
                      </div>
                      <div>
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-[#0153dc]">
                          <span className="material-symbols-outlined text-[14px]">add_circle</span>After
                        </p>
                        {e.changes.map((c) => (
                          <p key={`a-${c.field}`} className="rounded bg-white px-2 py-1 font-code text-[12px] text-on-surface">
                            {c.field}: <span className="text-[#0153dc]">{c.after || "—"}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
