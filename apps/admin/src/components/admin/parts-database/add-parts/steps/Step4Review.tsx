// Stitch AP8
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import type { SelfServePreview } from "../addPartsApi";
import { trustLabelFromSource } from "../addPartsShared";

function ReviewBlock({
  icon,
  title,
  badge,
  lines,
  onEdit,
}: {
  icon: string;
  title: string;
  badge?: string;
  lines: string[];
  onEdit: () => void;
}) {
  return (
    <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between hover:bg-surface-container-low transition-colors group gap-4">
      <div className="flex items-start gap-space-md min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
          <MaterialIcon name={icon} className="text-[20px]" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-sm flex-wrap">
            <span className="font-label-md text-label-md text-on-surface font-semibold">{title}</span>
            {badge ? (
              <span className="font-mono-sm text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">{badge}</span>
            ) : null}
          </div>
          <ul className="pt-1 font-body-sm text-on-surface-variant space-y-0.5 list-none m-0 p-0">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        className="px-space-md h-9 rounded-lg bg-primary-container text-on-primary hover:opacity-90 font-label-md font-semibold transition-all shrink-0 shadow-sm"
        onClick={onEdit}
      >
        Edit
      </button>
    </div>
  );
}

function positionLabelFromDraft(draft: AddPartsDraft): string | null {
  const pos = draft.position || draft.listings[0]?.position;
  if (!pos) return null;
  const scheme = draft.partType?.positionScheme;
  if (pos === "front" && (scheme === "axle" || scheme === "axle_inner_outer")) return "Front Axle";
  if (pos === "rear" && (scheme === "axle" || scheme === "axle_inner_outer")) return "Rear Axle";
  if (pos === "before_cat") return "Before catalytic converter";
  if (pos === "after_cat") return "After catalytic converter";
  return pos;
}

function fitDetailLines(draft: AddPartsDraft, preview: SelfServePreview | null): string[] {
  const structured = preview?.fitSummaryStructured;
  const lines: string[] = [];

  const positionLabel = structured?.positionLabel ?? positionLabelFromDraft(draft);
  const yearsLabel = structured?.modelYearsLabel;
  const vehicleSummary = structured?.vehicleSummary;

  if (positionLabel) lines.push(`Position: ${positionLabel}`);
  if (yearsLabel) lines.push(`Model years: ${yearsLabel}`);

  if (vehicleSummary) {
    lines.push(vehicleSummary);
  } else {
    const summary = preview?.fitSummaryLines ?? [];
    if (summary.length) {
      for (const line of summary) lines.push(String(line));
    } else if (draft.fitMode === "specific") {
      for (const l of draft.listings.slice(0, 8)) {
        lines.push(l.label ?? l.vehicleId);
      }
      if (draft.listings.length > 8) lines.push(`+ ${draft.listings.length - 8} more`);
    }
  }

  if (!lines.length) lines.push("Add cars or engine/spec fit on step 2.");
  return lines;
}

export function Step4Review({
  draft,
  preview,
  onEditStep,
}: {
  draft: AddPartsDraft;
  preview: SelfServePreview | null;
  onEditStep: (step: 1 | 2 | 3) => void;
}) {
  const trade = draft.partType?.tradeTerm;
  const pos = draft.position || draft.listings[0]?.position;
  const nounFallback =
    trade && pos && !trade.startsWith(pos)
      ? `${pos} ${trade}`
      : trade ?? draft.partType?.name?.toLowerCase() ?? "part";
  const sentence =
    preview?.sentence ??
    `${draft.brand} ${draft.partNumber} is a ${nounFallback}.`;
  const trust = preview?.trustLabel ?? trustLabelFromSource(draft.sourceType);
  const madeLabel = draft.madeByCarMaker === true ? "Genuine OEM" : draft.madeByCarMaker === false ? "Aftermarket OE-Spec" : "Part identity";
  const oeLines = draft.factoryNumbers.length
    ? draft.factoryNumbers.map((f) => `${f.brand} ${f.number}`)
    : ["No factory numbers added"];
  const fitBadgeCount = draft.fitMode === "specific" ? draft.listings.length : preview?.carCount;

  return (
    <div className="flex flex-col gap-space-lg max-w-[880px] mx-auto w-full">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline-xl text-on-surface tracking-tight">Check it reads right</h1>
        <p className="font-body-md text-on-surface-variant">
          We turned your answers into plain English. Review before saving to the master database.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-6 shadow-md relative overflow-hidden flex flex-col gap-space-md">
        <div className="absolute -right-16 -top-16 w-52 h-52 rounded-full bg-primary/5 pointer-events-none" />
        <div className="flex items-start justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 bg-surface-container-low px-2.5 py-1 rounded text-primary font-mono-sm text-[11px] font-semibold">
            <MaterialIcon name="auto_awesome" className="text-[14px]" />
            <span>Plain words</span>
          </div>
          <span className="font-mono-sm text-on-surface-variant text-[11px]">{trust}</span>
        </div>
        <p className="font-headline-lg text-on-surface font-medium text-[22px] leading-[30px] tracking-tight">{sentence}</p>
        {draft.evidenceUrl ? (
          <a
            href={draft.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono-sm text-[11px] text-primary hover:underline w-fit"
          >
            <span>Source: {draft.evidenceUrl.replace(/^https?:\/\//, "").split("/")[0]}</span>
            <MaterialIcon name="north_east" className="text-[13px]" />
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-space-sm">
        <ReviewBlock
          icon="inventory_2"
          title="Part details"
          badge={madeLabel}
          lines={[
            `Brand: ${draft.brand || "—"}`,
            `Part No: ${draft.partNumber || "—"}`,
            draft.partType?.name ?? "Part type",
          ]}
          onEdit={() => onEditStep(1)}
        />
        <ReviewBlock
          icon="hub"
          title="How it fits"
          badge={fitBadgeCount != null ? `${fitBadgeCount} car version(s)` : undefined}
          lines={fitDetailLines(draft, preview)}
          onEdit={() => onEditStep(2)}
        />
        {draft.fitMode !== "spec" ? (
          <ReviewBlock
            icon="sync_alt"
            title="Factory numbers"
            badge={draft.factoryNumbers.length ? "OE interchange" : "Optional"}
            lines={oeLines}
            onEdit={() => onEditStep(3)}
          />
        ) : null}
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md border border-outline-variant/30 font-body-sm text-on-surface-variant">
        After saving, Roam Fleet users will see it in{" "}
        <span className="text-on-surface font-medium">Find parts for these cars</span>. Reversible within 24 hours from{" "}
        <span className="text-on-surface font-medium">Recently added</span> without database lockdown.
      </div>
    </div>
  );
}
