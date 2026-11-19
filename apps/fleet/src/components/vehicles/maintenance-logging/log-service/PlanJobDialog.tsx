/**
 * Slice C — "Plan this job for later" overlay (Stitch screen 5; LC-05). In-app, never a browser pop-up.
 * The job goes on the car's Not done yet list at J$ 0 with its part; price and labour come with Log it now.
 */
import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../ui/dialog";
import { LS, LT } from "./logServiceStitch";
import { FitBadge, MakerTile } from "./PartsThatFitPanel";
import type { FitPart } from "./partsThatFit";

export const PLAN_COPY = {
  title: "Plan this job for later",
  body: (car: string) => (
    <>
      We&apos;ll add it to your <span className={`font-semibold ${LS.text}`}>{car}&apos;s</span>{" "}
      <span className={`font-medium ${LS.text}`}>Not done yet</span> list. When the part is fitted, open it and tap{" "}
      <span className={`font-medium ${LS.text}`}>Log it now</span> to add the price and labour.
    </>
  ),
  noPart: "No part picked yet",
  notCharged: "J$ 0 · not charged yet",
  note: "Note (optional)",
  notePlaceholder: "e.g. buy at the parts store on Friday",
  cancel: "Cancel",
  confirm: "Add to Not done yet",
  saving: "Adding…",
  added: (job: string) => `${job} added to Not done yet`,
  alreadyListed: (job: string) => `${job} is already on Not done yet`,
} as const;

function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}

export function PlanJobDialog({
  open,
  carName,
  jobLine,
  part,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  carName: string;
  /** "Oxygen sensor · Front (Air fuel ratio sensor)". */
  jobLine: string;
  part: FitPart | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string | null) => void;
}) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent hideCloseButton className="sm:max-w-[480px] rounded-xl p-6 gap-4" data-testid="plan-job-dialog">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#e2dfff] dark:bg-[#3323cc]/40 flex items-center justify-center text-[#4b41e1] dark:text-[#c3c0ff]">
              <Sym name="bookmark_add" size={18} />
            </div>
            <DialogTitle className={`${LT.headlineMd} ${LS.text}`}>{PLAN_COPY.title}</DialogTitle>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onCancel}
            className={`w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center ${LS.muted} ${LS.hoverMid}`}
          >
            <Sym name="close" size={20} />
          </button>
        </div>
        <DialogDescription className={`${LT.bodyMd} ${LS.muted} leading-relaxed`}>{PLAN_COPY.body(carName)}</DialogDescription>

        <div className={`rounded-xl p-4 flex flex-col gap-2 ${LS.low}`}>
          <div className={`text-[15px] leading-5 font-semibold ${LS.text} flex items-center gap-1.5`} data-testid="plan-job-line">
            <Sym name="build" size={18} className="text-[#4b41e1] dark:text-[#c3c0ff]" />
            <span>{jobLine}</span>
          </div>
          <div className={`rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)] ${LS.lowest}`}>
            {part ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <MakerTile brand={part.brand} size="sm" />
                  <span className={`text-[13px] font-medium truncate ${LS.text}`} data-testid="plan-job-part">
                    {[part.brand, part.number].filter(Boolean).join(" · ") || part.name}
                  </span>
                </div>
                <span className="self-start sm:self-center">
                  <FitBadge label={part.fitLabel} />
                </span>
              </>
            ) : (
              <span className={`${LT.bodySm} ${LS.muted}`} data-testid="plan-job-no-part">{PLAN_COPY.noPart}</span>
            )}
          </div>
          <div className="flex justify-end pt-1">
            <span className={`inline-flex items-center gap-1.5 font-mono text-[13px] font-medium px-2 py-0.5 rounded ${LS.text} ${LS.high}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#78767d]" />
              {PLAN_COPY.notCharged}
            </span>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 pt-1" htmlFor="plan-job-note">
          <span className={`${LT.labelMd} font-semibold ${LS.text}`}>{PLAN_COPY.note}</span>
          <input
            id="plan-job-note"
            data-testid="plan-job-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={PLAN_COPY.notePlaceholder}
            className={`w-full h-11 px-3.5 rounded-lg shadow-sm border border-[#e2e8f0] dark:border-[#32333e] ${LS.lowest} ${LS.text} ${LT.bodyMd} focus:outline-none focus:ring-2 focus:ring-[#4b41e1]`}
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={`h-10 px-4 rounded-lg ${LT.labelMd} border border-[#e2e8f0] dark:border-[#32333e] ${LS.lowest} ${LS.text} ${LS.hoverLow} shadow-sm`}
          >
            {PLAN_COPY.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            data-testid="plan-job-confirm"
            onClick={() => onConfirm(note.trim() || null)}
            className={`h-10 px-4 rounded-lg ${LT.labelMd} font-semibold flex items-center gap-2 shadow-sm disabled:opacity-60 ${LS.btnPrimary}`}
          >
            <Sym name="event_available" size={18} />
            {busy ? PLAN_COPY.saving : PLAN_COPY.confirm}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
