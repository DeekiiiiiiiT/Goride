/**
 * Maintenance rebuild step 9 (MER-23): the plain rules of the Log service save, moved out of
 * LogMaintenanceServiceDialog.handleSave unchanged (same checks, same order, same words). The dialog still owns
 * the state, the API calls and the toasts; these functions only decide.
 */
import type { MaintenanceLogLine } from "../../../../types/maintenance";
import { linesHaveItemErrors } from "./itemsUsed";
import { foundByJob } from "./foundWork";

/** What stops a save before anything is sent, in the toast's words; null when it can be sent. */
export function saveBlockReason(date: string | null | undefined, odo: unknown, lines: MaintenanceLogLine[]): string | null {
  if (!date) return "Please fill in required fields";
  const odoNum = Number(odo);
  if (!Number.isFinite(odoNum) || odoNum <= 0) return "Odometer is required and must be greater than zero";
  const activeLines = lines.filter((l) => !l.declined);
  if (!activeLines.length && !lines.length) return "Add at least one line before saving";
  if (!lines.length) return "Add at least one line before saving";
  if (linesHaveItemErrors(lines)) return "Fix the items marked in red first";
  return null;
}

/**
 * IF-12 / IF-21: an inspection job's found jobs (tagged found_by_job) are already saved as lines, so the old DVI
 * route skips them. Lines from the old Digital inspection step still get their record.
 */
export function inspectionFindingsFromLines(lines: MaintenanceLogLine[]) {
  return lines
    .filter((l) => l.recommended && !foundByJob(l))
    .map((l) => ({
      itemId: null as string | null,
      systemId: l.systemId || null,
      componentId: l.categoryId || null,
      status: (l.declined ? "attention" : "fail") as "attention" | "fail",
      notes: l.notes || null,
      declined: Boolean(l.declined),
    }));
}

/** "Brake pads is short by 2 on the shelf. A part is short by 1 on the shelf"; null when nothing is short. */
export function stockWarningsText(stockWarnings: unknown): string | null {
  const list = Array.isArray(stockWarnings) ? (stockWarnings as Array<{ partName?: string; shortBy?: number }>) : [];
  if (!list.length) return null;
  return list
    .map((warning) => {
      const name = warning.partName?.trim() || "A part";
      const shortBy = Number(warning.shortBy);
      const count = Number.isFinite(shortBy) ? shortBy : 1;
      return `${name} is short by ${count} on the shelf`;
    })
    .join(". ");
}

export type FollowUpItem = {
  kind: "fit" | "warranty";
  partId: string;
  supplierId?: string | null;
  workOrderLineId?: string | null;
};

/** After a save: warranty questions first, then "did this part fit?" for every part used on a done line. */
export function followUpQueue(
  saved: {
    warrantyPrompts?: Array<{ partId?: string; supplierId?: string | null; workOrderLineId?: string }>;
    item?: { lines?: Array<{ id?: string; partId?: string; declined?: boolean }> };
    lines?: Array<{ id?: string; partId?: string; declined?: boolean }>;
  },
  sentLines: Array<{ id?: string; partId?: string; declined?: boolean }>,
): FollowUpItem[] {
  const prompts = saved.warrantyPrompts;
  const savedLines = saved.item?.lines?.length ? saved.item.lines : saved.lines?.length ? saved.lines : sentLines;
  const queue: FollowUpItem[] = [];
  for (const prompt of prompts || []) {
    if (prompt.partId) queue.push({ kind: "warranty", partId: String(prompt.partId), supplierId: prompt.supplierId, workOrderLineId: prompt.workOrderLineId });
  }
  for (const line of savedLines) {
    if (line.partId && !line.declined) queue.push({ kind: "fit", partId: line.partId, workOrderLineId: line.id });
  }
  return queue;
}

/** Say why: a network failure (server unreachable) reads differently from a server refusal. */
export function saveFailureReason(error: unknown): string {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)
    ? "could not reach the server — check your connection and try again"
    : error instanceof Error && error.message
      ? error.message
      : "";
}

/** CR-03: the server said the discount changed, so the next Save starts a fresh save key. */
export function isDiscountChanged(reason: string): boolean {
  return /discount changed/i.test(reason);
}

/** A discount refusal is shown as a toast, not the "couldn't save" banner. */
export function isDiscountProblem(reason: string): boolean {
  return /discount can't be more|discounts are switched|valid discount|discount changed/i.test(reason);
}
