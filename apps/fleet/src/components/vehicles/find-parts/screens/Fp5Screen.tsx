import { useMemo, type ReactNode } from "react";
import { formatAxleTag } from "@roam/types/partPositionNorm";
import type { Fp5ResultRow, Fp5ViewModel } from "../findPartsViewModels";

export type Fp5Actions = {
  onAskRoam: () => void;
  onOpenRow: (id: string) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onYourRequests?: () => void;
  children?: ReactNode;
};

export type Fp12Actions = Fp5Actions & {
  onOpenBest?: () => void;
  onEditPartCategory?: () => void;
  /** Phone hero "Use in service log" for the best part; undefined hides the button. */
  onUseInService?: () => void;
};

export function Fp5Screen({
  actions,
  data,
  partName,
  positionTrail,
}: {
  actions: Fp5Actions;
  data: Fp5ViewModel;
  partName?: string;
  positionTrail?: string;
}) {
  const titlePart = data.identifiedPartTitle || partName || data.componentTitle || "Part";
  const sections = useMemo(
    () => data.tierSections.filter((section) => section.rows.length > 0),
    [data.tierSections],
  );
  const requestTotal = data.requestCount ?? 0;

  return (
    <div className="find-parts-screen-root find-parts-am-results">
      <div className="fp-screen-root fp5-am-root">
        <div className="flex flex-col w-full gap-space-lg py-space-xl">
          <div className="fp5-am-legend flex flex-wrap items-center justify-end gap-space-md font-body-sm text-on-surface-variant">
            <span className="fp5-am-legend-item inline-flex items-center gap-1.5">
              <span className="fp5-am-dot fp5-am-dot-confirmed" aria-hidden />
              <span>Confirmed</span>
            </span>
            <span className="fp5-am-legend-item inline-flex items-center gap-1.5">
              <span className="fp5-am-dot fp5-am-dot-checking" aria-hidden />
              <span>Roam is checking</span>
            </span>
          </div>

          <div className="fp5-am-summary-grid grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <section className="fp5-am-car-card lg:col-span-7 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-lg shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-space-md">
                <div className="flex items-start gap-space-md min-w-0">
                  <div className="fp5-am-car-icon shrink-0 flex items-center justify-center rounded-lg border border-outline-variant/40 bg-surface-container-low w-12 h-12 text-on-surface">
                    <span className="material-symbols-outlined text-[26px]">directions_car</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">{data.vehicleLabel}</h2>
                      <span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded border border-outline-variant/50 bg-surface-container-low text-on-surface">
                        {data.plate}
                      </span>
                      {data.serviceLineChip && data.serviceLineChip !== "None yet" ? (
                        <span className="fp5-am-service-chip font-caption text-caption font-medium px-2 py-0.5 rounded-full border border-secondary/30 bg-secondary-container/40 text-on-secondary-container">
                          {data.serviceLineChip}
                        </span>
                      ) : null}
                    </div>
                    {data.vehicleSpecLine ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 fp5-am-wrap">{data.vehicleSpecLine}</p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className="fp5-am-change-car shrink-0 font-body-sm text-body-sm font-medium px-2.5 py-1.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low"
                  onClick={actions.onChangeCar}
                >
                  Change car
                </button>
              </div>
              {data.choiceTrail.length ? (
                <div className="fp5-am-choice-trail mt-space-md pt-space-md border-t border-surface-container-high flex flex-wrap items-center gap-2 font-body-sm text-body-sm">
                  <span className="text-on-surface-variant font-medium">Choice trail:</span>
                  {data.choiceTrail.map((chip, index) => (
                    <span key={`${chip.label}-${index}`} className="inline-flex items-center gap-2">
                      {index > 0 ? <span className="text-outline-variant">›</span> : null}
                      <span
                        className={
                          chip.active
                            ? "fp5-am-trail-chip fp5-am-trail-chip-active font-medium px-2 py-0.5 rounded"
                            : "fp5-am-trail-chip font-medium px-2 py-0.5 rounded bg-surface-container-low text-on-surface-variant"
                        }
                      >
                        {chip.label}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="fp5-am-subsystem-card lg:col-span-5 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-lg shadow-sm flex flex-col justify-between gap-space-md">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">
                    Identified subsystem
                  </span>
                  <button
                    type="button"
                    className="fp5-am-requests-link inline-flex items-center gap-1.5 font-body-sm text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
                    onClick={actions.onYourRequests}
                  >
                    <span>Your requests</span>
                    <span className="font-label-code text-[10px] font-bold w-4 h-4 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface">
                      {requestTotal}
                    </span>
                  </button>
                </div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1">{titlePart}</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 fp5-am-wrap">{data.subsystemSubtitle}</p>
              </div>
              <div className="pt-space-md border-t border-surface-container-high flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm">
                <span className="text-on-surface-variant">Need a part not listed?</span>
                <button type="button" className="fp5-am-ask-link font-semibold text-on-surface inline-flex items-center gap-1 hover:underline" onClick={actions.onAskRoam}>
                  <span>Ask Roam to add it</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </section>
          </div>

          <div className="fp5-am-tiers flex flex-col gap-space-lg">
            {sections.map((section) => (
              <TierSection key={section.tier} section={section} onOpenRow={actions.onOpenRow} plate={data.plate} />
            ))}
          </div>

          <footer className="fp5-am-engine-footer pt-space-lg mt-space-md border-t border-outline-variant/30 font-body-sm text-body-sm text-on-surface-variant text-center fp5-am-wrap">
            Roam Fleet Match Intelligence Engine · Kingston Hub #01 · Non-commercial parts encyclopedia · Zero pricing or procurement bias
          </footer>
        </div>
      </div>
    </div>
  );
}

function TierSection({
  section,
  onOpenRow,
  plate,
}: {
  section: Fp5ViewModel["tierSections"][number];
  onOpenRow: (id: string) => void;
  plate: string;
}) {
  const accent = section.accentColor || "#2563eb";
  const subtitle = section.description?.includes(plate)
    ? section.description
    : section.description;
  return (
    <section
      className={`fp5-am-tier rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm overflow-hidden border-l-4 ${section.allChecking ? "fp5-am-tier-all-checking" : ""}`}
      style={{ borderLeftColor: accent }}
    >
      <div
        className={
          section.allChecking
            ? "fp5-am-tier-head fp5-am-tier-head-checking px-space-lg py-space-md border-b border-amber-500/30"
            : "fp5-am-tier-head px-space-lg py-space-md border-b border-surface-container-high bg-surface-container-low/60"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="fp5-am-tier-dot w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
              <h4 className="font-headline-sm text-headline-sm font-bold text-on-surface">{section.heading}</h4>
              {subtitle ? (
                <span className="font-body-sm text-body-sm text-on-surface-variant fp5-am-wrap">
                  <span className="text-on-surface-variant/70">• </span>
                  {subtitle}
                </span>
              ) : null}
            </div>
            {section.allChecking ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 inline-flex items-center gap-1.5 fp5-am-wrap">
                <span className="material-symbols-outlined text-[16px] text-amber-700 dark:text-amber-300">info</span>
                <span>Roam found these from shared parts and is still confirming them.</span>
              </p>
            ) : null}
          </div>
          {section.countLabel ? (
            <span
              className={
                section.allChecking
                  ? "fp5-am-tier-count fp5-am-tier-count-checking font-label-code text-caption font-semibold px-2 py-0.5 rounded border shrink-0"
                  : "fp5-am-tier-count font-label-code text-caption font-medium text-on-surface-variant shrink-0"
              }
            >
              {section.countLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-surface-container-high">
        {section.rows.map((row) => (
          <ResultRow key={row.id} row={row} onOpen={() => onOpenRow(row.id)} />
        ))}
      </div>
    </section>
  );
}

function ResultRow({ row, onOpen }: { row: Fp5ResultRow; onOpen: () => void }) {
  const axle = formatAxleTag(row.positionLabel || null);
  const copyNumber = () => {
    if (row.partNumberCopy && row.partNumberCopy !== "—") {
      void navigator.clipboard.writeText(row.partNumberCopy);
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="fp5-am-row p-space-lg hover:bg-surface-container-low/50 cursor-pointer text-left w-full"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 fp5-am-row-tags">
            <span className="font-body-md font-semibold text-on-surface">{row.partName}</span>
            <button
              type="button"
              className="fp5-am-part-number group inline-flex items-center gap-1.5 font-label-code text-caption font-medium px-2 py-0.5 rounded border border-outline-variant/50 bg-surface-container-low text-on-surface hover:bg-surface-container"
              title="Click to copy part number"
              onClick={(e) => {
                e.stopPropagation();
                copyNumber();
              }}
            >
              <span className="fp5-am-wrap">{row.brandLabel} {row.partNumber}</span>
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant group-hover:text-on-surface">content_copy</span>
            </button>
            <span className="fp5-am-type-tag font-caption text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-outline-variant/40 bg-surface-container-low text-on-surface-variant">
              {row.typeTag}
            </span>
            {axle ? (
              <span className="font-caption text-[10px] px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-medium">
                {axle}
              </span>
            ) : null}
          </div>
          <div className="relative inline-block max-w-full fp5-am-has-tooltip">
            <div className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant py-0.5 min-w-0">
              <span className="material-symbols-outlined text-[16px] shrink-0 text-outline">link</span>
              <span className="fp5-am-why-line fp5-am-wrap">{row.whyLine}</span>
            </div>
            <div className="fp5-am-tooltip fp5-am-tooltip-bubble" role="tooltip">
              <div className="font-label-code text-caption space-y-0.5">
                <div><span className="text-on-surface-variant">Your car:</span> {row.whyTooltipCar}</div>
                <div><span className="text-on-surface-variant">This part:</span> {row.whyTooltipPart}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-space-md shrink-0 self-end md:self-center">
          {row.statusChip === "checking" ? (
            <div className="relative fp5-am-has-tooltip">
              <span className="fp5-am-status fp5-am-status-checking inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-caption font-medium">
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                <span>Roam is checking</span>
              </span>
              <div className="fp5-am-tooltip fp5-am-tooltip-bubble fp5-am-tooltip-right" role="tooltip">
                <span>Roam is confirming this match. You can still use the number.</span>
              </div>
            </div>
          ) : (
            <span className="fp5-am-status fp5-am-status-confirmed inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-caption font-medium">
              <span className="fp5-am-dot fp5-am-dot-confirmed w-1.5 h-1.5" aria-hidden />
              <span>Confirmed</span>
            </span>
          )}
          <span className="fp5-am-view-details font-body-sm text-body-sm font-medium text-on-surface-variant inline-flex items-center gap-1">
            <span>View details</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </span>
        </div>
      </div>
    </div>
  );
}
