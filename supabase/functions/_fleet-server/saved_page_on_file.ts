/**
 * "Already on file" — the one matching rule the saved-page upload and the Add part type route both use (§3 R2.5 R5
 * step 6, SP-25 / SP-44).
 *
 * A confirmed listing on this car is on file for a part type, a place and a set of years. Two rows overlap when their
 * year ranges touch; they share a place when the position scheme is the same. Keeping the rule in one place is what
 * stops the upload and the Add button disagreeing about the same number.
 */
import type { PartType } from "./saved_page_proof.ts";

export type OnFile = {
  componentId: string;
  number: string;
  position: string | null;
  side: string | null;
  /** Month indices, the same scale the proven rows use. */
  from: number | null;
  to: number | null;
  /** The part type's name on file, filled in by the route (Rev 2 §3.1 shows the on-file name, not the read's). */
  name?: string | null;
};

/** A place a row can be for. Both routes pass the same shape (a proven row, or a suggestion's kept row). */
export type PlaceOf = {
  type: PartType | { id: string; scheme: string | null } | null;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
};

/** The position schemes where the page must say front/rear (and left/right). */
export const POSITION_SCHEMES = new Set(["axle", "four_corners", "axle_left_right", "axle_inner_outer", "axle_numbered"]);

/** The part_listing rows (with their nested part_master numbers) as the flat on-file list. */
export function parseOnFile(data: unknown): OnFile[] {
  const out: OnFile[] = [];
  for (const listing of (data ?? []) as Array<Record<string, unknown>>) {
    const groups = listing.part_interchange_group as { part_master?: Array<Record<string, unknown>> } | null;
    const parts = groups?.part_master ?? [];
    for (const p of parts) {
      if (!p || p.catalog_decision === "rejected") continue;
      const number = String(p.oem_part_number ?? "").trim();
      const componentId = p.maintenance_component_id == null ? "" : String(p.maintenance_component_id);
      if (!number || !componentId) continue;
      const yearFrom = listing.year_from == null ? null : Number(listing.year_from);
      const yearTo = listing.year_to == null ? null : Number(listing.year_to);
      out.push({
        componentId,
        number,
        position: listing.position == null ? null : String(listing.position),
        side: listing.side == null ? null : String(listing.side),
        from: yearFrom == null ? null : yearFrom * 12 + 1,
        to: yearTo == null ? null : yearTo * 12 + 12,
      });
    }
  }
  return out;
}

/** Do the row's years and the listing's years touch? A missing end is open-ended. */
export function overlaps(a: OnFile, r: { from: number | null; to: number | null }): boolean {
  const rf = r.from;
  const rt = r.to;
  const af = a.from ?? Number.NEGATIVE_INFINITY;
  const at = a.to ?? Number.POSITIVE_INFINITY;
  if (rf != null && at < rf) return false;
  if (rt != null && af > rt) return false;
  return true;
}

/**
 * Rev 2 §3.8: does the listing already hold *these* years at that place? A listing whose years cover the row's whole
 * span is "a different number already on file"; one that only touches it (the change month of a frame split, or the
 * end of a shorter range) is the neighbouring number of a split and never blocks the new one (SP-44).
 */
export function covers(a: OnFile, r: { from: number | null; to: number | null }): boolean {
  const af = a.from ?? Number.NEGATIVE_INFINITY;
  const at = a.to ?? Number.POSITIVE_INFINITY;
  const rf = r.from ?? Number.NEGATIVE_INFINITY;
  const rt = r.to ?? Number.POSITIVE_INFINITY;
  return af <= rf && at >= rt;
}

/** Is the listing for the same place as the row? A position-aware type compares the axle; a side compares sides. */
/**
 * RE-74: this car already has a Confirmed number for this part type on this axle (any side, any years). A saved-page
 * row that is held for a page gap then has nothing to ask: no browser check is opened for it.
 */
export function placeOnFile(
  onFile: OnFile[],
  type: { id: string; scheme?: string | null },
  axle: "front" | "rear" | null,
): boolean {
  const positionAware = POSITION_SCHEMES.has(String(type.scheme ?? ""));
  return onFile.some((a) => a.componentId === type.id && (!positionAware || (a.position ?? null) === axle));
}

export function placeMatches(a: OnFile, r: PlaceOf): boolean {
  if (r.type && POSITION_SCHEMES.has(String(r.type.scheme ?? ""))) {
    if ((a.position ?? null) !== (r.axle ?? null)) return false;
  } else if (a.position != null) return false;
  if (r.side == null) return a.side == null || a.side === "both";
  if (r.side === "both") return a.side === "both" || a.side === "left" || a.side === "right";
  return a.side === r.side || a.side === "both" || a.side == null;
}
