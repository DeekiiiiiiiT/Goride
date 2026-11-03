import { useMemo, type ReactNode } from "react";
import { formatAxleTag } from "@roam/types/partPositionNorm";
import type { Fp5ResultRow, Fp5ViewModel } from "../findPartsViewModels";
import { FindPartsStickyHeader } from "../FindPartsStickyHeader";
import { FpNowOnFileNotice } from "./FpNowOnFileNotice";
import { FP5_BACK_TO_AREA_LABEL, formatCatalogResolvedNoticeLine } from "../findPartsViewModels";

export type Fp5Actions = {
  onAskRoam: () => void;
  onOpenRow: (id: string) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  /** Used by Fp12 mobile layout only */
  onOpenBest?: () => void;
  onEditPartCategory?: () => void;
  children?: ReactNode;
};

export function Fp5Screen({
  actions,
  data,
  partName,
  positionTrail,
  catalogNotice,
  catalogResolvedAt,
}: {
  actions: Fp5Actions;
  data: Fp5ViewModel;
  partName?: string;
  positionTrail?: string;
  catalogNotice?: string;
  catalogResolvedAt?: unknown;
}) {
  const titlePart = partName || data.componentTitle || "Part";
  const sections = useMemo(() => (data.tierSections.length ? data.tierSections : []), [data.tierSections]);

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root">
        <div className="flex flex-col w-full gap-space-xl py-space-xl">
          <FindPartsStickyHeader
            step={5}
            onBack={actions.onBackToPartSelection}
            vehicleLabel={data.vehicleLabel}
            plate={data.plate}
            versionTag={data.trimBadge || data.trimLabel}
            partTrailLabel={titlePart}
            resultsTrailLabel={positionTrail || titlePart}
          />
          <FpNowOnFileNotice
            message={catalogNotice || ""}
            batchCount={catalogNotice ? data.matchCount : undefined}
            resolvedLine={
              catalogNotice ? formatCatalogResolvedNoticeLine(catalogResolvedAt) || undefined : undefined
            }
          />

          <section className="rounded-[0.5rem] border border-surface-container-high bg-surface-container-lowest p-space-lg">
            <div className="flex flex-wrap items-start justify-between gap-space-md">
              <div>
                <p className="font-headline-md text-headline-md font-bold">{titlePart}</p>
                <p className="font-body-sm text-on-surface-variant mt-1">
                  {data.vehicleLabel} · {data.plate} · {data.chassisCodeLabel}
                </p>
                <p className="font-caption text-caption text-on-surface-variant mt-2">
                  Choice trail: {data.plate} › {titlePart} › {positionTrail || "—"}
                </p>
              </div>
              <button type="button" className="text-primary font-body-sm font-semibold" onClick={actions.onChangeCar}>
                Change car
              </button>
            </div>
          </section>

          <h2 className="font-headline-md font-bold px-1">Structured Match Categories</h2>

          <section className="rounded-[0.5rem] bg-surface-container-low p-space-md">
            <p className="font-caption text-caption uppercase tracking-wider text-on-surface-variant">Identified subsystem</p>
            <p className="font-headline-sm font-bold mt-1">Your requests {data.requestCount ?? data.matchCount}</p>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Roam found these from shared parts and is still confirming them where noted. Every row shows why it fits in plain English.
            </p>
            <button type="button" className="mt-2 text-primary font-body-sm font-medium" onClick={actions.onAskRoam}>
              Need a part not listed? Ask Roam to add it →
            </button>
          </section>

          <div className="flex flex-col gap-space-lg">
            {sections.map((section) => (
              <div
                key={section.tier}
                className={`rounded-[0.5rem] shadow-sm overflow-hidden border-l-4 ${section.allChecking ? "bg-amber-500/10 border-amber-500" : "bg-surface-container-lowest"}`}
                style={{ borderLeftColor: section.allChecking ? undefined : section.accentColor }}
              >
                <div className="p-space-md flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-headline-sm font-bold">{section.heading}</span>
                    <span className="ml-2 font-caption text-caption">{section.countLabel}</span>
                  </div>
                  <span className="font-body-sm text-on-surface-variant">{section.description}</span>
                </div>
                {section.allChecking ? (
                  <p className="px-space-md pb-2 text-sm text-amber-800 dark:text-amber-200">
                    {section.count} unconfirmed candidates in this tier.
                  </p>
                ) : null}
                {section.rows.map((row) => (
                  <Row key={row.id} row={row} onOpen={() => actions.onOpenRow(row.id)} />
                ))}
              </div>
            ))}
          </div>

          <footer className="text-center font-caption text-caption text-on-surface-variant pt-space-lg border-t border-surface-container-high">
            Roam Fleet Match Intelligence Engine · {data.hubLabel}
            <br />
            Non-commercial parts encyclopedia · Zero pricing or procurement bias
          </footer>
        </div>
      </div>
    </div>
  );
}

function Row({ row, onOpen }: { row: Fp5ResultRow; onOpen: () => void }) {
  const axle = formatAxleTag(row.positionLabel || null);
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full text-left border-t border-surface-container-high px-space-lg py-space-md hover:bg-surface-container-low/40 cursor-pointer"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-body-md font-bold">{row.partName}</span>
        <span className="font-mono-sm text-primary">{row.brandLabel}</span>
        <button
          type="button"
          className="font-mono-sm px-2 py-0.5 rounded bg-surface-container text-primary"
          onClick={(e) => {
            e.stopPropagation();
            if (row.partNumber && row.partNumber !== "—") void navigator.clipboard.writeText(row.partNumber);
          }}
        >
          {row.partNumber}
        </button>
        <span className="px-2 py-0.5 rounded bg-surface-container text-caption font-semibold">{row.typeTag}</span>
        <span className="px-2 py-0.5 rounded bg-surface-container text-caption">{axle}</span>
        <span
          className={`px-2 py-0.5 rounded text-caption font-semibold ${
            row.statusChip === "checking" ? "bg-amber-500/15 text-amber-900 dark:text-amber-100" : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100"
          }`}
          title={row.statusChip === "checking" ? "Roam is confirming this match. You can still use the number." : undefined}
        >
          {row.statusChip === "checking" ? "Roam is checking" : "Confirmed"}
        </span>
      </div>
      <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs rounded border border-surface-container-high bg-surface-container-low px-2 py-1.5">
        <span><strong>Your car:</strong> {row.whyTooltipCar}</span>
        <span><strong>This part:</strong> {row.whyTooltipPart}</span>
      </div>
      <p className="mt-2 font-body-sm text-on-surface-variant flex items-center gap-1 has-tooltip relative group">
        <span className="material-symbols-outlined text-[16px]">link</span>
        <span title={`${row.whyTooltipCar} · ${row.whyTooltipPart}`}>{row.whyLine}</span>
        {row.checkingNote ? <span className="text-amber-800 dark:text-amber-200"> · {row.checkingNote}</span> : null}
        <span className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden max-w-sm rounded-lg bg-slate-950 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
          {row.whyTooltipCar}
          <br />
          {row.whyTooltipPart}
        </span>
      </p>
      <span className="mt-2 inline-block text-primary font-body-sm font-semibold">View details ›</span>
    </div>
  );
}
