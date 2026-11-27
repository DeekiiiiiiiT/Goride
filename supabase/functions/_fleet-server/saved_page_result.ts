/**
 * The row groups and counts a saved-page result stores (docs/saved-page-reads-disagree-audit.md §3.3, §3.8, §4).
 *
 * Kept apart from the route: the sorter and the part-type routes recount a stored result, so they need the same list as
 * the upload that wrote it without importing the route back into itself.
 */

/** Every group a result row can be in. The screen draws one section for each. */
export type SavedPageRowGroup = "saved" | "already" | "held" | "not_saved" | "left_for_later" | "not_roam_type";

/** How many rows are in each group. Old stored results carry the four keys they were written with. */
export type Counts = Record<SavedPageRowGroup, number>;

export const emptyCounts = (): Counts => ({ saved: 0, already: 0, held: 0, not_saved: 0, left_for_later: 0, not_roam_type: 0 });

/**
 * Rev 2 §4: a save that fails is a Roam problem to try again — never a question about a part, and never the raw database
 * text (SP-45 keeps that in the server log).
 */
export const ROAM_SAVE_PROBLEM = "Roam couldn't save these rows. Try again in a few minutes.";

/** Recount a result's rows. A group this build doesn't know is never counted, so no NaN can reach the screen. */
export function countRowsByGroup(rows: ReadonlyArray<{ group?: string | null }>): Counts {
  const counts = emptyCounts();
  for (const row of rows) {
    const group = String(row?.group ?? "") as SavedPageRowGroup;
    if (group in counts) counts[group] += 1;
  }
  return counts;
}
