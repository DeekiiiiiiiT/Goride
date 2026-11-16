/**
 * Work done, after a group is picked — ported exactly from Stitch docs/stitch/powertrain-job-fit-fleet/html/04:
 * fit banner, groups as small icon tabs (the chosen one black with its count and a green dot), the chosen
 * group's jobs in a lavender panel as checkbox rows two across, then "Show all jobs". The "not usual" strip,
 * greyed rows and chips come from screens 02 / 03 (audit section 9), drawn in screen 04's row style.
 */
import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, Loader2, Plus } from "lucide-react";
import { LS, LT } from "./logServiceStitch";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { JobTooltip } from "./JobTooltip";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { actionLabel, type RecommendedWith, type SectionJob, type SystemSections } from "./systemSections";
import { mayNeedSummary, type JobItem } from "./itemsUsed";
import { groupFitCounts, isNotUsual, powertrainPill, type JobFitState } from "./jobFit";
import {
  CouldNotCheckBanner,
  FitBanner,
  HighVoltageChip,
  NotUsualChip,
  NotUsualDivider,
  ShowAllButton,
  UnknownEngineBanner,
} from "./JobFitUi";

type Props = {
  system: MaintenanceServiceCategory;
  /** Flat list (groups without sections, or when sections fail to load). */
  components: MaintenanceServiceCategory[];
  loading: boolean;
  /** Engine-style sections (F1). Null = show the flat grid. */
  sections?: SystemSections | null;
  selectedIds: string[];
  isAdded: (cat: MaintenanceServiceCategory) => boolean;
  onToggleComponent: (cat: MaintenanceServiceCategory) => void;
  /** Tick/untick a related job from an "Also do" chip (may live in another group). */
  onToggleRelated: (rel: RecommendedWith) => void;
  /** Service items on: each job ⓘ also says what it may need. */
  mayNeedByJob?: Map<string, JobItem[]>;
  /** Powertrain job fit. Absent / "off" = today's screen. */
  jobFit?: JobFitState;
  /** Hidden jobs shown ("Show all jobs" here or on the group grid). */
  showAll?: boolean;
  onToggleShowAll?: () => void;
  /** Kept for callers; screen 04 switches groups with the tabs instead. */
  onBack?: () => void;
  /** Every group, for the icon tabs (screen 04). */
  groups?: MaintenanceServiceCategory[];
  /** Every job, for the per-group fitting counts. */
  allJobs?: MaintenanceServiceCategory[];
  onPickGroup?: (sys: MaintenanceServiceCategory) => void;
  onRetryJobFit?: () => void;
  onLinkCar?: () => void;
};

/** Short tab names as screen 04 draws them ("Tires", "Lighting", "Suspension"…). */
export function shortGroupName(name: string): string {
  if (name.length <= 13) return name;
  const cut = name.split(/\s+(?:&|and)\s+/i)[0];
  return cut || name;
}

