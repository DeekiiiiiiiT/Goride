import React from "react";
import { Check, NotebookPen } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { LogServiceOemMatchSummary } from "./logServiceOemMatchSummary";

export function LogServiceLineDetailsMultiStep({
  packageLabel,
  componentCount,
  baySessionLabel,
  configuredCount,
  subtotalLabel,
  mechanicNote,
  onMechanicNoteChange,
  homeBase,
  oemMatch,
  children,
}: {
  packageLabel?: string | null;
  componentCount: number;
  baySessionLabel: string;
  configuredCount: number;
  subtotalLabel: string;
  mechanicNote: string;
  onMechanicNoteChange: (v: string) => void;
  homeBase?: string | null;
  oemMatch: LogServiceOemMatchSummary;
  children: React.ReactNode;
}) {
  const allConfigured = componentCount > 0 && configuredCount >= componentCount;
  const showOemSuffix = oemMatch.replaceLineCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1">
        <div>
          <span className="text-[11px] text-stitch-secondary uppercase tracking-wider font-semibold">
            {LOG_SERVICE_COPY.wizardEyebrow}
          </span>
          <h2 className="text-2xl font-semibold text-on-surface mt-0.5">
            {LOG_SERVICE_COPY.lineDetailsTitle}
            {packageLabel ? ` — ${packageLabel}` : ""}
          </h2>
          <p className="text-sm text-stitch-secondary mt-1">{LOG_SERVICE_COPY.lineDetailsSubtitle}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {packageLabel ? (
            <span className="inline-flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg text-sm font-semibold text-on-surface">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {packageLabel} ({componentCount} components)
            </span>
          ) : null}
          <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2 py-1 rounded">
            {LOG_SERVICE_COPY.baySessionLabel}
            {baySessionLabel}
          </span>
        </div>
      </div>

      <div className="space-y-4">{children}</div>

      <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-on-surface flex flex-wrap items-center gap-x-1">
          <span className="font-semibold">{configuredCount} lines configured</span>
          {showOemSuffix ? (
            oemMatch.cleared ? (
              <span className="text-stitch-secondary uppercase text-xs tracking-wide">
                {" · "}
                {LOG_SERVICE_COPY.oemMatchClearedSuffix}
              </span>
            ) : (
              <span className="text-amber-600 uppercase text-xs tracking-wide font-semibold">
                {" · "}
                {LOG_SERVICE_COPY.linesWithoutVerifiedPartSuffix(oemMatch.missingVerifiedCount)}
              </span>
            )
          ) : null}
        </div>
        <span className="text-sm font-semibold text-on-surface">{subtotalLabel}</span>
      </div>

      <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="log-service-mechanic-note"
            className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide flex items-center gap-1.5"
          >
            <NotebookPen className="w-4 h-4" />
            {LOG_SERVICE_COPY.mechanicNoteLabel}
          </label>
          <span className="text-xs text-stitch-secondary">
            {LOG_SERVICE_COPY.mechanicNoteOptionalHint(homeBase)}
          </span>
        </div>
        <textarea
          id="log-service-mechanic-note"
          className="w-full min-h-[72px] rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-outline resize-none"
          value={mechanicNote}
          onChange={(e) => onMechanicNoteChange(e.target.value)}
          placeholder={LOG_SERVICE_COPY.mechanicNotePlaceholder}
          rows={2}
        />
      </div>

      {allConfigured ? (
        <p className="text-xs text-stitch-secondary flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-primary" /> All lines saved — continue to review when ready.
        </p>
      ) : null}
    </div>
  );
}
