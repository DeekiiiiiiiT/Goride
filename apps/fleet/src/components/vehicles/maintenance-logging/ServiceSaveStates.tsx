/**
 * Save states for a service log — Stitch service-items-fleet screens 6 (Finish saving), 7 (This service
 * was changed) and 8 (save failed). Used by the Log service wizard and Service history.
 */
import React from "react";
import { Loader2 } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../../ui/responsive-dialog";

/** Stitch amber / orange accents (service-items-fleet config); Fleet's own "secondary" is lavender. */
const AMBER = { bg: "#fff4ef", border: "#fd651e", text: "#a73a00", pill: "#ffdbce", ink: "#370e00" } as const;

export const SAVE_COPY = {
  notFinishedPill: "Not finished saving",
  notFinishedTitle: "This service saved but didn't finish. Nothing is lost.",
  finishSaving: "Finish saving",
  finishing: "Finishing…",
  stillFinishing: "Still finishing, try again in a moment.",
  couldntFinish: (why: string) => `Couldn't finish: ${why}`,
  completed: "Completed",
  viewDetails: "View details",
  saveFailedTitle: "Couldn't log this service.",
  saveFailedBody: "Nothing was saved. Your entries are kept intact so you won't lose work. Try again.",
  tryAgain: "Try again",
  changedTitle: "This service was changed",
  changedBody: "Someone saved a change to this service since you opened it. Reload to see the latest, then make your change again.",
  cancel: "Cancel",
  reload: "Reload",
} as const;

export type FinishState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "still" }
  | { kind: "failed"; why: string }
  | { kind: "done" };

export function NotFinishedPill() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: AMBER.pill, color: AMBER.text }}
    >
      <span className="material-symbols-outlined text-[14px]">sync_problem</span>
      {SAVE_COPY.notFinishedPill}
    </span>
  );
}

export function CompletedPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#85f8c4] text-[#002114]">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
      {SAVE_COPY.completed}
    </span>
  );
}

/** The amber "saved but didn't finish" note. */
export function NotFinishedNote() {
  return (
    <div className="rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ backgroundColor: AMBER.bg }}>
      <span className="material-symbols-outlined text-[18px]" style={{ color: AMBER.text }}>
        schedule
      </span>
      <span className="text-sm font-medium text-on-surface">{SAVE_COPY.notFinishedTitle}</span>
    </div>
  );
}

/** Finish saving button with its four states (screen 6). */
export function FinishSavingButton({
  state,
  onFinish,
  onView,
}: {
  state: FinishState;
  onFinish: () => void;
  onView?: () => void;
}) {
  if (state.kind === "done") {
    return onView ? (
      <button
        type="button"
        onClick={onView}
        className="bg-surface-container-low hover:bg-surface-container text-on-surface px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1"
      >
        {SAVE_COPY.viewDetails}
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    ) : (
      <CompletedPill />
    );
  }
  const busy = state.kind === "busy";
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        data-testid="finish-saving"
        disabled={busy}
        onClick={onFinish}
        className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 text-white ${
          busy ? "bg-[#47464c]" : "bg-black hover:bg-[#1b192e]"
        }`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {busy ? SAVE_COPY.finishing : SAVE_COPY.finishSaving}
        {busy ? null : <span className="material-symbols-outlined text-[18px]">sync</span>}
      </button>
      {state.kind === "still" ? (
        <span className="text-xs flex items-center gap-1" style={{ color: AMBER.text }} role="status">
          <span className="material-symbols-outlined text-[14px]">warning</span>
          {SAVE_COPY.stillFinishing}
        </span>
      ) : null}
      {state.kind === "failed" ? (
        <span className="text-xs text-error flex items-start gap-1 text-right max-w-xs" role="alert">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {SAVE_COPY.couldntFinish(state.why)}
        </span>
      ) : null}
    </div>
  );
}

/** Red save-failed banner (screen 8, state 4). */
export function SaveFailedBanner({ reason, onRetry, busy }: { reason?: string | null; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="rounded-xl bg-error-container/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" role="alert" data-testid="save-failed-banner">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-[22px] text-error">error</span>
        <div className="flex flex-col">
          <span className="text-base font-semibold text-error">{SAVE_COPY.saveFailedTitle}</span>
          {reason ? <span className="text-sm text-on-surface">{reason}</span> : null}
          <span className="text-sm text-on-surface-variant">{SAVE_COPY.saveFailedBody}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="self-start sm:self-auto bg-black text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[18px]">sync</span>
        {SAVE_COPY.tryAgain}
      </button>
    </div>
  );
}

/** Amber banner in the wizard when the save went in but a finishing step failed. */
export function NotFinishedBanner({ state, onFinish }: { state: FinishState; onFinish: () => void }) {
  return (
    <div
      className="rounded-xl border-l-4 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={{ borderColor: AMBER.border, backgroundColor: AMBER.bg }}
      data-testid="not-finished-banner"
    >
      <div className="flex flex-col items-start gap-1">
        <NotFinishedPill />
        <span className="text-sm font-medium text-on-surface">{SAVE_COPY.notFinishedTitle}</span>
      </div>
      <FinishSavingButton state={state} onFinish={onFinish} />
    </div>
  );
}

/** "This service was changed" (screen 7). */
export function ServiceChangedDialog({
  open,
  onCancel,
  onReload,
  reloading,
}: {
  open: boolean;
  onCancel: () => void;
  onReload: () => void;
  reloading?: boolean;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <ResponsiveDialogContent className="sm:max-w-[460px] rounded-2xl" data-testid="service-changed-dialog">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: AMBER.pill, color: AMBER.text }}>
          <span className="material-symbols-outlined text-[26px]">sync_problem</span>
        </div>
        <ResponsiveDialogHeader className="text-left">
          <ResponsiveDialogTitle className="text-xl font-semibold">{SAVE_COPY.changedTitle}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[15px] leading-6">{SAVE_COPY.changedBody}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 rounded-lg bg-error-container/50 hover:bg-error-container text-error text-sm font-semibold"
          >
            {SAVE_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={reloading}
            className="py-2.5 rounded-lg bg-black text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {reloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="material-symbols-outlined text-[18px]">refresh</span>}
            {SAVE_COPY.reload}
          </button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