export function LogServiceSystemPicker({
  system,
  components,
  loading,
  sections,
  selectedIds,
  isAdded,
  onToggleComponent,
  onToggleRelated,
  mayNeedByJob,
  jobFit = { status: "off" },
  showAll = false,
  onToggleShowAll,
  groups = [],
  allJobs: everyJob = [],
  onPickGroup,
  onRetryJobFit,
  onLinkCar,
}: Props) {
  // A ticked job always stays where it is; only unticked "not usual" jobs move behind Show all.
  const hide = (cat: SectionJob) => isNotUsual(jobFit, cat.id) && !selectedIds.includes(cat.id);
  const allJobs: SectionJob[] = sections
    ? [...sections.groups.flatMap((g) => g.sections.flatMap((sec) => sec.jobs)), ...sections.otherJobs]
    : components;
  const notUsual = [...new Map(allJobs.filter(hide).map((j) => [j.id, j])).values()];
  const allJobsCount = new Set(allJobs.map((j) => j.id)).size;
  const fitOn = jobFit.status === "known";

  // Tabs: groups with nothing that fits close up, except the open one.
  const tabs = groups.filter((g) => {
    if (!fitOn || showAll || g.id === system.id) return true;
    return groupFitCounts(jobFit, g.id, everyJob).fit > 0;
  });
  const openCount = fitOn && !showAll ? allJobsCount - notUsual.length : allJobsCount;

  const row = (cat: SectionJob, spanLast: boolean) => (
    <JobRow
      key={cat.id}
      notUsual={isNotUsual(jobFit, cat.id)}
      cat={cat}
      openGroupId={system.id}
      selected={selectedIds.includes(cat.id)}
      added={isAdded(cat)}
      selectedIds={selectedIds}
      onToggle={() => onToggleComponent(cat)}
      onToggleRelated={onToggleRelated}
      mayNeed={mayNeedSummary(mayNeedByJob?.get(cat.id))}
      spanBoth={spanLast}
    />
  );
  const rows = (list: SectionJob[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-1 pt-1">
      {list.map((j, i) => row(j, list.length % 2 === 1 && i === list.length - 1))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="log-service-group-open">
      {jobFit.status === "unknown" ? <UnknownEngineBanner onLinkCar={onLinkCar} /> : null}
      {jobFit.status === "error" && onRetryJobFit ? <CouldNotCheckBanner onRetry={onRetryJobFit} /> : null}
      {fitOn ? <FitBanner pill={powertrainPill(jobFit) ?? ""} variant="tabs" /> : null}

      <GroupTabs groups={tabs} selectedId={system.id} openCount={loading ? null : openCount} onPick={onPickGroup} />

      <div className={`w-full rounded-xl p-4 flex flex-col gap-2 ${LS.low}`} data-testid="group-jobs-panel">
        <div className="flex items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#82f5c1] text-[#00714e]">
              <MaintenanceIcon iconKey={system.icon_key} className="w-4 h-4" />
            </span>
            <span className={`truncate ${LT.titleSm} ${LS.text}`}>{system.name}</span>
          </div>
          {!loading ? (
            <span className={`shrink-0 ${LT.bodySm} ${LS.muted}`} data-testid="group-fit-pill">
              {fitOn && !showAll && notUsual.length
                ? `${openCount} jobs fit this car · ${notUsual.length} hidden`
                : `${allJobsCount} job${allJobsCount === 1 ? "" : "s"}`}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className={`flex items-center gap-2 py-8 justify-center ${LT.bodySm} ${LS.muted}`}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading jobs…
          </div>
        ) : sections ? (
          <div className="flex flex-col gap-4">
            {sections.groups.map((g) => (
              <section key={g.code} className="flex flex-col gap-2">
                <h4 className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>{g.name}</h4>
                {g.sections.map((sec) => {
                  const shown = sec.jobs.filter((j) => !hide(j));
                  return (
                    <div key={sec.code} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <MaintenanceIcon iconKey={sec.iconKey} className={`w-4 h-4 ${LS.muted}`} />
                        <span className={`${LT.titleSm} ${LS.text}`}>{sec.name}</span>
                        <InfoButton label={`About ${sec.name}`} text={sec.description} />
                      </div>
                      {shown.length ? rows(shown) : <p className={`${LT.bodySm} ${LS.muted}`}>None of these fit this car.</p>}
                    </div>
                  );
                })}
              </section>
            ))}
            {sections.otherJobs.filter((j) => !hide(j)).length ? (
              <section className="flex flex-col gap-1">
                <h4 className={`uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>{LOG_SERVICE_COPY.otherJobsHeading(system.name)}</h4>
                {rows(sections.otherJobs.filter((j) => !hide(j)))}
              </section>
            ) : null}
          </div>
        ) : components.length === 0 ? (
          <p className={`py-4 ${LT.bodySm} ${LS.muted}`}>No jobs in this group.</p>
        ) : (
          rows(components.filter((j) => !hide(j)))
        )}

        {!loading && showAll && notUsual.length ? (
          <div className="flex flex-col gap-2 pt-2" data-testid="not-usual-jobs">
            <NotUsualDivider />
            {rows(notUsual)}
          </div>
        ) : null}
      </div>

      {!loading && onToggleShowAll ? <ShowAllButton shown={showAll} hidden={notUsual.length} inGroup onToggle={onToggleShowAll} /> : null}
    </div>
  );
}

/** Screen 04 group tabs: small icon tabs; the chosen one black with its count and a green dot. */
export function GroupTabs({
  groups,
  selectedId,
  openCount,
  onPick,
  greyIds,
}: {
  groups: MaintenanceServiceCategory[];
  selectedId: string | null;
  openCount?: number | null;
  onPick?: (g: MaintenanceServiceCategory) => void;
  /** Groups shown only because "Show all jobs" is on: greyed. */
  greyIds?: Set<string>;
}) {
  if (!groups.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1" role="tablist" aria-label="Groups" data-testid="group-tabs">
      {groups.map((g) => {
        const on = g.id === selectedId;
        const grey = !on && greyIds?.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={on}
            title={g.name}
            data-testid={`group-tab-${g.code}`}
            onClick={() => (on ? undefined : onPick?.(g))}
            className={`relative flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
              on ? `${LS.btnPrimary} shadow-sm` : `${LS.low} ${LS.hoverMid} ${LS.muted} ${grey ? "opacity-60" : ""}`
            }`}
          >
            {on ? (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#006c4a] ring-2 ring-white dark:ring-[#15161d]" />
            ) : null}
            <MaintenanceIcon iconKey={g.icon_key} className={`w-[18px] h-[18px] mb-1 ${on ? "text-[#85f8c4]" : ""}`} />
            <span className={`${LT.labelSm} truncate w-full text-center ${on ? "font-semibold" : ""}`}>
              {shortGroupName(g.name)}
              {on && openCount != null ? ` · ${openCount}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Screen 04 job row: checkbox, name, action pill (white card on the lavender panel). */
function JobRow({
  notUsual = false,
  cat,
  openGroupId,
  selected,
  added,
  selectedIds,
  onToggle,
  onToggleRelated,
  mayNeed,
  spanBoth,
}: {
  cat: SectionJob;
  openGroupId: string;
  selected: boolean;
  added: boolean;
  selectedIds: string[];
  onToggle: () => void;
  onToggleRelated: (rel: RecommendedWith) => void;
  mayNeed?: string;
  notUsual?: boolean;
  spanBoth?: boolean;
}) {
  const info = [cat.description, mayNeed].filter(Boolean).join("\n\n");
  const badge = actionLabel(cat.default_action);
  const related = selected ? cat.recommendedWith ?? [] : [];
  return (
    <div className={`flex flex-col gap-1 ${spanBoth ? "md:col-span-2" : ""}`}>
      <div
        className={`relative rounded-lg shadow-sm transition-colors ${
          notUsual && !selected ? "bg-slate-50 dark:bg-slate-800/40" : "bg-white hover:bg-[#fbf8ff] dark:bg-[#15161d]"
        }`}
      >
        <JobTooltip text={cat.description}>
          <button
            type="button"
            aria-pressed={selected}
            aria-label={cat.name}
            data-testid={`log-job-${cat.code}`}
            onClick={onToggle}
            className="absolute inset-0 rounded-lg"
          />
        </JobTooltip>
        <div className="pointer-events-none relative flex items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <input
              type="checkbox"
              readOnly
              tabIndex={-1}
              aria-hidden
              checked={selected}
              className="w-[18px] h-[18px] shrink-0 rounded accent-black dark:accent-white"
            />
            <span className={`truncate ${LT.titleSm} ${notUsual && !selected ? "text-slate-500" : LS.text}`}>{cat.name}</span>
            {notUsual ? <NotUsualChip className="shrink-0" /> : null}
            {cat.is_high_voltage ? <HighVoltageChip className="shrink-0" /> : null}
            {info ? (
              <span className="pointer-events-auto shrink-0">
                <InfoButton label={`About ${cat.name}`} text={info} />
              </span>
            ) : null}
            {added ? <span className="shrink-0 text-[11px] font-semibold text-primary">{LOG_SERVICE_COPY.jobAddedBadge}</span> : null}
          </div>
          {badge ? (
            <span className={`shrink-0 rounded px-2 py-0.5 ${LT.labelSm} ${LS.high} ${LS.muted}`}>{badge}</span>
          ) : null}
        </div>
      </div>
      {related.length ? (
        <div className="flex flex-wrap items-center gap-1" data-testid={`also-do-${cat.code}`}>
          <span className="text-[11px] font-semibold text-stitch-secondary">{LOG_SERVICE_COPY.alsoDoLabel}</span>
          {related.map((rel) => {
            const on = selectedIds.includes(rel.categoryId);
            const elsewhere = rel.homeSystemId && rel.homeSystemId !== openGroupId;
            const tip = elsewhere ? `${rel.note} ${LOG_SERVICE_COPY.savesUnder(rel.homeSystemName)}` : rel.note;
            return (
              <JobTooltip key={rel.categoryId} text={tip}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleRelated(rel)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    on
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:border-primary/50"
                  }`}
                >
                  {on ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {rel.name}
                </button>
              </JobTooltip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** ⓘ that works on touch: tap to show the description, tap elsewhere to close (F6). Never ticks the card. */
export function InfoButton({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  if (!text) return null;
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-outline-variant/60 bg-surface-container-lowest text-stitch-secondary hover:text-primary hover:border-primary/50"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-7 z-30 w-60 whitespace-pre-line rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3 text-left text-xs leading-snug text-on-surface shadow-xl"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
