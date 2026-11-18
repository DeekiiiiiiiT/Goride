/**
 * Inspection findings in Log service (docs/inspection-findings-audit.md, section 5 items 1–3).
 * Pure helpers only: what the inspection found, as drafts on the inspection job, and the lines they become.
 *
 * - "Not done yet" → a found line: recommended = true, J$ 0, a note, no items (the server forces the J$ 0).
 * - "Done today" → a normal job on this same service, marked values.found_today = true so the
 *   "From inspection" chip and the history row "Done the same day" survive the save.
 */
import type { MaintenanceLogLine, MaintenanceServiceCategory, FoundWorkItem } from "../../../../types/maintenance";
import { isNotUsual, type JobFitState } from "./jobFit";

export type FoundMode = "today" | "later";

export type FoundDraft = {
  jobId: string;
  name: string;
  mode: FoundMode;
  note: string;
};

export const FOUND_COPY = {
  title: "What the inspection found",
  helper: "Add the jobs the garage said this car needs. Mark each one done today or not done yet.",
  empty: "Nothing added yet.",
  addJob: "Add job",
  doneToday: "Done today",
  notDoneYet: "Not done yet",
  todayHelper: "Will be added as its own job below, with its cost and parts",
  notCharged: (cur: string) => `${cur === "JMD" ? "J$" : cur} 0 · not charged`,
  notePlaceholder: "Note (optional)",
  remove: "Remove",
  summary: (today: number, later: number) =>
    `${today} done today · ${later} not done yet (kept on the car's list)`,
  collapsedChip: (n: number) => `${n} found, not done yet`,
  fromInspection: "From inspection",
  pickerTitle: "Add a job the inspection found",
  pickerSearch: "Search jobs, e.g. brakes, wipers…",
  pickerCount: (n: number) => `${n} job${n === 1 ? "" : "s"}`,
  pickerAdd: "Add",
  pickerAdded: "Added",
  pickerTypeToSearch: "Type a job name to search all jobs.",
  pickerNoHits: "No jobs match that search.",
  pickerCantFind: "Can't find it? Use + Other item on the job instead.",
  pickerClose: "Close",
  removedToast: (name: string) => `${name} removed`,
  undo: "Undo",
  reviewTitle: "Found, not done yet",
  reviewHelper: "These are not charged. They'll wait on the car's list until you do them or mark them not needed.",
  reviewNotCharged: (n: number) => `${n} found job${n === 1 ? "" : "s"} not charged`,
  banner: (date: string, job: string | null, garage: string | null) =>
    `From inspection on ${date}${job ? ` · ${job}` : ""}${garage ? ` at ${garage}` : ""}`,
} as const;

/** The job the line was logged for (found lines and normal lines share categoryId). */
function lineJobId(l: MaintenanceLogLine): string | null {
  return l.categoryId ? String(l.categoryId) : null;
}

export function isFoundLine(l: MaintenanceLogLine): boolean {
  return l.recommended === true;
}

/** A normal job that came from this service's inspection ("Done today"). */
export function isFoundToday(l: MaintenanceLogLine): boolean {
  return l.recommended !== true && (l.values as Record<string, unknown> | undefined)?.found_today === true;
}

/**
 * The inspection job a found line (or a "Done today" job) came from: values.found_by_job.
 * Lines without it (the old Digital inspection step, declined recommendations) are never touched
 * by an inspection job's found list (IF-20, IF-22).
 */
export function foundByJob(l: MaintenanceLogLine): string | null {
  const v = (l.values as Record<string, unknown> | undefined)?.found_by_job;
  return typeof v === "string" && v ? v : null;
}

/** A found line or "Done today" job that belongs to this inspection job. */
function belongsTo(l: MaintenanceLogLine, inspectionJobId: string): boolean {
  return foundByJob(l) === inspectionJobId && (isFoundLine(l) || isFoundToday(l));
}

/** Open ("Not done yet") found jobs of one inspection job — its collapsed row's chip. */
export function openFoundCountFor(lines: MaintenanceLogLine[], inspectionJobId: string): number {
  return lines.filter((l) => belongsTo(l, inspectionJobId) && isFoundLine(l) && !l.declined).length;
}

/** Rebuild one inspection job's found list from the lines (opening it again, or a restored draft). */
export function draftsFromLines(lines: MaintenanceLogLine[], inspectionJobId: string): FoundDraft[] {
  const out: FoundDraft[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const id = lineJobId(l);
    if (!id || seen.has(id) || !belongsTo(l, inspectionJobId)) continue;
    if (isFoundLine(l) && !l.declined) {
      out.push({ jobId: id, name: l.categoryName || "Job", mode: "later", note: l.notes ?? "" });
      seen.add(id);
    } else if (isFoundToday(l)) {
      out.push({ jobId: id, name: l.categoryName || "Job", mode: "today", note: "" });
      seen.add(id);
    }
  }
  return out;
}

