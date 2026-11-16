/** Service items — pure helpers for the May-need and Supplies screens (audit 9c). */
import type { Job, JobsPayload, MayNeedItem, Supply } from "./jobsApi";

export type PickerKind = "part_type" | "supply";

/** Why a row in the Add dialog can't be picked, or null when it can. */
export function pickerBlockReason(
  job: Job,
  kind: PickerKind,
  itemId: string,
): "Already listed" | "Already in Also do" | null {
  if ((job.items ?? []).some((i) => i.kind === kind && i.itemId === itemId)) return "Already listed";
  if (kind === "part_type" && job.alsoDo.some((l) => l.jobId === itemId)) return "Already in Also do";
  return null;
}

/** True when the Also-do picker must show "Already in May need" for this job. */
export function inMayNeed(job: Job | null, targetJobId: string): boolean {
  return Boolean(job?.items.some((i) => i.kind === "part_type" && i.itemId === targetJobId));
}

/** "1 can" / "2 cans" for supplies, "1 piece" / "2 pieces" for part types; null when no hint. */
export function qtyLabel(item: Pick<MayNeedItem, "qtyHint" | "unitLabelOne" | "unitLabelMany">): string | null {
  if (item.qtyHint == null) return null;
  const one = item.unitLabelOne ?? "piece";
  const many = item.unitLabelMany ?? "pieces";
  return `${formatQty(item.qtyHint)} ${item.qtyHint === 1 ? one : many}`;
}

export function formatQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Usual quantity typed in the dialog: blank = no hint; else > 0 with at most 3 decimals. */
export function parseQtyHint(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    return /^\d+\.\d{4,}$/.test(s)
      ? { ok: false, error: "Use at most 3 decimal places." }
      : { ok: false, error: "Enter a number greater than zero." };
  }
  const n = Number(s);
  if (!(n > 0)) return { ok: false, error: "Enter a number greater than zero." };
  return { ok: true, value: n };
}

/** Jobs (active) that list this supply in May need, by name. */
export function jobsUsingSupply(data: JobsPayload, supplyId: string): Job[] {
  return data.jobs
    .filter((j) => j.items.some((i) => i.kind === "supply" && i.itemId === supplyId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "home group · section" sub-line for a part type in the Add dialog. */
export function partTypeSubLine(data: JobsPayload, job: Job): string {
  const group = data.groups.find((g) => g.id === job.homeGroupId)?.name ?? "";
  let section = "";
  for (const sg of data.sectionGroups) {
    for (const s of sg.sections) {
      if (s.jobIds.includes(job.id) && sg.groupId === job.homeGroupId) {
        section = s.name;
        break;
      }
    }
    if (section) break;
  }
  return section ? `${group} · ${section}` : group;
}

export function supplyCounts(supplies: Supply[]): { active: number; retired: number } {
  let active = 0;
  let retired = 0;
  for (const s of supplies) {
    if (s.status === "retired") retired++;
    else active++;
  }
  return { active, retired };
}

/** Case-insensitive match on name, code or description. */
export function matchesQuery(q: string, ...fields: Array<string | null | undefined>): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
}
