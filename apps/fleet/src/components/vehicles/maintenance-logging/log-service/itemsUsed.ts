/** Items used on one job (Log service step 3). Pure helpers — the screen and the tests share them. */
import type { JobItem } from "@roam/types/serviceItems";
import {
  lineItemAmountCenti,
  lineItemError,
  lineItemsAmount,
  type LineItemDraft,
  type MaintenanceLogLine,
} from "../../../../types/maintenance";

export type { JobItem };

/** A May-need item from Dominion, ticked: starts at the usual quantity, cost blank. */
export function draftFromJobItem(job: JobItem): LineItemDraft {
  return {
    source: "suggested",
    jobItemId: job.linkId,
    itemKind: job.kind,
    partTypeId: job.kind === "part_type" ? job.itemId : null,
    supplyId: job.kind === "supply" ? job.itemId : null,
    partId: null,
    itemName: job.name,
    unitLabelOne: job.unitLabelOne,
    unitLabelMany: job.unitLabelMany,
    brand: "",
    partNumber: "",
    qty: job.qtyHint != null && job.qtyHint > 0 ? String(job.qtyHint) : "1",
    unitCost: "",
  };
}

export function newOtherItem(): LineItemDraft {
  return {
    source: "other",
    itemKind: "other",
    itemName: "",
    unitLabelOne: "piece",
    unitLabelMany: "pieces",
    brand: "",
    qty: "1",
    unitCost: "",
  };
}

/** Tick or untick a May-need item. Unticking drops whatever was typed for it. */
export function toggleSuggested(items: LineItemDraft[], job: JobItem): LineItemDraft[] {
  const at = items.findIndex((i) => i.source === "suggested" && i.jobItemId === job.linkId);
  if (at >= 0) return items.filter((_, i) => i !== at);
  return [...items, draftFromJobItem(job)];
}

export function findSuggested(items: LineItemDraft[], linkId: string): LineItemDraft | undefined {
  return items.find((i) => i.source === "suggested" && i.jobItemId === linkId);
}

function qtyNumber(qty: string | number): number {
  const n = Number(String(qty).trim());
  return Number.isFinite(n) ? n : 0;
}

/** − / + buttons: whole steps; never goes to 0 or below. */
export function stepQty(qty: string | number, delta: 1 | -1): string {
  const now = qtyNumber(qty);
  const next = Math.round((now + delta) * 1000) / 1000;
  if (next <= 0) return String(now > 0 ? now : 1);
  return String(next);
}

/** "can" for exactly 1, "cans" otherwise; reads use the label the server saved. */
export function unitLabelFor(item: LineItemDraft): string {
  const one = qtyNumber(item.qty) === 1;
  if (item.unitLabelOne || item.unitLabelMany) {
    return one ? item.unitLabelOne || item.unitLabelMany || "" : item.unitLabelMany || item.unitLabelOne || "";
  }
  return item.unitLabel ?? "";
}

/** "1 can", "2 pieces". */
export function qtyWithUnit(item: LineItemDraft): string {
  const label = unitLabelFor(item);
  const q = String(item.qty).trim() || "0";
  return label ? `${q} ${label}` : q;
}

export function costRecorded(item: LineItemDraft): boolean {
  return item.unitCost != null && String(item.unitCost).trim() !== "";
}

/** Item amount in money (0 while invalid or cost blank). */
export function itemAmount(item: LineItemDraft): number {
  return Number(lineItemAmountCenti(item) ?? 0n) / 100;
}

const ERROR_TEXT: Record<string, string> = {
  qty_invalid: "Enter a quantity above 0.",
  qty_precision: "Use up to 3 decimals for the quantity.",
  cost_invalid: "Enter the cost as a number.",
  cost_precision: "Use up to 2 decimals for the cost.",
  item_name_required: "Say what it was.",
  brand_too_long: "Brand is too long.",
  part_number_too_long: "Part number is too long.",
  part_source_not_allowed: "Part source only applies to part items.",
  part_source_invalid: "Invalid part source.",
  part_source_part_mismatch: "Part source does not match the part picked.",
  part_source_needs_part: "Enter a brand or part number for this part.",
};

