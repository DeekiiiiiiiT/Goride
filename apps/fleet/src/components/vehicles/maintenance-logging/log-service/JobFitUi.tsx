/**
 * Log service job-fit chips and banners (Stitch powertrain-job-fit-fleet screens 1–10).
 * Amber is kept for "High-voltage" alone; "Not usual for this car" is grey (audit section 4).
 */
import React from "react";
import { AlertTriangle, Info, Link2, RefreshCw, Zap } from "lucide-react";

export function NotUsualChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant ${className}`}
      data-testid="chip-not-usual"
    >
      <Info className="h-3 w-3" aria-hidden />
      Not usual for this car
    </span>
  );
}

export function HighVoltageChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#fff4dc] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24] ${className}`}
      data-testid="chip-high-voltage"
    >
      <Zap className="h-3 w-3 fill-current" aria-hidden />
      High-voltage
    </span>
  );
}

/** Unknown engine type: every job shown, nothing hidden. */
export function UnknownEngineBanner({ onLinkCar }: { onLinkCar?: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f5d48a] bg-[#fff8e6] px-4 py-3 dark:border-[#92400e] dark:bg-[#451a03]/60"
      data-testid="banner-unknown-engine"
    >
      <p className="flex items-start gap-2 text-sm text-[#7a4f00] dark:text-[#fbbf24]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          We don&apos;t know this car&apos;s engine type yet. Showing every job.
          {!onLinkCar ? " Link the car to its model on the car's page to see only the jobs that fit." : null}
        </span>
      </p>
      {onLinkCar ? (
        <button
          type="button"
          onClick={onLinkCar}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d9a520] bg-white px-3 text-sm font-semibold text-[#7a4f00] hover:bg-[#fff4dc] dark:bg-transparent dark:text-[#fbbf24]"
        >
          <Link2 className="h-4 w-4" aria-hidden /> Link this car
        </button>
      ) : null}
    </div>
  );
}

/** The fit check failed: every job shown + Try again (PT-7). */
export function CouldNotCheckBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error-container/30 px-4 py-3"
      data-testid="banner-could-not-check"
    >
      <p className="flex items-start gap-2 text-sm text-on-surface">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden />
        Couldn&apos;t check which jobs fit this car. Showing every job.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-error/50 bg-surface-container-lowest px-3 text-sm font-semibold text-error hover:bg-error/10"
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Try again
      </button>
    </div>
  );
}

/** "Not usual for this car" divider above the hidden jobs once "Show all" is pressed. */
export function NotUsualDivider() {
  return (
    <div className="flex items-center gap-3 pt-2" role="separator" aria-label="Not usual for this car">
      <span className="h-px flex-1 bg-outline-variant/50" />
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-stitch-secondary">
        <Info className="h-3 w-3" aria-hidden /> Not usual for this car
      </span>
      <span className="h-px flex-1 bg-outline-variant/50" />
    </div>
  );
}

/** "Show all jobs (N hidden)" ↔ "Hide jobs that don't fit" (full width on phones). */
export function ShowAllButton({
  shown,
  hidden,
  inGroup,
  onToggle,
}: {
  shown: boolean;
  hidden: number;
  inGroup?: boolean;
  onToggle: () => void;
}) {
  if (hidden === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={shown}
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-low sm:w-auto"
      data-testid="show-all-jobs"
    >
      {shown
        ? "Hide jobs that don't fit"
        : inGroup
          ? `Show all jobs in this group (${hidden} hidden)`
          : `Show all jobs (${hidden} hidden)`}
    </button>
  );
}
