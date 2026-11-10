import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Info, Loader2, Plus } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { JobTooltip } from "./JobTooltip";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";
import { actionLabel, type RecommendedWith, type SectionJob, type SystemSections } from "./systemSections";

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
};

/** Pick one or more jobs inside a group (e.g. Wheel Alignment + Wheel Balancing). */
export function LogServiceSystemPicker({
  system,
  components,
  loading,
  sections,
  selectedIds,
  isAdded,
  onToggleComponent,
  onToggleRelated,
}: Props) {
  const card = (cat: SectionJob) => (
    <JobCard
      key={cat.id}
      cat={cat}
      openGroupId={system.id}
      selected={selectedIds.includes(cat.id)}
      added={isAdded(cat)}
      selectedIds={selectedIds}
      onToggle={() => onToggleComponent(cat)}
      onToggleRelated={onToggleRelated}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="bg-surface-container p-3 rounded-xl text-on-surface">
          <MaintenanceIcon iconKey={system.icon_key} className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-semibold text-on-surface">{system.name}</h3>
          <p className="text-sm text-stitch-secondary">{LOG_SERVICE_COPY.pickJobsHint}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-stitch-secondary py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading components…
        </div>
      ) : sections ? (
        <div className="space-y-6">
          {sections.groups.map((g) => (
            <section key={g.code} className="space-y-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stitch-secondary border-b border-outline-variant/30 pb-1">
                {g.name}
              </h4>
              {g.sections.map((sec) => (
                <div key={sec.code} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MaintenanceIcon iconKey={sec.iconKey} className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-on-surface">{sec.name}</span>
                    <InfoButton label={`About ${sec.name}`} text={sec.description} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{sec.jobs.map(card)}</div>
                </div>
              ))}
            </section>
          ))}
          {sections.otherJobs.length ? (
            <section className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stitch-secondary border-b border-outline-variant/30 pb-1">
                {LOG_SERVICE_COPY.otherJobsHeading(system.name)}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{sections.otherJobs.map(card)}</div>
            </section>
          ) : null}
        </div>
      ) : components.length === 0 ? (
        <p className="text-sm text-stitch-secondary py-4">No components under this system.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{components.map(card)}</div>
      )}
    </div>
  );
}

function JobCard({
  cat,
  openGroupId,
  selected,
  added,
  selectedIds,
  onToggle,
  onToggleRelated,
}: {
  cat: SectionJob;
  openGroupId: string;
  selected: boolean;
  added: boolean;
  selectedIds: string[];
  onToggle: () => void;
  onToggleRelated: (rel: RecommendedWith) => void;
}) {
  const badge = actionLabel(cat.default_action);
  const related = selected ? cat.recommendedWith ?? [] : [];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <JobTooltip text={cat.description}>
          <button
            type="button"
            aria-pressed={selected}
            data-testid={`log-job-${cat.code}`}
            onClick={onToggle}
            className={`w-full flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors text-center min-h-[108px] ${
              selected
                ? "border-primary bg-surface-container-low"
                : "border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/30"
            }`}
          >
            <span className="absolute top-2 right-2" aria-hidden>
              {selected ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-outline-variant" />}
            </span>
            <div className="bg-surface-container p-3 rounded-xl text-on-surface">
              <MaintenanceIcon iconKey={cat.icon_key} className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-on-surface leading-tight">{cat.name}</span>
            {badge ? (
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                {badge}
              </span>
            ) : null}
            {added ? <span className="text-[11px] font-semibold text-primary">{LOG_SERVICE_COPY.jobAddedBadge}</span> : null}
          </button>
        </JobTooltip>
        {cat.description ? (
          <div className="absolute top-2 left-2">
            <InfoButton label={`About ${cat.name}`} text={cat.description} />
          </div>
        ) : null}
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
          className="absolute left-0 top-7 z-30 w-60 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3 text-left text-xs leading-snug text-on-surface shadow-xl"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
