/**
 * Reading a catalogue's own words for a part (docs/part-type-learning-audit.md §2 D1, §3 R2.4).
 *
 * Toyota writes a part as "HEAD, QUALIFIER": the first comma segment is the thing itself ("INLET, AIR CLEANER,
 * NO.1"), so the plain name puts it last ("Air cleaner inlet"). These helpers keep that one rule in one place: the
 * saved-page proof uses them for the page's own name (D1), and the suggestion builder uses them for the plain name,
 * the head noun and the group guess (R2).
 */

/**
 * Side words: the catalogue writes the left and right of one part as two rows ("INSULATOR, FRONT COIL SPRING, UPPER RH"
 * and "… LH"). The side is the row's place, not part of the part's name, so it never reaches a key or a name — both
 * rows become one part type saved for both sides (26 Nov: four "rh"/"lh" types that could never save). Front and rear
 * stay in the name: Roam keeps front and rear parts as their own types.
 */
const SIDE_WORD = /(^|[^A-Za-z0-9])(RIGHT[ -]HAND|LEFT[ -]HAND|R\/H|L\/H|RH|LH|RIGHT|LEFT)(?=[^A-Za-z0-9]|$)/gi;

/** The text without its side words (see SIDE_WORD). */
export function withoutSideWords(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(SIDE_WORD, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/[,\s]+$/, "")
    .trim();
}

/**
 * The phrase key used everywhere: side words removed, then upper case, letters and digits only — exactly what D3's
 * CHECK requires. "…, UPPER RH" and "…, UPPER LH" share one key.
 */
export function normalisePhrase(text: string | null | undefined): string {
  return withoutSideWords(text).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * A page's group row without its leading callout code and dash: "17881 - HOSE, AIR CLEANER, NO.1" becomes
 * "HOSE, AIR CLEANER, NO.1". A row that starts with a word ("GROUP 77777U - …") is left as it is.
 */
export function stripCalloutPrefix(line: string | null | undefined): string {
  const text = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.replace(/^[A-Z0-9][A-Z0-9.#/-]*\s*[-–—]\s+/, "").trim() || text;
}

/** The group row as the page wrote it, callout removed (D2's `pagePhrase`). */
export function pagePhraseFromGroupLine(line: string | null | undefined): string {
  return stripCalloutPrefix(line);
}

/**
 * D1: the page's own name for a part, from its group row: "17881 - HOSE, AIR CLEANER, NO.1" becomes
 * "Hose, air cleaner, no.1". Null when there is no group row, so a row with none is never given an invented name.
 */
export function pageNameFromGroupLine(line: string | null | undefined): string | null {
  const phrase = pagePhraseFromGroupLine(line);
  if (!phrase) return null;
  const lower = phrase.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Catalogue filler that is never part of a part's name (R2.4). */
const FILLER = /^(s\/a|assy|sub-?assy|set)$/i;
/** A trailing "NO.n" / "NO n" segment. */
const NO_SEGMENT = /^no\.?\s*(\d{1,2})$/i;

export type GroupPhrase = {
  /** The segments with the callout and the filler removed, in the page's order. */
  segments: string[];
  /** The head noun's own words: the first segment ("INLET"). */
  headWords: string[];
  /** The qualifying words: everything after the first segment. */
  qualifierWords: string[];
  /** The trailing "NO.n" number, when the page printed one. */
  noNumber: number | null;
  /** The name without its "no. n": "air cleaner inlet" — the key for the "another NO. of the same thing" rule. */
  baseName: string;
};

/**
 * Split a group row into the parts a plain name is built from. The head noun is the FIRST comma segment (the
 * catalogue's own order); filler segments ("SET", "ASSY") are dropped.
 */
export function parseGroupPhrase(line: string | null | undefined): GroupPhrase | null {
  const phrase = withoutSideWords(pagePhraseFromGroupLine(line));
  if (!phrase) return null;
  const raw = phrase.split(",").map((s) => s.trim()).filter(Boolean);
  const segments = raw.filter((s) => !FILLER.test(s) && !NO_SEGMENT.test(s));
  if (!segments.length) return null;
  const noMatch = [...raw].reverse().map((s) => s.match(NO_SEGMENT)).find(Boolean);
  const words = (text: string) => text.split(/[^A-Za-z0-9./-]+/).filter(Boolean);
  const headWords = words(segments[0]);
  const qualifierWords = segments.slice(1).flatMap(words);
  const baseName = [...qualifierWords, ...headWords].join(" ").toLowerCase();
  return {
    segments,
    headWords,
    qualifierWords,
    noNumber: noMatch ? Number(noMatch[1]) : null,
    baseName,
  };
}

/** Sentence case for a name: everything lower, the first letter upper ("air cleaner inlet" → "Air cleaner inlet"). */
export function sentenceCase(name: string): string {
  const lower = String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!lower) return "";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * R2.4: the suggested plain name — head noun last, sentence case, the trailing "no. n" kept only when the caller says
 * the page has another NO. of the same thing. Names are cut at 60 characters (the screen's box and R5's check).
 */
export function plainNameFromPhrase(line: string | null | undefined, opts: { keepNumber?: boolean } = {}): string {
  const parsed = parseGroupPhrase(line);
  if (!parsed) return "";
  const base = sentenceCase([...parsed.qualifierWords, ...parsed.headWords].join(" "));
  const name = opts.keepNumber && parsed.noNumber != null ? `${base} no. ${parsed.noNumber}` : base;
  return name.slice(0, 60).trim();
}

/** The thing itself: the last word of a plain name ("Air cleaner hose" → "hose"). */
export function headNoun(name: string | null | undefined): string {
  const words = String(name ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words[words.length - 1] ?? "";
}

/** The words of a name, lower case, 3+ characters, without the head noun. */
export function qualifierWords(name: string | null | undefined): string[] {
  const words = String(name ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const head = headNoun(name);
  const out = words.filter((w) => w !== head);
  return [...new Set(out)];
}