/** A found ("Not done yet") line: J$ 0, the note, the job's own group, tagged with its inspection job. */
export function foundLineFromDraft(
  d: FoundDraft,
  cat: MaintenanceServiceCategory | undefined,
  system: MaintenanceServiceCategory | null,
  inspectionJobId: string,
): MaintenanceLogLine {
  const note = d.note.trim();
  return {
    categoryId: d.jobId,
    categoryCode: cat?.code ?? "",
    categoryName: cat?.name ?? d.name,
    systemId: system?.id,
    systemCode: system?.code,
    systemName: system?.name,
    action: (cat?.default_action as MaintenanceLogLine["action"]) || "replace",
    recommended: true,
    declined: false,
    notes: note || undefined,
    values: { found_by_job: inspectionJobId },
  };
}

/**
 * Save the inspection job: swap ITS found lines for the drafts' "Not done yet" ones (a saved line keeps
 * its id), and drop its "Done today" jobs whose draft was removed or switched back to "Not done yet".
 * Every other line (other inspection jobs, old Digital inspection lines, declined lines) is kept.
 */
export function applyFoundDrafts(
  lines: MaintenanceLogLine[],
  drafts: FoundDraft[],
  foundLines: MaintenanceLogLine[],
  inspectionJobId: string,
): MaintenanceLogLine[] {
  const todayIds = new Set(drafts.filter((d) => d.mode === "today").map((d) => d.jobId));
  const oldFound = new Map<string, MaintenanceLogLine>();
  const kept = lines.filter((l) => {
    if (!belongsTo(l, inspectionJobId)) return true;
    if (isFoundLine(l)) {
      const id = lineJobId(l);
      if (id && !oldFound.has(id)) oldFound.set(id, l);
      return false;
    }
    return todayIds.has(lineJobId(l) ?? "");
  });
  const withIds = foundLines.map((f) => {
    const old = oldFound.get(lineJobId(f) ?? "");
    return old?.id ? { ...f, id: old.id } : f;
  });
  return [...kept, ...withIds];
}

export function foundCounts(drafts: FoundDraft[]): { today: number; later: number } {
  let today = 0;
  let later = 0;
  for (const d of drafts) (d.mode === "today" ? (today += 1) : (later += 1));
  return { today, later };
}

export type FoundPickerHit = { job: MaintenanceServiceCategory; groupName: string };

/**
 * Jobs for "Add a job the inspection found": every word must be in the job's name, group or description,
 * the same rule as step 2's search. Jobs that don't fit this car are left out (step 2 hides them too),
 * and so are inspection jobs themselves.
 */
export function searchFoundJobs(args: {
  query: string;
  jobs: MaintenanceServiceCategory[];
  groupName: (job: MaintenanceServiceCategory) => string;
  jobFit: JobFitState;
  isInspectionJob: (jobId: string) => boolean;
  limit?: number;
}): FoundPickerHit[] {
  const q = args.query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ hit: FoundPickerHit; score: number }> = [];
  for (const job of args.jobs) {
    if ((job as { status?: string }).status === "retired") continue;
    if (args.isInspectionJob(job.id) || isNotUsual(args.jobFit, job.id)) continue;
    const groupName = args.groupName(job);
    const n = job.name.toLowerCase();
    const hay = `${n} ${groupName.toLowerCase()} ${(job.description || "").toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const score = n.startsWith(q) ? 100 : n.includes(q) ? 80 : words.every((w) => n.includes(w)) ? 70 : 20;
    scored.push({ hit: { job, groupName }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.job.name.localeCompare(b.hit.job.name));
  return scored.slice(0, args.limit ?? 30).map((s) => s.hit);
}

/** Group picker hits under their group name, keeping the ranked order inside each group. */
export function groupHits(hits: FoundPickerHit[]): Array<{ groupName: string; hits: FoundPickerHit[] }> {
  const out: Array<{ groupName: string; hits: FoundPickerHit[] }> = [];
  const byName = new Map<string, { groupName: string; hits: FoundPickerHit[] }>();
  for (const h of hits) {
    const key = h.groupName || "Other jobs";
    let g = byName.get(key);
    if (!g) {
      g = { groupName: key, hits: [] };
      byName.set(key, g);
      out.push(g);
    }
    g.hits.push(h);
  }
  return out;
}

/** "17 Nov 2026" from "2026-11-17" (no time zone shift). */
export function foundDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

/** Banner text for Log service opened from "Log it now". */
export function foundBannerText(item: Pick<FoundWorkItem, "foundDate" | "inspectionJobName" | "garage">): string {
  return FOUND_COPY.banner(foundDateLabel(item.foundDate), item.inspectionJobName, item.garage);
}
