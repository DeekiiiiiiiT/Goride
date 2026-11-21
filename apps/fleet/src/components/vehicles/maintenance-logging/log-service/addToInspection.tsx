/**
 * LC-14 "Add a job to this inspection": Log service opened in add mode (LogMaintenanceServiceDialog
 * `addToInspection`). Wording, the Review list and plain error words. Saves with
 * POST /maintenance-work-orders/:id/found-jobs (J$ 0, not done yet; what was paid never changes).
 */
import React from "react";
import type { MaintenanceLogLine } from "../../../../types/maintenance";
import { MaintenanceSaveError } from "../../../../services/maintenanceSaveError";
import { LS, LT } from "./logServiceStitch";

export const ADD_TO_INSPECTION_COPY = {
  button: "Add a job",
  buttonLong: "Add a job to this inspection",
  bannerLabel: "Adding to this inspection",
  /** LC-17 */
  bannerEditLabel: "Garage's quote for this job",
  saveQuote: "Save quote",
  quoteSaved: (job: string) => `Quote saved for ${job}`,
  addQuote: "Add quote",
  editQuote: "Edit quote",
  bannerHelper: "These are jobs it found that aren't done yet. They're added at J$ 0 — what you paid doesn't change.",
  reviewTitle: "Jobs to add to this inspection",
  reviewHelper: "Each goes on the car's Not done yet list with its parts to buy. Log it when it's done.",
  notCharged: "J$ 0 · not done yet",
  quote: (amount: number) => `Quote J$ ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
  edit: "Edit",
  remove: "Remove",
  confirm: (n: number) => (n === 1 ? "Add 1 job to this inspection" : `Add ${n} jobs to this inspection`),
  done: (added: number, listed: number) =>
    [
      added ? `${added} job${added === 1 ? "" : "s"} added to the inspection` : null,
      listed ? `${listed} already on Not done yet` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  failed: (names: string[]) => `Not added: ${names.join(", ")}.`,
  noInspectionJobs: "An inspection can't be a job an inspection found. Pick the job it found.",
  notAvailable: "Adding jobs to a saved inspection isn't live yet. Nothing was saved — try again after the next update.",
} as const;

/** Plain words for a refused add; a server without this action yet (404, no code) says so. */
export function addFoundErrorText(e: unknown): string {
  if (e instanceof MaintenanceSaveError && e.status === 404 && !e.code) return ADD_TO_INSPECTION_COPY.notAvailable;
  return e instanceof Error && e.message ? e.message : "Couldn't add the job. Try again.";
}

function Sym({ name, size, className = "" }: { name: string; size: number; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden>
      {name}
    </span>
  );
}

const BTN_SECONDARY =
  "border border-[#cbd5e1] dark:border-[#47464c] bg-white dark:bg-[#15161d] hover:bg-[#f4f2fd] dark:hover:bg-[#23242e] text-[#1a1b22] dark:text-[#e4e1ec] shadow-xs transition-colors";

/** Review in add mode: the jobs to add, each with its place and note, J$ 0, Edit / Remove. */
export function AddToInspectionReview({
  lines,
  placesText,
  quoteOf,
  onEdit,
  onRemove,
}: {
  lines: MaintenanceLogLine[];
  /** The job form's total = the garage's quote. */
  quoteOf: (line: MaintenanceLogLine) => number;
  placesText: (line: MaintenanceLogLine) => string;
  onEdit: (line: MaintenanceLogLine) => void;
  onRemove: (line: MaintenanceLogLine) => void;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid="add-to-inspection-review">
      <div>
        <h3 className={`${LT.titleMd} ${LS.text}`}>{ADD_TO_INSPECTION_COPY.reviewTitle}</h3>
        <p className={`${LT.bodySm} ${LS.muted}`}>{ADD_TO_INSPECTION_COPY.reviewHelper}</p>
      </div>
      {lines.map((l, i) => {
        const places = placesText(l);
        return (
          <div
            key={`${l.categoryId}-${i}`}
            data-testid="add-to-inspection-row"
            className={`rounded-lg p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${LS.lowest}`}
          >
            <div className="flex flex-col min-w-0">
              <span className={`${LT.titleSm} ${LS.text}`} data-testid="add-to-inspection-name">
                {[l.categoryName, places].filter(Boolean).join(" · ")}
              </span>
              {l.notes ? <span className={`${LT.bodySm} italic ${LS.muted}`}>“{l.notes}”</span> : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {quoteOf(l) > 0 ? (
                <span className={`text-[13px] tabular-nums font-medium ${LS.text}`} data-testid="add-to-inspection-quote">
                  {ADD_TO_INSPECTION_COPY.quote(quoteOf(l))}
                </span>
              ) : null}
              <span className={`text-[13px] tabular-nums ${LS.muted}`}>{ADD_TO_INSPECTION_COPY.notCharged}</span>
              <button type="button" onClick={() => onEdit(l)} className={`h-8 px-3 rounded-lg text-[13px] font-semibold ${BTN_SECONDARY}`}>
                {ADD_TO_INSPECTION_COPY.edit}
              </button>
              <button
                type="button"
                aria-label={`${ADD_TO_INSPECTION_COPY.remove} ${l.categoryName ?? ""}`}
                data-testid="add-to-inspection-remove"
                onClick={() => onRemove(l)}
                className="w-8 h-8 rounded-lg border border-[#f3b8b3] dark:border-[#93000a] bg-white dark:bg-[#15161d] text-[#ba1a1a] dark:text-[#ffb4ab] flex items-center justify-center"
              >
                <Sym name="delete_outline" size={18} />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
