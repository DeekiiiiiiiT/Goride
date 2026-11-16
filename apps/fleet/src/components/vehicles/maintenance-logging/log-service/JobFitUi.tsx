/**
 * Log service job-fit pieces, ported from Stitch docs/stitch/powertrain-job-fit-fleet/html/01–10
 * (owner's picks 15 Nov: screen 01 wide group tiles, screen 03 job rows).
 * Amber is kept for "High-voltage" alone; "Not usual for this car" is grey (audit section 4).
 */
import React from "react";
import { LS, LT } from "./logServiceStitch";
import { AlertTriangle, BadgeCheck, Eye, EyeOff, Filter, HelpCircle, Info, Link2, RefreshCw, Zap } from "lucide-react";

export function NotUsualChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ${className}`}
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
    <div className={`flex items-center gap-2 rounded-lg py-2 px-3 ${LS.low} ${LS.muted}`} data-testid="banner-fit">
      <BadgeCheck className={`h-[18px] w-[18px] shrink-0 ${LS.green}`} aria-hidden />
      <span className={LT.bodySm}>
        Showing jobs that fit this car (<strong className={`${LT.titleSm} ${LS.text}`}>{pill}</strong>). Jobs that don&apos;t fit are hidden.
      </span>
    </div>
  );
}

/** Stitch 09 state 03: a group with no fitting jobs is removed and the grid closes up. */
export function GroupsRemovedCaption({ names, hidden }: { names: string[]; hidden: number }) {
  if (names.length === 0) return null;
  const list = names.map((n) => `"${n}"`).join(", ");
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 shadow-sm ${LS.lowest} ${LS.text} ${LT.labelMd}`} data-testid="caption-groups-removed">
      <span className="flex items-center gap-1.5">
        <Filter className={`h-3.5 w-3.5 ${LS.green}`} aria-hidden />
        {list} {names.length === 1 ? "group doesn't" : "groups don't"} fit this car
      </span>
      {hidden > 0 ? (
        <span className={`rounded px-2 py-0.5 ${LT.labelSm} ${LS.mid} ${LS.outline}`}>
          {hidden} job{hidden === 1 ? "" : "s"} hidden
        </span>
      ) : null}
    </div>
  );
}

/** Stitch 05: unknown engine type: every job shown, nothing hidden. */
export function UnknownEngineBanner({ onLinkCar }: { onLinkCar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#ffdcc3]/30 p-4 dark:bg-[#6e3900]/30" data-testid="banner-unknown-engine">
      <p className={`flex items-center gap-2 ${LT.bodyMd} ${LS.text}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#c76c00]/15 text-[#c76c00]">
          <HelpCircle className="h-[18px] w-[18px]" aria-hidden />
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
          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 shadow-sm transition-colors ${LT.titleSm} ${LS.lowest} ${LS.text} ${LS.hoverMid}`}
        >
          <Link2 className="h-[15px] w-[15px]" aria-hidden /> Link this car
        </button>
      ) : null}
    </div>
  );
}

/** Stitch 09 state 02: the fit check failed: every job shown + Try again (PT-7). */
export function CouldNotCheckBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[#ffdcc3]/40 p-2 dark:bg-[#6e3900]/30" data-testid="banner-could-not-check">
      <p className={`flex min-w-0 items-center gap-2 ${LT.labelMd} text-[#c76c00]`}>
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        Couldn&apos;t check which jobs fit this car. Showing every job.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`ml-1 flex shrink-0 items-center gap-1 rounded px-2.5 py-1 shadow-sm transition-colors ${LT.labelSm} ${LS.lowest} ${LS.text} ${LS.hoverMid}`}
      >
        <RefreshCw className="h-3 w-3" aria-hidden /> Try again
      </button>
    </div>
  );
}

/** Stitch 03: the strip above the hidden jobs once "Show all" is pressed (grey, not amber). */
export function NotUsualDivider() {
  return (
    <div
      className="flex w-full items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/40"
      role="separator"
      aria-label="Not usual for this car"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        <Info className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="flex-1">
        <NotUsualChip />
        <p className={`mt-1 leading-snug ${LT.bodySm} text-slate-600 dark:text-slate-300`}>
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
      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 transition-colors ${LT.titleSm} ${
        shown ? "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200" : `${LS.low} ${LS.hoverMid} ${LS.muted}`
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
