/**
 * Inspection findings in Log service — Stitch docs/stitch/inspection-findings-fleet-prompt.txt screens 1–5 and 10
 * (exports in Downloads/fleet_inspection logging/…; Keep / Drop / Add in docs/inspection-findings-audit.md section 8).
 * Look only: what to show comes from foundWork.ts and the dialog.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../ui/dialog";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import type { MaintenanceLogLine, MaintenanceServiceCategory } from "../../../../types/maintenance";
import { FOUND_COPY, foundCounts, groupHits, type FoundDraft, type FoundMode, type FoundPickerHit } from "./foundWork";
import { LS, LT } from "./logServiceStitch";
import { money } from "./itemsUsed";
import { linePositionsText } from "./positionChips";

const ICON = "material-symbols-outlined";
/** Material symbol at an exact size (the font's own stylesheet forces 24px over Tailwind text sizes). */
function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`${ICON} ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}
/** Buttons always look like buttons (owner rule): a visible border on every secondary / icon button. */
const BTN_SECONDARY =
  "border border-[#cbd5e1] dark:border-[#47464c] bg-white dark:bg-[#15161d] hover:bg-[#f4f2fd] dark:hover:bg-[#23242e] text-[#1a1b22] dark:text-[#e4e1ec] shadow-xs transition-colors";
const BTN_REMOVE =
  "w-8 h-8 shrink-0 rounded-lg border border-[#f3b8b3] dark:border-[#93000a] bg-white dark:bg-[#15161d] text-[#ba1a1a] dark:text-[#ffb4ab] hover:bg-[#ffdad6]/60 dark:hover:bg-[#93000a]/30 flex items-center justify-center transition-colors";

/** Indigo "From inspection" chip (Stitch screens 4, 5, 10). */
export function FromInspectionChip() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#eef2ff] text-[#4338ca] dark:bg-[#312e81]/40 dark:text-[#c7d2fe] text-[11px] leading-[14px] font-semibold"
      data-testid="from-inspection-chip"
    >
      <Sym name="search" size={13} />
      {FOUND_COPY.fromInspection}
    </span>
  );
}

/** Amber "2 found, not done yet" chip on the collapsed inspection row (Stitch screen 4). */
export function FoundCollapsedChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="px-2 py-0.5 rounded-full bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24] text-[11px] leading-[14px] font-medium"
      data-testid="found-collapsed-chip"
    >
      {FOUND_COPY.collapsedChip(count)}
    </span>
  );
}

function ModeSwitch({ mode, onChange }: { mode: FoundMode; onChange: (m: FoundMode) => void }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] leading-[14px] transition-colors";
  return (
    <div
      className={`inline-flex rounded-full p-0.5 border border-[#cbd5e1] dark:border-[#47464c] ${LS.low}`}
      role="radiogroup"
      aria-label="Done today or not done yet"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === "today"}
        data-testid="found-mode-today"
        onClick={() => onChange("today")}
        className={`${base} ${
          mode === "today"
            ? "bg-[#059669] text-white font-semibold shadow-xs"
            : `font-medium ${LS.muted} hover:text-[#1a1b22] dark:hover:text-white`
        }`}
      >
        <Sym name="check" size={14} />
        {FOUND_COPY.doneToday}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "later"}
        data-testid="found-mode-later"
        onClick={() => onChange("later")}
        className={`${base} ${
          mode === "later"
            ? "bg-[#fef3c7] text-[#92400e] dark:bg-[#451a03] dark:text-[#fbbf24] font-semibold shadow-xs"
            : `font-medium ${LS.muted} hover:text-[#1a1b22] dark:hover:text-white`
        }`}
      >
        <Sym name="schedule" size={14} />
        {FOUND_COPY.notDoneYet}
      </button>
    </div>
  );
}

/** The lavender "What the inspection found" panel inside the inspection job (Stitch screens 1 and 3). */
export function FoundWorkSection({
  drafts,
  currency,
  onAdd,
  onModeChange,
  onNoteChange,
  onRemove,
  renderWhere,
  renderParts,
}: {
  drafts: FoundDraft[];
  currency: string;
  onAdd: () => void;
  onModeChange: (jobId: string, mode: FoundMode) => void;
  onNoteChange: (jobId: string, note: string) => void;
  onRemove: (jobId: string) => void;
  /** "Where on the car" chips under a "Not done yet" row's name (Stitch F5, LS-06). */
  renderWhere?: (d: FoundDraft) => React.ReactNode;
  /** LC-10: "Parts to buy" under a "Not done yet" row, so the owner knows what to buy. */
  renderParts?: (d: FoundDraft) => React.ReactNode;
}) {
  const counts = foundCounts(drafts);
  const addButton = (
    <button
      type="button"
      onClick={onAdd}
      data-testid="found-add-job"
      className={`px-3 py-1.5 rounded-lg ${LT.labelMd} font-semibold inline-flex items-center gap-1 ${BTN_SECONDARY}`}
    >
      <Sym name="add" size={16} />
      {FOUND_COPY.addJob}
    </button>
  );
  return (
    <section className="rounded-xl bg-[#dfdef1]/40 dark:bg-[#2a2b36]/60 p-4 flex flex-col gap-4" data-testid="found-work-section">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${LS.navy}`}>
          <Sym name="search_check" size={18} />
        </div>
        <div>
          <h4 className={`${LT.titleSm} font-bold ${LS.text}`}>{FOUND_COPY.title}</h4>
          <p className={`${LT.bodySm} ${LS.muted}`}>{FOUND_COPY.helper}</p>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div
          className={`rounded-lg ${LS.lowest} p-4 flex flex-col items-center gap-2 shadow-xs`}
          data-testid="found-work-empty"
        >
          <p className={`${LT.bodyMd} ${LS.muted}`}>{FOUND_COPY.empty}</p>
          {addButton}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5" data-testid="found-work-rows">
            {drafts.map((d) => (
              <li
                key={d.jobId}
                className={`rounded-lg ${LS.lowest} p-3 shadow-xs flex flex-col gap-2`}
                data-testid="found-work-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`${LT.titleSm} font-bold ${LS.text}`}>{d.name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <ModeSwitch mode={d.mode} onChange={(m) => onModeChange(d.jobId, m)} />
                    {d.mode === "later" ? (
                      <span className={`text-[13px] tabular-nums whitespace-nowrap pl-1 ${LS.muted}`}>
                        {FOUND_COPY.notCharged(currency)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`${FOUND_COPY.remove} ${d.name}`}
                      data-testid="found-remove"
                      onClick={() => onRemove(d.jobId)}
                      className={BTN_REMOVE}
                    >
                      <Sym name="delete_outline" size={18} />
                    </button>
                  </div>
                </div>
                {d.mode === "later" && renderWhere ? renderWhere(d) : null}
                {d.mode === "today" ? (
                  <p className={`${LT.bodySm} ${LS.muted}`}>{FOUND_COPY.todayHelper}</p>
                ) : (
                  <input
                    type="text"
                    data-testid="found-note"
                    aria-label={`Note for ${d.name}`}
                    placeholder={FOUND_COPY.notePlaceholder}
                    value={d.note}
                    maxLength={500}
                    onChange={(e) => onNoteChange(d.jobId, e.target.value)}
                    className={`w-full h-8 px-3 rounded-md ${LS.low} ${LT.bodySm} ${LS.text} border border-transparent focus:border-[#c9c5cd] focus:outline-none`}
                  />
                )}
                {d.mode === "later" && renderParts ? renderParts(d) : null}
              </li>
            ))}
          </ul>
          <div className="pt-1 flex flex-wrap items-center gap-4">
            {addButton}
            <span className={`${LT.bodySm} ${LS.muted}`} data-testid="found-work-summary">
              {FOUND_COPY.summary(counts.today, counts.later)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** "Add a job the inspection found" overlay (Stitch screen 2). In-app, never a browser pop-up. */
export function AddFoundJobDialog({
  open,
  onOpenChange,
  search,
  addedIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: (query: string) => FoundPickerHit[];
  addedIds: Set<string>;
  onAdd: (job: MaintenanceServiceCategory) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const groups = useMemo(() => groupHits(search(query)), [search, query]);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={`max-w-[580px] sm:max-w-[580px] rounded-xl border-0 p-6 gap-5 ${LS.lowest}`}
        overlayClassName="bg-[#1b192e]/20 backdrop-blur-[2px]"
        data-testid="found-picker"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <DialogTitle className={`${LT.titleMd} tracking-tight ${LS.text}`}>{FOUND_COPY.pickerTitle}</DialogTitle>
            <DialogDescription className="sr-only">{FOUND_COPY.pickerSearch}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={FOUND_COPY.pickerClose}
            onClick={() => onOpenChange(false)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${BTN_SECONDARY}`}
          >
            <Sym name="close" size={18} />
          </button>
        </div>

        <div className="relative flex items-center">
          <Sym name="search" size={20} className={`absolute left-3 pointer-events-none ${LS.outline}`} />
          <input
            ref={inputRef}
            type="text"
            data-testid="found-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={FOUND_COPY.pickerSearch}
            className={`w-full h-10 pl-10 pr-10 rounded-lg shadow-sm border border-[#e3e1ec] dark:border-[#32333e] ${LS.lowest} ${LT.bodyMd} ${LS.text} focus:outline-none focus:ring-2 focus:ring-black/70 dark:focus:ring-white/60`}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className={`absolute right-2.5 w-6 h-6 rounded-md flex items-center justify-center ${LS.outline} ${LS.hoverMid}`}
            >
              <Sym name="close" size={16} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 max-h-[52vh] overflow-y-auto -mx-1 px-1" data-testid="found-picker-results">
          {!query.trim() ? (
            <p className={`${LT.bodySm} ${LS.muted}`}>{FOUND_COPY.pickerTypeToSearch}</p>
          ) : total === 0 ? (
            <p className={`${LT.bodySm} ${LS.muted}`}>{FOUND_COPY.pickerNoHits}</p>
          ) : (
            groups.map((g, gi) => (
              <div key={g.groupName} className="flex flex-col gap-1.5">
                <div className="px-1 py-1 flex items-center justify-between">
                  <span className={`${LT.labelSm} uppercase tracking-wider ${LS.muted}`}>{g.groupName}</span>
                  {gi === 0 ? <span className={`${LT.labelSm} ${LS.muted}`}>{FOUND_COPY.pickerCount(total)}</span> : null}
                </div>
                {g.hits.map(({ job, groupName }) => {
                  const added = addedIds.has(job.id);
                  return (
                    <div
                      key={job.id}
                      data-testid="found-picker-row"
                      className={`rounded-lg p-3 flex items-center justify-between gap-3 transition-colors ${LS.hoverLow}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${LS.mid} ${LS.muted}`}>
                          <MaintenanceIcon iconKey={job.icon_key} className="w-[18px] h-[18px]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`${LT.titleSm} ${LS.text}`}>{job.name}</span>
                          <span className={`${LT.bodySm} ${LS.muted} truncate`}>{groupName}</span>
                        </div>
                      </div>
                      {added ? (
                        <span
                          className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#ecfdf5] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399] inline-flex items-center gap-1"
                          data-testid="found-picker-added"
                        >
                          <Sym name="check" size={15} />
                          {FOUND_COPY.pickerAdded}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid="found-picker-add"
                          onClick={() => onAdd(job)}
                          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1 ${BTN_SECONDARY}`}
                        >
                          <Sym name="add" size={15} />
                          {FOUND_COPY.pickerAdd}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <p className={`flex items-center gap-1.5 ${LT.bodySm} italic ${LS.muted}`}>
          <Sym name="info" size={16} className={`not-italic`} />
          {FOUND_COPY.pickerCantFind}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={`px-4 h-9 rounded-lg ${LT.titleSm} ${BTN_SECONDARY}`}
          >
            {FOUND_COPY.pickerClose}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The collapsed inspection row once its line is saved (Stitch screen 4). */
export function FoundCollapsedInspectionRow({
  name,
  amountLabel,
  foundCount,
  onEdit,
}: {
  name: string;
  amountLabel: string;
  foundCount: number;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid="found-collapsed-row">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center shadow-xs shrink-0">
          <Sym name="check" size={15} className={`font-bold`} />
        </div>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
          <span className={`${LT.titleSm} font-bold ${LS.text}`}>{name}</span>
          <span className={`${LT.titleSm} font-bold tabular-nums ${LS.text}`}>· {amountLabel}</span>
          <FoundCollapsedChip count={foundCount} />
        </div>
      </div>
      <button type="button" onClick={onEdit} className={`h-8 px-4 rounded-lg ${LT.titleSm} ${BTN_SECONDARY}`}>
        Edit
      </button>
    </div>
  );
}

/** Pale-blue banner on Log service opened from "Log it now" (Stitch screen 10). */
export function FoundFromInspectionBanner({ text, note, quote = null }: { text: string; note: string | null; quote?: string | null }) {
  return (
    <div
      className="rounded-xl p-4 shadow-xs bg-[#eef2ff]/80 dark:bg-[#312e81]/30 flex flex-col gap-1"
      data-testid="found-banner"
    >
      <div className={`flex items-center gap-2 ${LT.titleSm} text-[#1e1b4b] dark:text-[#e0e7ff]`}>
        <Sym name="search" size={18} className={`text-[#4338ca] dark:text-[#a5b4fc]`} />
        <span>{text}</span>
      </div>
      {quote ? (
        <div className={`pl-7 ${LT.bodySm} font-semibold text-[#312e81] dark:text-[#c7d2fe]`} data-testid="found-banner-quote">
          {quote}
        </div>
      ) : null}
      {note ? (
        <div className={`pl-7 flex items-center gap-1.5 ${LT.bodySm} italic text-[#312e81] dark:text-[#c7d2fe]`}>
          <Sym name="assignment_late" size={14} className={`not-italic text-[#4f46e5] dark:text-[#a5b4fc]`} />
          <span>{note}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Review step: amber "Found, not done yet" group (Stitch screen 5). */
export function ReviewFoundGroup({
  lines,
  currency,
  onRemove,
}: {
  lines: MaintenanceLogLine[];
  currency: string;
  onRemove: (line: MaintenanceLogLine) => void;
}) {
  if (!lines.length) return null;
  return (
    <section
      className="rounded-xl p-4 sm:p-5 flex flex-col gap-3 bg-[#fffbeb]/80 dark:bg-[#451a03]/40"
      data-testid="review-found-group"
    >
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-md bg-[#fde68a]/70 text-[#78350f] dark:bg-[#78350f]/60 dark:text-[#fde68a] flex items-center justify-center shrink-0 mt-0.5">
          <Sym name="schedule" size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`${LT.titleMd} text-[#451a03] dark:text-[#fef3c7]`}>{FOUND_COPY.reviewTitle}</span>
          <p className={`${LT.bodySm} mt-0.5 text-[#92400e]/90 dark:text-[#fcd34d]/90`}>{FOUND_COPY.reviewHelper}</p>
        </div>
      </div>
      {lines.map((line, i) => (
        <div
          key={`${line.categoryId}-${i}`}
          data-testid="review-found-row"
          className={`rounded-lg p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${LS.lowest}`}
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`${LT.titleSm} font-medium ${LS.text}`} data-testid="review-found-name">
              {[line.categoryName, linePositionsText(line)].filter(Boolean).join(" · ")}
            </span>
            {line.notes ? (
              <span className="text-[11px] leading-[14px] font-semibold px-2 py-0.5 rounded bg-[#fef3c7]/80 text-[#78350f] dark:bg-[#78350f]/50 dark:text-[#fde68a]">
                {line.notes}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <span className={`text-[13px] font-medium tabular-nums ${LS.muted}`}>
              {money(currency, 0)} · not charged
            </span>
            <button
              type="button"
              aria-label={`${FOUND_COPY.remove} ${line.categoryName}`}
              data-testid="review-found-remove"
              onClick={() => onRemove(line)}
              className={BTN_REMOVE}
            >
              <Sym name="delete" size={18} />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
