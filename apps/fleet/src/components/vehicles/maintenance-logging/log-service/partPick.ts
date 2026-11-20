/**
 * LC-21 "I used a different …" — the part on a job that isn't a tapped card: a Roam part found by searching the label,
 * a by-size part, or one the user added. Kept in the job's values (values_json) so it reads back on edit and history.
 * docs/log-service-parts-gaps-audit.md 0c3.
 */
import type { LineItemDraft } from "../../../../types/maintenance";
import { newOtherItem } from "./itemsUsed";

export type PartPickSource = "size" | "found" | "added";

export type PartPick = {
  source: PartPickSource;
  /** What the screen shows: "Interstate NS60L", "GS Yuasa ECO.R … M-55". */
  name: string;
  brand: string;
  number: string;
  /** The Roam part's key ("size:<id>" or a part id); null when added. */
  key: string | null;
  /** The grey line when it isn't on the car's list ("Not what Toyota lists (Battery size: M-42 · EFB)."); else null. */
  notListedFor: string | null;
};

type Values = Record<string, string | number | boolean | null | undefined>;

export const PICK_KEYS = ["part_pick_source", "part_pick_name", "part_pick_key", "part_not_listed_for"] as const;

export function partPickValues(pick: PartPick | null): Record<(typeof PICK_KEYS)[number], string | null> {
  return {
    part_pick_source: pick?.source ?? null,
    part_pick_name: pick?.name ?? null,
    part_pick_key: pick?.key ?? null,
    part_not_listed_for: pick?.notListedFor ?? null,
  };
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Reads the pick back from a job's values (+ the line's brand / number). */
export function partPickFromValues(
  values: Values | null | undefined,
  line?: { brand?: string | null; partNumber?: string | null },
): PartPick | null {
  if (!values) return null;
  const source = s(values.part_pick_source);
  if (source !== "size" && source !== "found" && source !== "added") return null;
  const name = s(values.part_pick_name);
  if (!name) return null;
  return {
    source,
    name,
    brand: s(line?.brand ?? ""),
    number: s(line?.partNumber ?? ""),
    key: s(values.part_pick_key) || null,
    notListedFor: s(values.part_not_listed_for) || null,
  };
}

/**
 * An added part rides to Roam as an Other item (the server sends Other items on a part job to Dominion with the job as
 * the part). It is never shown: the user sees "Using … · Added by you" only.
 */
export function carrierItem(pick: PartPick): LineItemDraft {
  return { ...newOtherItem(), itemName: pick.name.slice(0, 120), brand: pick.brand, partNumber: pick.number };
}

export function isCarrierItem(item: LineItemDraft, pick: PartPick | null): boolean {
  return (
    Boolean(pick && pick.source === "added") &&
    item.source === "other" &&
    item.itemKind === "other" &&
    item.itemName.trim() === pick!.name &&
    (item.unitCost == null || String(item.unitCost).trim() === "")
  );
}

/** The items the user sees (the carrier left out). */
export function shownItems<T extends LineItemDraft>(items: T[] | undefined, pick: PartPick | null): T[] {
  return (items ?? []).filter((it) => !isCarrierItem(it, pick));
}

/** Swaps the carrier for the new pick's (an added part gets one; anything else none). */
export function withCarrier(items: LineItemDraft[], prev: PartPick | null, next: PartPick | null): LineItemDraft[] {
  const kept = items.filter((it) => !isCarrierItem(it, prev));
  return next?.source === "added" ? [...kept, carrierItem(next)] : kept;
}

/** "Interstate NS60L · Added by you" for review and history. */
export function partPickLabel(pick: PartPick): string {
  return pick.source === "added" ? `${pick.name} · Added by you` : pick.name;
}

/** The grey line: "Not what Toyota lists (Battery size: M-42 · EFB)." — or, with no size on file, a plain one. */
export function notListedText(make: string | null, listed: string | null): string {
  if (!listed) return "Not on the parts list for this car.";
  return `Not what ${make || "the car maker"} lists (${listed}).`;
}
