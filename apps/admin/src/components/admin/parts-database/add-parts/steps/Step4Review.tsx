// Stitch AP8 — review sentence with styled brand, count, OE chip + Dominion trust summary
import { useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import type { SelfServePreview } from "../addPartsApi";
import {
  ADD_PARTS_VERIFIED_CHIP,
  PartTypeIcon,
  reviewReachCount,
  reviewTradeTermPhrase,
  technicalProfileLines,
  effectiveTrustLabel,
  isVerifiedTrustLabel,
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

function hostFromEvidence(url: string): string {
  if (!url.trim()) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
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
  const trust = effectiveTrustLabel(preview?.trustLabel, draft.sourceType);
  const verified = isVerifiedTrustLabel(preview?.trustLabel, draft.sourceType);
  const specificConfirmed = draft.fitMode === "specific"
    ? draft.listings.filter((l) => l.listingTrust === "confirmed").length
    : null;
  const specificNeeds = draft.fitMode === "specific"
    ? draft.listings.filter((l) => l.listingTrust === "needs_checking").length
    : null;

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
      {draft.fitMode === "specific" && draft.listings.length ? (
        <p className="font-body-md text-on-surface-variant pt-2">
          Per-car trust:{" "}
          <span className="font-semibold text-on-surface">{specificConfirmed}</span> confirmed
          {specificNeeds != null && specificNeeds > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-amber-800 dark:text-amber-200">{specificNeeds}</span> needs checking
            </>
          ) : null}
          .
        </p>
      ) : null}
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

function yearsFromListingLabel(label: string | undefined | null): { from?: number; to?: number } {
  const t = String(label ?? "").trim();
  const closed = t.match(/(\d{4})[–\-](\d{4})(?!\d)/);
  if (closed) return { from: Number(closed[1]), to: Number(closed[2]) };
  const open = t.match(/(\d{4})[–\-]\s*$/);
  if (open) return { from: Number(open[1]), to: undefined };
  return {};
}

function yearsFromFitSummaryLine(line: string): { from?: number; to?: number } {
  const present = line.match(/(\d{4})[–\-]present/i);
  if (present) return { from: Number(present[1]), to: undefined };
  const closed = line.match(/(\d{4})[–\-](\d{4})(?!\d)/);
  if (closed) return { from: Number(closed[1]), to: Number(closed[2]) };
  return {};
}

function fitSummaryLineForListing(
  l: { label?: string | null },
  lines: string[] | undefined,
): string | undefined {
  if (!lines?.length) return undefined;
  const parts = String(l.label ?? "").trim().split(/\s+/).filter(Boolean);
  const make = parts[0];
  const model = parts[1];
  if (!make || !model) return undefined;
  return lines.find((s) => s.includes(make) && s.includes(model));
}

function NeedsCheckingTable({ draft, preview }: { draft: AddPartsDraft; preview: SelfServePreview | null }) {
  const rawLines = preview?.fitSummaryLines;
  const summaryLines = Array.isArray(rawLines) ? rawLines.map((x) => String(x)) : [];
  const modelYearsFallback = preview?.fitSummaryStructured?.modelYearsLabel;
  const rows = draft.listings.filter((l) => l.listingTrust === "needs_checking");
  const [open, setOpen] = useState(rows.length > 0);

  if (!rows.length) return null;

  function yearLabel(l: (typeof rows)[0]) {
    const a = l.yearFrom;
    const b = l.yearTo;
    if (a != null && b != null) return `${a}–${b}`;
    if (a != null) return `${a}–`;
    const p = yearsFromListingLabel(l.label);
    if (p.from != null && p.to != null) return `${p.from}–${p.to}`;
    if (p.from != null) return `${p.from}–`;
    const fitLine = fitSummaryLineForListing(l, summaryLines);
    if (fitLine) {
      const fy = yearsFromFitSummaryLine(fitLine);
      if (fy.from != null && fy.to != null) return `${fy.from}–${fy.to}`;
      if (fy.from != null) return `${fy.from}–`;
    }
    if (modelYearsFallback && rows.length === 1) return modelYearsFallback;
    return "—";
  }

  return (
    <div className="rounded-xl border border-amber-800/25 dark:border-amber-400/30 bg-amber-900/5 dark:bg-amber-400/10 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-space-md py-3 text-left hover:bg-amber-900/5 dark:hover:bg-amber-400/5 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="font-label-md font-semibold text-on-surface">
          Needs checking ({rows.length})
        </span>
        <MaterialIcon name={open ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {open ? (
        <div className="border-t border-amber-800/20 dark:border-amber-400/20 overflow-x-auto">
          <table className="w-full text-left font-body-sm">
            <thead>
              <tr className="text-on-surface-variant font-mono-sm text-[11px] uppercase tracking-wide">
                <th className="px-space-md py-2 font-medium">Car</th>
                <th className="px-space-md py-2 font-medium">Chassis</th>
                <th className="px-space-md py-2 font-medium">Years</th>
                <th className="px-space-md py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const parts = String(l.label ?? "").trim().split(/\s+/).filter(Boolean);
                const make = parts[0] ?? "";
                const model = parts[1] ?? "";
                const chassis = parts.length >= 3 ? (parts[2] ?? "—") : "—";
                const carLabel = [make, model].filter(Boolean).join(" ") || "—";
                return (
                  <tr key={l.vehicleId} className="border-t border-outline-variant/30">
                    <td className="px-space-md py-2 text-on-surface font-medium">{carLabel}</td>
                    <td className="px-space-md py-2 font-mono-sm text-mono-sm text-on-surface-variant">{chassis}</td>
                    <td className="px-space-md py-2 font-mono-sm text-mono-sm tabular-nums">{yearLabel(l)}</td>
                    <td className="px-space-md py-2 text-amber-950 dark:text-amber-100 max-w-[280px]">{String(l.reason ?? "").trim() || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ConfirmedFromSourceRow({ draft }: { draft: AddPartsDraft }) {
  if (draft.fitMode !== "specific") return null;
  const host = hostFromEvidence(draft.evidenceUrl);
  const count = draft.listings.filter((l) => l.listingTrust === "confirmed").length;
  if (!count || !host) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 px-space-md py-3 rounded-xl bg-surface-container-low border border-outline-variant/40">
      <span className={ADD_PARTS_VERIFIED_CHIP}>
        <MaterialIcon name="verified_user" className="text-[15px]" filled />
        Confirmed from {host} ({count})
      </span>
    </div>
  );
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
  const madeLabel = draft.madeByCarMaker === true ? "Genuine OEM" : draft.madeByCarMaker === false ? "Aftermarket OE-Spec" : "Part identity";
  const oeLines = draft.factoryNumbers.length
    ? draft.factoryNumbers.map((f) => `${f.brand} ${f.number}`)
    : ["No factory numbers added"];
  const reach = reviewReachCount(draft, preview);
  const fitBadgeCount = reach;
  const profileTrust = effectiveTrustLabel(preview?.trustLabel, draft.sourceType);
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

      {draft.fitMode === "specific" ? (
        <div className="flex flex-col gap-space-sm">
          <NeedsCheckingTable draft={draft} preview={preview} />
          <ConfirmedFromSourceRow draft={draft} />
        </div>
      ) : null}

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

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center justify-between gap-space-md flex-wrap">
        <div className="flex items-center gap-space-md min-w-0">
          <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary">
            <PartTypeIcon iconKey={draft.partType?.iconKey} className="text-[28px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-md text-on-surface font-semibold">Technical Profile Match Confirmation</span>
            <span className="font-mono-sm text-[11px] text-on-surface-variant">{profileLines.join(" · ")}</span>
          </div>
        </div>
        <span className={`${ADD_PARTS_VERIFIED_CHIP} shrink-0 max-w-[220px] text-center`}>{profileTrust}</span>
      </div>
    </div>
  );
}
