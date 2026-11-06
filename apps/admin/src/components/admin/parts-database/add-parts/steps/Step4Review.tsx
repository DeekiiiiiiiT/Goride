// Stitch AP8 — review sentence with styled brand, count, OE chip
import { useQuery } from "@tanstack/react-query";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import { fetchRecentSelfServeParts, type SelfServePreview } from "../addPartsApi";
import {
  ADD_PARTS_VERIFIED_CHIP,
  ADD_PARTS_VERIFIED_CHIP_COMPACT,
  PartTypeIcon,
  pickLatestAdaptationExamples,
  reviewReachCount,
  reviewTradeTermPhrase,
  technicalProfileLines,
  trustLabelFromSource,
  type RecentSelfServeRow,
} from "../addPartsShared";
import { PartsButton } from "../../PartsButton";

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
      <PartsButton variant="secondary" className="shrink-0" onClick={onEdit}>
        Edit
      </PartsButton>
    </div>
  );
}

function fitDetailLines(draft: AddPartsDraft, preview: SelfServePreview | null): string[] {
  const structured = preview?.fitSummaryStructured;
  const lines: string[] = [];
  const positionLabel = structured?.positionLabel ?? (() => {
    const pos = draft.position || draft.listings[0]?.position;
    if (!pos) return null;
    const scheme = draft.partType?.positionScheme;
    if (pos === "front" && (scheme === "axle" || scheme === "axle_inner_outer")) return "Front Axle";
    if (pos === "rear" && (scheme === "axle" || scheme === "axle_inner_outer")) return "Rear Axle";
    if (pos === "before_cat") return "Before catalytic converter";
    if (pos === "after_cat") return "After catalytic converter";
    return pos;
  })();
  const yearsLabel = structured?.modelYearsLabel;
  const vehicleSummary = structured?.vehicleSummary;
  if (positionLabel) lines.push(`Position: ${positionLabel}`);
  if (yearsLabel) lines.push(`Model years: ${yearsLabel}`);
  if (vehicleSummary) lines.push(vehicleSummary);
  else {
    const summary = preview?.fitSummaryLines ?? [];
    if (summary.length) {
      for (const line of summary) lines.push(String(line));
    } else if (draft.fitMode === "specific") {
      for (const l of draft.listings.slice(0, 8)) lines.push(l.label ?? l.vehicleId);
      if (draft.listings.length > 8) lines.push(`+ ${draft.listings.length - 8} more`);
    }
  }
  if (!lines.length) lines.push("Add cars or engine/spec fit on step 2.");
  return lines;
}

function trustLine(row: RecentSelfServeRow) {
  const trust = String(row.trustLabel ?? "");
  const verified = trust.toLowerCase().includes("verified");
  const host = String(row.sourceHost ?? "");
  const url = String(row.evidenceUrl ?? "");
  return (
    <div className="flex items-center gap-1.5 font-mono-sm text-[11px] text-secondary flex-wrap">
      {verified ? (
        <span className={ADD_PARTS_VERIFIED_CHIP_COMPACT}>Verified</span>
      ) : (
        <span className="text-[#b45309] font-semibold">Needs checking</span>
      )}
      {host ? (
        <>
          <span>·</span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {host}
              <MaterialIcon name="north_east" className="text-[13px]" />
            </a>
          ) : (
            <span className="text-on-surface-variant">{host}</span>
          )}
        </>
      ) : null}
    </div>
  );
}

