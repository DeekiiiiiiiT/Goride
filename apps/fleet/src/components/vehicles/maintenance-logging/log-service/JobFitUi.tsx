/**
 * Log service job-fit pieces, ported from Stitch docs/stitch/powertrain-job-fit-fleet/html/01–10
 * (owner's picks 15 Nov: screen 01 wide group tiles, screen 03 job rows).
 * Amber is kept for "High-voltage" alone; "Not usual for this car" is grey (audit section 4).
 */
import React from "react";
import { AlertTriangle, BadgeCheck, Eye, EyeOff, Filter, HelpCircle, Info, Link2, RefreshCw, Zap } from "lucide-react";

export function NotUsualChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-outline-variant/60 bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-on-surface-variant ${className}`}
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
      className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-[#f5d48a] bg-[#fff4dc] px-2 py-0.5 text-[11px] font-semibold text-[#8a5a00] dark:border-[#92400e] dark:bg-[#451a03] dark:text-[#fbbf24] ${className}`}
      data-testid="chip-high-voltage"
    >
      <Zap className="h-3 w-3 fill-current" aria-hidden />
      High-voltage
    </span>
  );
}

/** Stitch 01 / 10: "Showing jobs that fit this car" strip above the group tiles. */
export function FitBanner({ pill }: { pill: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg bg-surface-container-low px-4 py-2.5 text-sm text-on-surface"
      data-testid="banner-fit"
    >
      <BadgeCheck className="h-4 w-4 shrink-0 text-[#006c49] dark:text-[#4ade80]" aria-hidden />
      <span>
        Showing jobs that fit this car (<strong className="font-semibold">{pill}</strong>). Jobs that don&apos;t fit are hidden.
      </span>
    </div>
  );
}

/** Stitch 09 state 03: a group with no fitting jobs is removed and the grid closes up. */
export function GroupsRemovedCaption({ names, hidden }: { names: string[]; hidden: number }) {
  if (names.length === 0) return null;
  const list = names.map((n) => `"${n}"`).join(", ");
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-[13px] text-on-surface ring-1 ring-outline-variant/30"
      data-testid="caption-groups-removed"
    >
      <span className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-[#006c49] dark:text-[#4ade80]" aria-hidden />
        {list} {names.length === 1 ? "group doesn't" : "groups don't"} fit this car
      </span>
      {hidden > 0 ? (
        <span className="rounded bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-stitch-secondary">
          {hidden} job{hidden === 1 ? "" : "s"} hidden
        </span>
      ) : null}
    </div>
  );
}

/** Stitch 05: unknown engine type: every job shown, nothing hidden. */
export function UnknownEngineBanner({ onLinkCar }: { onLinkCar?: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fdf1ea] px-4 py-3 dark:bg-[#451a03]/50"
      data-testid="banner-unknown-engine"
    >
      <p className="flex items-center gap-2.5 text-sm text-on-surface">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fde3cf] text-[#b45309] dark:bg-[#7c2d12] dark:text-[#fdba74]">
          <HelpCircle className="h-4 w-4" aria-hidden />
        </span>
        <span>
          We don&apos;t know this car&apos;s engine type yet. Showing every job.
          {!onLinkCar ? " Link the car to its model on the car's page to see only the jobs that fit." : null}
        </span>
      </p>
      {onLinkCar ? (
        <button
          type="button"
          onClick={onLinkCar}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-surface-container-lowest px-3.5 text-sm font-semibold text-on-surface shadow-sm hover:bg-surface-container-low"
        >
          <Link2 className="h-4 w-4" aria-hidden /> Link this car
        </button>
      ) : null}
    </div>
  );
}

/** Stitch 09 state 02: the fit check failed: every job shown + Try again (PT-7). */
export function CouldNotCheckBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#fff1e6] px-3 py-2.5 dark:bg-[#451a03]/50"
      data-testid="banner-could-not-check"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-[#b45309] dark:text-[#fdba74]">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Couldn&apos;t check which jobs fit this car. Showing every job.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-surface-container-lowest px-2.5 text-xs font-semibold text-on-surface shadow-sm ring-1 ring-outline-variant/40 hover:bg-surface-container-low"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
      </button>
    </div>
  );
}

/** Stitch 03: the strip above the hidden jobs once "Show all" is pressed (grey, not amber). */
export function NotUsualDivider() {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"
      role="separator"
      aria-label="Not usual for this car"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
        <Info className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <NotUsualChip />
        <p className="text-sm text-on-surface-variant">
          These jobs don&apos;t usually fit this car. You can still pick them if they were done.
        </p>
      </div>
    </div>
  );
}

/** Stitch 01 / 02: tinted full-width "Show all jobs (N hidden)"; Stitch 03: outlined "Hide jobs that don't fit". */
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
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors ${
        shown
          ? "border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
          : "bg-surface-container-low text-on-surface hover:bg-surface-container"
      }`}
      data-testid="show-all-jobs"
    >
      {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
      {shown
        ? "Hide jobs that don't fit"
        : inGroup
          ? `Show all jobs in this group (${hidden} hidden)`
          : `Show all jobs (${hidden} hidden)`}
    </button>
  );
}
