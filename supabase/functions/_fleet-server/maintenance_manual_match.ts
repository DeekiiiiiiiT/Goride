/**
 * Step 3 — matching a printed maintenance-table part name to a Roam part type.
 *
 * The manual is written by the car maker; our part types are our own words. A match is never invented: the row
 * is saved either way, and a missing match is marked "needs checking" with the part left empty, so the owner
 * decides.
 *
 * What counts as a match (and what a real page got wrong):
 *   - exact — the printed name is the part type's own name, once case, punctuation, brackets and plurals are
 *     flattened ("Spark plug (platinum, iridium)" is Spark Plugs).
 *   - near  — every word of the part type's name is in the printed name and the two agree on the noun at the end
 *     ("Automatic transmission oil" is Transmission Fluid: the noun here is the fluid, and oil is the same
 *     substance). Nothing else may be missing.
 *   - none  — otherwise, and also when two part types fit equally well. The part is left empty.
 *
 * A part type that names a DIFFERENT part never matches just because it shares a word: "Air cleaner element" is
 * not Air cleaner hose, "Spark plug" is not Spark Plug Wires, and "Transmission oil" is not Engine oil. Those
 * were the wrong "likely" matches in the Roomy page-5 read, where word overlap alone decided.
 */

export type CategoryRow = { id: string; name: string; code: string };

export type MatchKind = "exact" | "near" | "none";

export type PartMatch = {
  categoryId: string | null;
  kind: MatchKind;
  /** The Roam name that matched, for the note the owner reads. */
  matchedName: string | null;
  /** For "none" when something nearly fitted: the names that were close, so the note can name them. */
  closeNames: string[];
};

/** Words that never decide which part a row is about. */
const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "per",
  "plus",
  "all",
  // What to do to a part is not which part it is ("Oil filter replacement" is an Oil filter).
  "replacement",
  "replace",
  "change",
  "changing",
  "service",
  "servicing",
  "inspection",
  "check",
  "adjust",
  "adjustment",
]);

/**
 * The same substance under two names. This is vocabulary, not a guess about which part: a maker's "transmission
 * oil" is our "Transmission Fluid", and a maker's "oil cleaner" is our "Oil filter" (Toyota prints オイルクリーナ
 * for the oil filter). It never bridges two different parts: oil is not a hose, and an element is not a housing.
 */
const SYNONYMS: Record<string, string> = {
  oil: "fluid",
  oils: "fluid",
  lubricant: "fluid",
  lubricants: "fluid",
  cleaner: "filter",
};

/** Lower-case, brackets and punctuation flattened to single spaces (same idea as matchCategoryId). */
export function normaliseName(text: string | null | undefined): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // a bracketed qualifier is not part of the part's name
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "plugs" and "plug" are the same word; "glass" and "mass" are not made singular. */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/(ss|us|is|ous)$/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function wordOf(raw: string): string {
  const word = singular(raw);
  return SYNONYMS[word] ?? word;
}

/** Words worth matching on: three letters or more, so "a" and "c" in "A/C" never decide anything. */
function words(text: string | null | undefined): string[] {
  return normaliseName(text)
    .split(" ")
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    .map(wordOf);
}

function wordSet(text: string | null | undefined): Set<string> {
  return new Set(words(text));
}

/** The noun a part name ends on: the thing the row is about (hose, fluid, filter, plug, belt). */
function headNoun(text: string | null | undefined): string | null {
  const list = words(text);
  return list.length ? list[list.length - 1] : null;
}

function isSubset(small: Set<string>, big: Set<string>): boolean {
  for (const word of small) if (!big.has(word)) return false;
  return true;
}

/**
 * exact  — the printed name (or its code) is the Roam part type's own name.
 * near   — one part type's name is fully contained in the printed name, agreeing on the noun at the end.
 * none   — nothing fits, or several fit equally well: the part stays empty and the owner is asked.
 */
export function matchPartType(categories: CategoryRow[], printed: string): PartMatch {
  const hint = normaliseName(printed);
  const hintWords = wordSet(printed);
  if (!hint || !hintWords.size) return { categoryId: null, kind: "none", matchedName: null, closeNames: [] };
  // The words in printed order, singular and de-synonymed: "Spark plug" and "Spark Plugs" are one name.
  const hintKey = words(printed).join(" ");

  for (const category of categories) {
    const name = normaliseName(category.name);
    const code = normaliseName(String(category.code ?? "").replace(/[_-]+/g, " "));
    const nameKey = words(category.name).join(" ");
    if (name === hint || code === hint || (hintKey && nameKey === hintKey)) {
      return { categoryId: category.id, kind: "exact", matchedName: category.name, closeNames: [] };
    }
  }

  const hintHead = headNoun(printed);
  const fits = categories
    .map((category) => ({
      category,
      nameWords: wordSet(category.name),
      head: headNoun(category.name),
    }))
    .filter((row) =>
      row.nameWords.size > 0 &&
      row.head !== null &&
      row.head === hintHead &&
      isSubset(row.nameWords, hintWords) &&
      // A part type named by one bare word ("Fluids", "Coolant") is too broad to be a near match: every
      // "something oil" row would fit "Fluids". One word can still match exactly, above.
      row.nameWords.size >= 2
    );

  if (!fits.length) {
    return { categoryId: null, kind: "none", matchedName: null, closeNames: [] };
  }

  // The most specific name wins: the one that names the most of the printed words.
  const most = Math.max(...fits.map((row) => row.nameWords.size));
  const best = fits.filter((row) => row.nameWords.size === most);
  if (best.length !== 1) {
    // Several part types fit exactly as well: that is not a match, it is a question for the owner.
    return {
      categoryId: null,
      kind: "none",
      matchedName: null,
      closeNames: best.map((row) => row.category.name).sort(),
    };
  }

  return {
    categoryId: best[0].category.id,
    kind: "near",
    matchedName: best[0].category.name,
    closeNames: [],
  };
}
