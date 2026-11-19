/**
 * Inspection findings outside Log service — Stitch docs/stitch/inspection-findings-fleet-prompt.txt screens 6–9, 11–13
 * (Keep / Drop / Add in docs/inspection-findings-audit.md section 8):
 * - "Found by inspection" in the Due items drawer (Log it now / Not needed), with its empty / loading / error states
 * - the "Not needed" confirm overlay (in-app)
 * - the fleet page's "Found by inspection" card and the "N to do" chip
 * - "What the inspection found" in a service's history
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { MaintenanceSaveError } from "../../../services/maintenanceSaveError";
import type { FoundWorkItem, MaintenanceLogLine } from "../../../types/maintenance";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../ui/dialog";
import { foundDateLabel, isFoundLine, isFoundToday } from "./log-service/foundWork";
import { linePositionsText } from "./log-service/positionChips";
import { CopyNumberButton, MakerTile } from "./log-service/PartsThatFitPanel";

function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}

const BTN_SECONDARY =
  "border border-[#cbd5e1] dark:border-[#47464c] bg-white dark:bg-[#15161d] hover:bg-[#f4f2fd] dark:hover:bg-[#23242e] text-[#1a1b22] dark:text-[#e4e1ec] shadow-xs transition-colors";
const BTN_PRIMARY = "bg-black hover:bg-[#1f1f24] text-white dark:bg-white dark:text-black dark:hover:bg-[#e4e1ec] shadow-sm transition-colors";

export const FOUND_UI_COPY = {
  title: "Found by inspection",
  helper: "Jobs a garage found that weren't done yet.",
  waiting: "Waiting",
  logItNow: "Log it now",
  notNeeded: "Not needed",
  empty: "Nothing waiting from inspections.",
  allClear: "All clear",
  loading: "Loading found jobs…",
  loadFailed: "Couldn't load found jobs",
  loadFailedBody: "The rest of this page still works.",
  tryAgain: "Try again",
  conflictTitle: "Someone else already closed this job",
  conflictBody: "It was closed a moment ago. The list has been refreshed.",
  ok: "OK",
  confirmTitle: (job: string) => `Mark ${job} as not needed?`,
  confirmBody: (date: string) =>
    `It leaves the car's list. It stays in the history of the ${date} inspection as Not needed.`,
  confirmBodyPlanned: "It leaves the car's Not done yet list. Nothing was charged.",
  plannedTitle: "Not done yet",
  plannedHelper: "Jobs to do on this car.",
  notDoneYet: "Not done yet",
  plannedLine: (date: string) => `Planned ${date}`,
  plannedOn: (date: string) => `Planned ${date}`,
  cancel: "Cancel",
  markNotNeeded: "Mark not needed",
  markedToast: (job: string) => `${job} marked not needed`,
  foundLine: (item: Pick<FoundWorkItem, "foundDate" | "daysWaiting" | "inspectionJobName" | "garage">) =>
    [
      `Found ${foundDateLabel(item.foundDate)}`,
      `${item.daysWaiting} day${item.daysWaiting === 1 ? "" : "s"} waiting`,
      [item.inspectionJobName, item.garage ? `at ${item.garage}` : null].filter(Boolean).join(" ") || null,
    ]
      .filter(Boolean)
      .join(" · "),
  toDo: (n: number) => `${n} to do`,
  kpiTitle: "Found by inspection",
  kpiValue: (n: number) => `${n} job${n === 1 ? "" : "s"} waiting`,
  kpiLine: (cars: number, oldest: number | null) =>
    `on ${cars} car${cars === 1 ? "" : "s"}${oldest != null ? ` · oldest ${oldest} day${oldest === 1 ? "" : "s"}` : ""}`,
  historyTitle: "What the inspection found",
  historyHelper: "Jobs the garage found on this visit and what happened to each.",
  done: "Done",
  doneSameDay: "Done the same day",
  doneOn: (date: string) => `Done ${date}`,
  openThatService: "Open that service",
  notNeededOn: (date: string, by: string | null) => `Marked not needed ${date}${by ? ` by ${by}` : ""}`,
  serviceDeleted: "Closed · service deleted",
  serviceDeletedLine: "The inspection was deleted, so this job was closed.",
} as const;

const isConflict = (e: unknown) =>
  e instanceof MaintenanceSaveError ? e.status === 409 || e.code === "found_line_not_open" : false;
const isSwitchedOff = (e: unknown) => e instanceof MaintenanceSaveError && e.status === 404;

/** "Not needed" confirm overlay (Stitch screen 9). In-app, never a browser pop-up. */
export function NotNeededDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: FoundWorkItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent hideCloseButton className="sm:max-w-[520px] rounded-xl p-6 gap-5" data-testid="found-not-needed-dialog">
        {item ? (
          <>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-[#eeedf7] dark:bg-[#23242e] text-[#1a1b22] dark:text-[#e4e1ec] flex items-center justify-center shrink-0">
                <Sym name="assignment_turned_in" size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-[20px] leading-7 font-semibold text-[#1a1b22] dark:text-[#e4e1ec]">
                  {FOUND_UI_COPY.confirmTitle(item.jobName)}
                </DialogTitle>
                <DialogDescription className="mt-3 text-[15px] leading-6 text-[#47464c] dark:text-[#c9c5cd]">
                  {item.source === "planned"
                    ? FOUND_UI_COPY.confirmBodyPlanned
                    : FOUND_UI_COPY.confirmBody(foundDateLabel(item.foundDate))}
                </DialogDescription>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onCancel}
                disabled={busy}
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${BTN_SECONDARY}`}
              >
                <Sym name="close" size={18} />
              </button>
            </div>
            <div className="ml-[60px] rounded-lg bg-[#f4f2fd] dark:bg-[#1c1d26] px-4 py-3 flex items-center gap-2 text-[14px] text-[#47464c] dark:text-[#c9c5cd]">
              <Sym name="schedule" size={18} />
              <span>
                {[
                  item.source === "planned"
                    ? FOUND_UI_COPY.plannedOn(foundDateLabel(item.foundDate))
                    : `Found ${foundDateLabel(item.foundDate)}`,
                  item.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCancel} disabled={busy} className={`h-10 px-4 rounded-lg text-[14px] font-semibold ${BTN_SECONDARY}`}>
                {FOUND_UI_COPY.cancel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                data-testid="found-not-needed-confirm"
                className={`h-10 px-5 rounded-lg text-[14px] font-semibold disabled:opacity-60 ${BTN_PRIMARY}`}
              >
                {busy ? "Saving…" : FOUND_UI_COPY.markNotNeeded}
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type SectionState =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "error" }
  | { kind: "ok"; items: FoundWorkItem[] };

/**
 * "Found by inspection" at the top of the Due items drawer (Stitch screens 7, 8, 12, 13).
 * Hidden entirely when the fleet's switch is off.
 */
export function FoundByInspectionSection({
  vehicleId,
  canEdit,
  onLogItNow,
  onChanged,
  phone = false,
}: {
  vehicleId: string;
  canEdit: boolean;
  onLogItNow?: (item: FoundWorkItem) => void;
  /** Counts on the fleet page change (Not needed). */
  onChanged?: () => void;
  phone?: boolean;
}) {
  const [state, setState] = useState<SectionState>({ kind: "loading" });
  const [confirm, setConfirm] = useState<FoundWorkItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setState({ kind: "loading" });
    api
      .listFoundWork(vehicleId)
      .then((res) => live && setState({ kind: "ok", items: res.items }))
      .catch((e) => live && setState(isSwitchedOff(e) ? { kind: "off" } : { kind: "error" }));
    return () => {
      live = false;
    };
  }, [vehicleId]);

  useEffect(() => load(), [load]);

  if (state.kind === "off") return null;

  const markNotNeeded = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.markFoundWorkNotNeeded(confirm.lineId);
      toast.success(FOUND_UI_COPY.markedToast(confirm.jobName));
      setConfirm(null);
      onChanged?.();
      load();
    } catch (e) {
      setConfirm(null);
      if (isConflict(e)) {
        setConflict(true);
        onChanged?.();
        load();
      } else {
        toast.error(e instanceof Error ? e.message : "Could not save. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const items = state.kind === "ok" ? state.items : [];
  // Slice C: once a job was planned the list holds more than inspection finds (Stitch screen 6).
  const hasPlanned = items.some((i) => i.source === "planned");

  return (
    <section className="space-y-3" data-testid="found-by-inspection">
      <div>
        <div className="flex items-center gap-2">
          <Sym name="schedule" size={20} className="text-[#47464c] dark:text-[#c9c5cd]" />
          <h3 className="text-[15px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec]">
            {hasPlanned ? FOUND_UI_COPY.plannedTitle : FOUND_UI_COPY.title}
          </h3>
          {state.kind === "ok" ? (
            <span
              className="inline-flex items-center justify-center bg-[#dfdef1] text-[#616172] dark:bg-[#2a2b36] dark:text-[#c9c5cd] text-[11px] font-bold px-2 py-0.5 rounded-full"
              data-testid="found-by-inspection-count"
            >
              {items.length}
            </span>
          ) : null}
        </div>
        <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd] mt-0.5">
          {hasPlanned ? FOUND_UI_COPY.plannedHelper : FOUND_UI_COPY.helper}
        </p>
      </div>

      {conflict ? (
        <div
          className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] dark:bg-[#451a03] dark:border-[#78350f] p-3 flex items-start justify-between gap-3"
          data-testid="found-conflict"
        >
          <div className="flex items-start gap-2">
            <Sym name="group" size={18} className="text-[#b45309] dark:text-[#fbbf24] mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-[#92400e] dark:text-[#fde68a]">{FOUND_UI_COPY.conflictTitle}</p>
              <p className="text-[13px] text-[#92400e]/90 dark:text-[#fde68a]/90">{FOUND_UI_COPY.conflictBody}</p>
            </div>
          </div>
          <button type="button" onClick={() => setConflict(false)} className={`h-8 px-3 rounded-lg text-[13px] font-semibold ${BTN_SECONDARY}`}>
            {FOUND_UI_COPY.ok}
          </button>
        </div>
      ) : null}

      {state.kind === "loading" ? (
        <div className="rounded-xl bg-white dark:bg-[#15161d] p-4 shadow-sm space-y-3" data-testid="found-loading" aria-label={FOUND_UI_COPY.loading}>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 rounded bg-[#e3e1ec] dark:bg-[#32333e]" />
                <div className="h-2.5 w-3/5 rounded bg-[#eeedf7] dark:bg-[#23242e]" />
              </div>
              <div className="h-8 w-24 rounded bg-[#e3e1ec] dark:bg-[#32333e]" />
            </div>
          ))}
        </div>
      ) : state.kind === "error" ? (
        <div className="rounded-xl bg-[#fff1f2] dark:bg-[#450a0a] p-3 flex items-start justify-between gap-3" data-testid="found-error">
          <div className="flex items-start gap-2">
            <Sym name="error" size={18} className="text-[#d4183d] dark:text-[#f87171] mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-[#d4183d] dark:text-[#f87171]">{FOUND_UI_COPY.loadFailed}</p>
              <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd]">{FOUND_UI_COPY.loadFailedBody}</p>
            </div>
          </div>
          <button type="button" onClick={() => load()} className={`h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1 ${BTN_SECONDARY}`}>
            <Sym name="refresh" size={16} />
            {FOUND_UI_COPY.tryAgain}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-xl bg-[#f4f2fd] dark:bg-[#1c1d26] p-3 flex items-center justify-between gap-3 shadow-xs"
          data-testid="found-empty"
        >
          <span className="flex items-center gap-3 text-[15px] text-[#1a1b22] dark:text-[#e4e1ec]">
            <span className="w-8 h-8 rounded-full bg-white dark:bg-[#15161d] flex items-center justify-center">
              <Sym name="check_circle" size={18} className="text-[#059669] dark:text-[#34d399]" />
            </span>
            {FOUND_UI_COPY.empty}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-white dark:bg-[#15161d] text-[#47464c] dark:text-[#c9c5cd]">
            {FOUND_UI_COPY.allClear}
          </span>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) =>
            item.source === "planned" ? (
              <PlannedJobCard
                key={item.lineId}
                item={item}
                canEdit={canEdit}
                phone={phone}
                onLogItNow={onLogItNow}
                onNotNeeded={() => setConfirm(item)}
              />
            ) : (
            <li
              key={item.lineId}
              className="rounded-xl bg-white dark:bg-[#15161d] p-4 shadow-sm flex flex-col gap-2 transition-shadow hover:shadow-md"
              data-testid="found-card"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Sym name="build" size={18} className="text-[#47464c] dark:text-[#c9c5cd]" />
                  <h4 className="text-[14px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec] truncate">{item.jobName}</h4>
                </div>
                <span className="inline-flex items-center gap-1 bg-[#eeedf7] dark:bg-[#23242e] px-2.5 py-0.5 rounded-full text-[11px] font-medium text-[#47464c] dark:text-[#c9c5cd] shrink-0">
                  <Sym name="schedule" size={13} />
                  {FOUND_UI_COPY.waiting}
                </span>
              </div>
              {item.note ? (
                <div className="rounded-lg bg-[#f4f2fd] dark:bg-[#1c1d26] p-2.5">
                  <p className="text-[13px] leading-snug text-[#1a1b22] dark:text-[#e4e1ec]">{item.note}</p>
                </div>
              ) : null}
              <div className="text-[12px] leading-tight text-[#47464c] dark:text-[#c9c5cd] flex items-start gap-1.5">
                <Sym name="calendar_today" size={15} className="shrink-0 mt-0.5" />
                <span data-testid="found-card-line">{FOUND_UI_COPY.foundLine(item)}</span>
              </div>
              {canEdit ? (
                <div className={`flex gap-2 pt-1 ${phone ? "flex-col" : "items-center"}`}>
                  {onLogItNow ? (
                    <button
                      type="button"
                      data-testid="found-log-it-now"
                      onClick={() => onLogItNow(item)}
                      className={`px-3.5 py-2 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5 ${phone ? "w-full h-12 text-[15px]" : ""} ${BTN_PRIMARY}`}
                    >
                      <Sym name="edit_calendar" size={15} />
                      {FOUND_UI_COPY.logItNow}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="found-not-needed"
                    onClick={() => setConfirm(item)}
                    className={`px-3.5 py-2 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5 ${phone ? "w-full h-12 text-[15px]" : ""} ${BTN_SECONDARY}`}
                  >
                    {phone ? <Sym name="do_not_disturb_on" size={18} /> : null}
                    {FOUND_UI_COPY.notNeeded}
                  </button>
                </div>
              ) : null}
            </li>
            ),
          )}
        </ul>
      )}

      <NotNeededDialog item={confirm} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void markNotNeeded()} />
    </section>
  );
}

/**
 * A job planned with "Plan it — I'll buy it first" (Slice C, Stitch screen 6): job + place, "Planned <date>",
 * the part with its number for the parts store, the note, then Not needed / Log it now. J$ 0, never in history.
 */
function PlannedJobCard({
  item,
  canEdit,
  phone,
  onLogItNow,
  onNotNeeded,
}: {
  item: FoundWorkItem;
  canEdit: boolean;
  phone: boolean;
  onLogItNow?: (item: FoundWorkItem) => void;
  onNotNeeded: () => void;
}) {
  const places = linePositionsText({
    categoryCode: "",
    positionScheme: item.positionScheme ?? null,
    positionAware: item.positionAware ?? null,
    positions: item.positions ?? [],
  });
  const title = [item.jobName, places].filter(Boolean).join(" · ");
  return (
    <li
      className="rounded-xl bg-white dark:bg-[#15161d] p-4 shadow-md flex flex-col gap-3.5 transition-shadow hover:shadow-lg"
      data-testid="found-card"
      data-source="planned"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-[16px] leading-[22px] font-semibold text-[#1a1b22] dark:text-[#e4e1ec]">{title}</h4>
          <div className="flex items-center gap-1.5 text-[12px] text-[#47464c] dark:text-[#c9c5cd]">
            <Sym name="event" size={15} />
            <span data-testid="found-card-line">{FOUND_UI_COPY.plannedLine(foundDateLabel(item.foundDate))}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#e8e7f1] dark:bg-[#2a2b36] text-[#1a1b22] dark:text-[#e4e1ec] text-[11px] font-medium shrink-0">
          <Sym name="schedule" size={14} />
          {FOUND_UI_COPY.notDoneYet}
        </span>
      </div>
      {item.partId ? (
        <div className="p-2.5 bg-[#f4f2fd] dark:bg-[#1c1d26] rounded-lg flex items-center justify-between gap-2 flex-wrap" data-testid="planned-part">
          <div className="flex items-center gap-2 min-w-0">
            <MakerTile brand={item.partBrand ?? ""} size="sm" />
            <span className="text-[13px] text-[#1a1b22] dark:text-[#e4e1ec]">{item.partBrand || item.partName}</span>
            {item.partNumber ? (
              <>
                <span className="text-[#47464c] dark:text-[#c9c5cd]">·</span>
                <span className="font-mono text-[13px] font-bold tracking-tight text-[#1a1b22] dark:text-[#e4e1ec]">{item.partNumber}</span>
              </>
            ) : null}
          </div>
          {item.partNumber ? <CopyNumberButton number={item.partNumber} /> : null}
        </div>
      ) : null}
      {item.note ? (
        <div className="p-2.5 bg-[#e8e7f1] dark:bg-[#2a2b36] rounded-lg flex items-start gap-2 text-[#1a1b22] dark:text-[#e4e1ec]">
          <Sym name="edit_note" size={17} className="text-[#47464c] dark:text-[#c9c5cd] mt-0.5 shrink-0" />
          <p className="text-[14px] italic">“{item.note}”</p>
        </div>
      ) : null}
      {canEdit ? (
        <div className={`flex gap-2 pt-1 ${phone ? "flex-col-reverse" : "items-center justify-end"}`}>
          <button
            type="button"
            data-testid="found-not-needed"
            onClick={onNotNeeded}
            className={`px-3.5 py-2 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5 ${phone ? "w-full h-12 text-[15px]" : ""} ${BTN_SECONDARY}`}
          >
            {FOUND_UI_COPY.notNeeded}
          </button>
          {onLogItNow ? (
            <button
              type="button"
              data-testid="found-log-it-now"
              onClick={() => onLogItNow(item)}
              className={`px-4 py-2 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5 ${phone ? "w-full h-12 text-[15px]" : ""} ${BTN_PRIMARY}`}
            >
              <Sym name="build" size={16} />
              {FOUND_UI_COPY.logItNow}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Lavender "N to do" chip in the fleet table's Due items column (Stitch screen 6). */
export function FoundToDoChip({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="found-to-do-chip"
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#c8c3df] bg-[#dfdef1] text-[#1b192e] hover:bg-[#d3d1ea] dark:border-[#47464c] dark:bg-[#2a2b36] dark:text-[#e4e1ec] text-[11px] font-medium"
    >
      <Sym name="schedule" size={14} />
      {FOUND_UI_COPY.toDo(count)}
    </button>
  );
}

/** "Found by inspection" KPI card on the fleet page (Stitch screen 6). Same frame as the other cards. */
export function FoundByInspectionKpiCard({
  total,
  cars,
  oldestDays,
  onOpen,
}: {
  total: number;
  cars: number;
  oldestDays: number | null;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-stitch-secondary mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold">{FOUND_UI_COPY.kpiTitle}</span>
        <Sym name="schedule" size={18} className="text-on-surface-variant" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-2xl font-bold text-on-surface">{FOUND_UI_COPY.kpiValue(total)}</span>
        {total > 0 ? (
          <span className="text-[11px] text-stitch-secondary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant" />
            {FOUND_UI_COPY.kpiLine(cars, oldestDays)}
          </span>
        ) : null}
      </div>
      <div className="w-full bg-surface-container h-1.5 rounded-full mt-3 overflow-hidden">
        <div className="h-full rounded-full bg-on-surface-variant" style={{ width: total > 0 ? "100%" : "8%" }} />
      </div>
    </>
  );
  const cls = "bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between text-left";
  return onOpen && total > 0 ? (
    <button type="button" onClick={onOpen} className={`${cls} hover:shadow-md transition-shadow border border-transparent hover:border-outline-variant/40`} data-testid="found-kpi-card">
      {body}
    </button>
  ) : (
    <div className={cls} data-testid="found-kpi-card">
      {body}
    </div>
  );
}

/** "What the inspection found" in a service's details (Stitch screen 11). */
export function FoundHistorySection({
  lines,
  onOpenService,
}: {
  lines: MaintenanceLogLine[];
  onOpenService?: (workOrderId: string) => void;
}) {
  // Stitch 11 order: jobs done the same day first, then the found jobs in the order they were added.
  const kept = lines.filter((l) => !l.voidedAt && (isFoundToday(l) || isFoundLine(l)));
  const rows = [...kept.filter(isFoundToday), ...kept.filter((l) => !isFoundToday(l))];
  if (!rows.length) return null;
  return (
    <section className="rounded-xl bg-[#f4f2fd] dark:bg-[#1c1d26] p-4 space-y-3" data-testid="found-history">
      <div>
        <h4 className="flex items-center gap-2 text-[15px] font-semibold text-[#1b192e] dark:text-[#e4e1ec]">
          <Sym name="search_check" size={20} className="text-[#4338ca] dark:text-[#a5b4fc]" />
          {FOUND_UI_COPY.historyTitle}
        </h4>
        <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd] mt-0.5">{FOUND_UI_COPY.historyHelper}</p>
      </div>
      {rows.map((l, i) => {
        const found = l.found;
        const doneToday = isFoundToday(l);
        const status = doneToday ? "done" : found?.status ?? (l.declined ? "not_needed" : "waiting");
        const chip =
          status === "done"
            ? { cls: "bg-[#ecfdf5] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]", icon: "check", text: FOUND_UI_COPY.done }
            : status === "not_needed"
              ? { cls: "bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]", icon: "remove", text: FOUND_UI_COPY.notNeeded }
              : status === "service_deleted"
                ? { cls: "bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]", icon: "delete", text: FOUND_UI_COPY.serviceDeleted }
                : { cls: "bg-[#eeedf7] text-[#47464c] dark:bg-[#23242e] dark:text-[#c9c5cd]", icon: "schedule", text: FOUND_UI_COPY.waiting };
        const struck = status === "not_needed";
        const closedDate = found?.closedAt ? foundDateLabel(found.closedAt.slice(0, 10)) : "";
        return (
          <div key={l.id ?? i} className="rounded-lg bg-white dark:bg-[#15161d] p-3 shadow-xs space-y-1.5" data-testid="found-history-row">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[14px] font-semibold ${struck ? "line-through text-[#78767d]" : "text-[#1a1b22] dark:text-[#e4e1ec]"}`}>
                {l.categoryName}
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${chip.cls}`}>
                <Sym name={chip.icon} size={13} />
                {chip.text}
              </span>
            </div>
            {l.notes && !doneToday ? <p className="text-[13px] text-[#47464c] dark:text-[#c9c5cd]">{l.notes}</p> : null}
            {doneToday ? (
              <p className="text-[12px] text-[#47464c] dark:text-[#c9c5cd] flex items-center gap-1">
                <Sym name="schedule" size={14} />
                {FOUND_UI_COPY.doneSameDay}
              </p>
            ) : status === "done" && found ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-[#47464c] dark:text-[#c9c5cd] flex items-center gap-1">
                  <Sym name="event" size={14} />
                  {found.doneSameDay ? FOUND_UI_COPY.doneSameDay : FOUND_UI_COPY.doneOn(foundDateLabel(found.doneDate))}
                </p>
                {found.doneWorkOrderId && !found.doneSameDay && onOpenService ? (
                  <button
                    type="button"
                    onClick={() => onOpenService(found.doneWorkOrderId as string)}
                    data-testid="found-open-service"
                    className={`h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1 ${BTN_SECONDARY}`}
                  >
                    {FOUND_UI_COPY.openThatService}
                    <Sym name="arrow_forward" size={14} />
                  </button>
                ) : null}
              </div>
            ) : status === "not_needed" ? (
              <p className="text-[12px] text-[#78767d]">{FOUND_UI_COPY.notNeededOn(closedDate, found?.closedByName ?? null)}</p>
            ) : status === "service_deleted" ? (
              <p className="text-[12px] text-[#78767d]">{FOUND_UI_COPY.serviceDeletedLine}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