/** Plain message for an item the server would refuse, or null. */
export function itemErrorText(item: LineItemDraft): string | null {
  const code = lineItemError(item);
  if (!code) return null;
  return ERROR_TEXT[code] ?? "Check this item.";
}

/** True when any item on any job would be refused — Continue / Log service stay off. */
export function linesHaveItemErrors(lines: MaintenanceLogLine[]): boolean {
  return lines.some((l) => !l.declined && (l.items ?? []).some((i) => lineItemError(i) != null));
}

/** Job charge (everything but items) and items, for "Job J$ 3,000 + items J$ 2,000". */
export function splitLineTotal(line: MaintenanceLogLine, total: number): { job: number; items: number } {
  const items = lineItemsAmount(line);
  return { job: Math.round((total - items) * 100) / 100, items };
}

/** Group May-need items: Usually first, then Sometimes; Dominion order inside each. */
export function groupJobItems(items: JobItem[]): { usually: JobItem[]; sometimes: JobItem[] } {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    usually: sorted.filter((i) => i.need === "usually"),
    sometimes: sorted.filter((i) => i.need !== "usually"),
  };
}

/** "May need: Throttle body cleaner, Intake Manifold Gasket" for the Step 2 ⓘ. */
export function mayNeedSummary(items: JobItem[] | undefined): string {
  if (!items?.length) return "";
  return `May need: ${groupJobItems(items).usually.concat(groupJobItems(items).sometimes).map((i) => i.name).join(", ")}`;
}

/** Money as the Stitch screens show it: "J$ 1,200". */
export function money(currency: string | null | undefined, amount: number): string {
  const cur = currency?.trim() || "JMD";
  return `${cur === "JMD" ? "J$" : cur} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * Which badge a picked part shows. Only a part picked from this car's own list ("car") gets the green
 * verified tick; a "fits by size" pick and a typed-in part never do. A saved part read back has no
 * `partFit` (screen-only), so a saved catalogue part (`partId` set) still counts as "car".
 */
export type PickedPartBadge = "car" | "size" | "typed";

type SavedItemLike = Partial<LineItemDraft> & {
  partSource?: "car" | "size" | "typed" | null;
  part_source?: "car" | "size" | "typed" | null;
};

/**
 * Map an item into screen draft fields when a job is (re)opened. Two kinds of input:
 * - a draft already on screen this visit (it has `partFit` / `partLabel` set by the picker): kept as is, so
 *   reopening a job never forgets a "fits by size" pick;
 * - an item read back from the server (no `partFit`, no `partLabel`): `partFit` comes from the saved
 *   `partSource`, and the label is the brand (or part number), like a typed-in part shows.
 * The saved `partSource` is kept on the draft (NULL included) so an unchanged item is sent back as it was.
 */
export function draftFromSavedItem(item: SavedItemLike): LineItemDraft {
  const draft = { ...item } as LineItemDraft;
  const fromServer = item.partFit === undefined && item.partLabel == null;
  if (!fromServer) return draft;

  const rawSource = item.partSource !== undefined ? item.partSource : (item.part_source ?? null);
  draft.partSource = rawSource ?? null;
  if (draft.itemKind === "part_type") {
    draft.partFit = rawSource === "car" ? "car" : rawSource === "size" ? "size" : null;
    const brand = draft.brand?.toString().trim();
    const partNumber = draft.partNumber?.toString().trim();
    if (brand || partNumber) draft.partLabel = brand || partNumber || null;
  }
  return draft;
}

export function pickedPartBadge(item: Pick<LineItemDraft, "partFit" | "partId">): PickedPartBadge {
  if (item.partFit === "car" && item.partId) return "car";
  if (item.partFit === "size") return "size";
  return item.partId ? "car" : "typed";
}