function AdaptationCard({
  variantLabel,
  dotClass,
  row,
  emptyMessage,
}: {
  variantLabel: string;
  dotClass: string;
  row: RecentSelfServeRow | null;
  emptyMessage: string;
}) {
  const sentence = row ? String(row.plainWordsSentence ?? row.sentence ?? "") : "";
  const hint = row ? String(row.vehicleHint ?? row.fitSummary ?? "") : "";
  return (
    <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-space-sm min-h-[140px]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono-sm text-[10px] text-secondary font-semibold tracking-wider uppercase">{variantLabel}</span>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        </div>
        {sentence ? (
          <p className="font-body-md text-on-surface font-medium leading-snug">“{sentence}”</p>
        ) : (
          <p className="font-body-sm text-on-surface-variant italic">{emptyMessage}</p>
        )}
      </div>
      {row && sentence ? (
        <div className="flex flex-col gap-1 pt-2 bg-surface-container-lowest">
          {trustLine(row)}
          {hint ? <p className="font-body-sm text-[12px] text-outline truncate">{hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function PlainWordsSentence({
  draft,
  preview,
}: {
  draft: AddPartsDraft;
  preview: SelfServePreview | null;
}) {
  const nounFallback = reviewTradeTermPhrase(draft, preview);
  const carCount = reviewReachCount(draft, preview) ?? 0;
  const oe = draft.factoryNumbers[0];
  const trust = preview?.trustLabel ?? trustLabelFromSource(draft.sourceType);
  const verified = trust.startsWith("Verified");

  return (
    <>
      <p className="font-headline-lg text-on-surface font-medium text-[22px] leading-[30px] tracking-tight">
        <span className="text-primary font-semibold">
          {draft.brand} {draft.partNumber}
        </span>{" "}
        is a {nounFallback}. It fits{" "}
        <span className="font-semibold text-on-surface underline decoration-primary/40 underline-offset-4 decoration-2">
          {carCount} car{carCount === 1 ? "" : "s"}
        </span>
        {oe ? (
          <>
            {" "}
            and replaces {oe.brand} factory number{" "}
            <span className="font-mono-md bg-surface-container px-1.5 py-0.5 rounded text-on-surface">{oe.number}</span>
          </>
        ) : null}
        .
      </p>
      <div className="flex flex-wrap items-center gap-space-md pt-2">
        {verified ? (
          <div className={ADD_PARTS_VERIFIED_CHIP}>
            <MaterialIcon name="verified_user" className="text-[15px]" filled />
            Verified Direct Match
          </div>
        ) : null}
        {draft.evidenceUrl ? (
          <a
            href={draft.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono-sm text-[11px] text-primary hover:underline"
          >
            Source: {draft.evidenceUrl.replace(/^https?:\/\//, "").split("/")[0]}
            <MaterialIcon name="north_east" className="text-[13px]" />
          </a>
        ) : null}
      </div>
    </>
  );
}

export function Step4Review({
  draft,
  preview,
  onEditStep,
  onOpenRecentlyAdded,
}: {
  draft: AddPartsDraft;
  preview: SelfServePreview | null;
  onEditStep: (step: 1 | 2 | 3) => void;
  onOpenRecentlyAdded?: () => void;
}) {
  const recentQuery = useQuery({ queryKey: ["self-serve-recent"], queryFn: fetchRecentSelfServeParts });
  const { engine, spec } = pickLatestAdaptationExamples((recentQuery.data?.items ?? []) as RecentSelfServeRow[]);
  const engineTypeName = engine ? String(engine.partTypeName ?? "Engine fit") : "Engine fit";
  const specTypeName = spec ? String(spec.partTypeName ?? "Spec fit") : "Spec fit";

  const madeLabel = draft.madeByCarMaker === true ? "Genuine OEM" : draft.madeByCarMaker === false ? "Aftermarket OE-Spec" : "Part identity";
  const oeLines = draft.factoryNumbers.length
    ? draft.factoryNumbers.map((f) => `${f.brand} ${f.number}`)
    : ["No factory numbers added"];
  const reach = reviewReachCount(draft, preview);
  const fitBadgeCount = reach;
  const profileTrust = preview?.trustLabel ?? trustLabelFromSource(draft.sourceType);
  const profileLines = technicalProfileLines(draft);

  return (
    <div className="flex flex-col gap-space-lg max-w-[880px] mx-auto w-full">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Check it reads right</h1>
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
        </div>
        <PlainWordsSentence draft={draft} preview={preview} />
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

      <div className="flex flex-col gap-space-sm pt-4">
        <div className="flex items-center justify-between px-1">
          <span className="font-label-xs uppercase tracking-wider text-secondary font-bold">Dynamic Engine Adaptation Previews</span>
          <span className="font-mono-sm text-[11px] text-outline">MATCHING_BRAIN · v4.8 SIMULATION</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <AdaptationCard
            variantLabel={`Variant: By Engine (${engineTypeName})`}
            dotClass="bg-amber-600"
            row={engine}
            emptyMessage="No saved by-engine example yet."
          />
          <AdaptationCard
            variantLabel={`Variant: By Size or Spec (${specTypeName})`}
            dotClass="bg-indigo-600"
            row={spec}
            emptyMessage="No saved by-spec example yet."
          />
        </div>
      </div>

      <div className="bg-surface-container-low p-space-md rounded-xl flex items-start gap-space-md">
        <MaterialIcon name="lock_clock" className="text-secondary text-[20px] shrink-0 mt-0.5" />
        <div className="flex flex-col">
          <span className="font-label-md text-on-surface font-semibold">Catalogue Governance &amp; Immediate Visibility</span>
          <p className="font-body-sm text-secondary">
            After saving, Roam Fleet users will see it in{" "}
            <span className="text-on-surface font-medium">Find parts for these cars</span>. Reversible within 24 hours from{" "}
            {onOpenRecentlyAdded ? (
              <PartsButton variant="secondary" className="inline-flex min-h-[32px] h-8 px-2 align-baseline" onClick={onOpenRecentlyAdded}>
                Recently added
              </PartsButton>
            ) : (
              <span className="text-primary underline">Recently added</span>
            )}{" "}
            log without database lockdown.
          </p>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center justify-between gap-space-md flex-wrap">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary">
            <PartTypeIcon iconKey={draft.partType?.iconKey} className="text-[28px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-md text-on-surface font-semibold">Technical Profile Match Confirmation</span>
            <span className="font-mono-sm text-[11px] text-secondary">{profileLines.join(" · ")}</span>
          </div>
        </div>
        <span className={`${ADD_PARTS_VERIFIED_CHIP} shrink-0 max-w-[220px] text-center`}>{profileTrust}</span>
      </div>
    </div>
  );
}
