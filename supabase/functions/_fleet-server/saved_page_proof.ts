/**
 * R6 (docs/saved-page-parts-audit.md §4): the AI's list of rows is only a list to check. This module proves each row on
 * the page text, drops rows that are another car, and says why a row is held (P1–P6). P7 (dates cover the build per
 * place) and the save/hold decision per axle live with the route.
 *
 * Read-vs-read audit (docs/saved-page-reads-disagree-audit.md, Rev 2): the two reads no longer overrule the page. The
 * number, the dates and the place are proved on the page; the name comes from the page's own group row or from the
 * number already on file; a row the page cannot settle is **left for later** (`leftForLater`), never shown to the owner
 * as a question. `impliedAxle` fills in "rear" only when the page itself says REAR.
 */
import { type CarBuild, periodsOnLine, typedLooksLikePartNumber, wholeNumberOnLine } from "./research_browser_check.ts";
import { pageNameFromGroupLine, parseGroupPhrase } from "./saved_page_phrases.ts";
import { lessonFor, type MakerWords, wordsForType } from "./saved_page_lessons.ts";

export type AiDates = { fromMonth?: number | null; fromYear: number; toMonth?: number | null; toYear?: number | null };

/** One row the AI says it saw. `lineNo` / `groupLineNo` are 1-based line numbers from saved_page_text. */
export type AiPartRow = {
  lineNo: number;
  groupLineNo: number | null;
  partType: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  number: string;
  dates: AiDates | null;
  fitNote: string | null;
};

/** A Roam part type from maintenance_service_categories (only the fields the proof uses). */
export type PartType = { id: string; name: string; scheme: string | null };

export type CarFacts = {
  make: string | null;
  model: string | null;
  frame: string | null;
  engineCode: string | null;
  grade: string | null;
  transmission: string | null;
  build: CarBuild;
};

export type HeaderFacts = { engines: Set<string>; grades: Set<string>; transmissions: Set<string>; options: Set<string> };

/** §3.9: the five fields one read gave for one line, as stored with the upload (never shown on screen). */
export type ReadFields = {
  number: string;
  partType: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  dates: AiDates | null;
};

export type ProvenRow = {
  lineNo: number;
  groupLineNo: number | null;
  partTypeName: string;
  type: PartType | null;
  /** D1: the page's own group row as written (null when the row has no accepted group). */
  groupLine: string | null;
  /** D1: the page's own name for the part, from that group row, e.g. "Hose, air cleaner, no.1". */
  pageName: string | null;
  /** D1: the row's own line as written, prices already removed, cut at 300 characters. */
  lineText: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  /** The number as the page writes it (never the AI's spelling when the page splits it). */
  number: string;
  from: number | null;
  to: number | null;
  datesText: string | null;
  fitNote: string | null;
  /** Why the page cannot settle this row (internal; a screen never asks it). Null when the row is proved. */
  reason: string | null;
  /** P1 passed: the number is a whole plain number on its row. */
  numberOk: boolean;
  /** Do both reads give the same number, type, place and dates? Information only — it never holds a row (Rev 2). */
  readsAgree: boolean;
  /** P2 passed: exactly one date range on the row, inside the car's build. */
  datesOk: boolean;
  /**
   * The place check: the page carries the front/rear (and left/right) words the row needs. A known position-aware
   * row that fails it is held; an unknown row keeps only a place the page itself writes (R1).
   */
  placeOk: boolean;
  /** Rev 2 §3.3: the page could not prove this row — it is not saved, not asked, and tried again next upload. */
  leftForLater: boolean;
  /** Not this car (another engine, dates outside the build): dropped, never held and never shown (SP-23). */
  dropped: boolean;
  /** The lines that prove it, for research_page_read.block_text (prices already removed). */
  evidence: string;
  /**
   * Answers teach Roam AT-03 / AT-05: the one thing the owner is asked about this row (switch on, number and dates
   * proved on the page). Null when the row needs no question.
   */
  question: RowQuestion | null;
  /** AT-08: the owner lessons that settled this row's part type or place (empty when none did). */
  lessonIds: string[];
};

/** AT-05: what a question card asks. `typeIds` are the part types it offers (wording: one; types: the candidates). */
export type RowQuestion = { kind: "wording" | "types" | "axle" | "side"; typeIds: string[] };

/** D1: every kept line is cut here. The plan's limit (§2 D1); far more than either sample page needs. */
export const MAX_RESULT_LINE = 300;

// The page's own name for a part is read from its group row by the phrases module, so the proof and the suggestion
// builder share one rule (§3 R2.4).
export { pageNameFromGroupLine };

/** True for the AI's "other" (and its usual spellings), which is never a part's name (D1). */
export function isOtherTypeName(name: string | null | undefined): boolean {
  return /^(other|unknown|none)$/i.test(String(name ?? "").trim());
}

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const SIDED = new Set(["four_corners", "axle_left_right"]);
/** The position schemes where the page must say front/rear (and left/right). */
export const POSITION_SCHEMES = new Set(["axle", "four_corners", "axle_left_right", "axle_inner_outer", "axle_numbered"]);

/**
 * Rev 2 §2 / §3.2: these words name a shelf, never a part type. They are left out of every type's words, so "SHOE KIT,
 * REAR BRAKE" can never be read as "Brake pads" (its `KIT`) and "FRONT BRAKE" never picks a type on its own.
 */
export const FILLER_WORDS: ReadonlySet<string> = new Set(["KIT", "SET", "ASSY", "SUBASSY", "SUB", "BRAKE", "REAR", "FRONT", "WHEEL"]);

/** A catalogue filler word (see FILLER_WORDS). */
export function isFillerWord(word: string): boolean {
  return FILLER_WORDS.has(String(word ?? "").toUpperCase());
}

/** A word with its plural "s" off, so "SHOES" and "SHOE" are the same word. */
const stem = (word: string) => String(word ?? "").toUpperCase().replace(/S$/, "");

/**
 * Words a row may carry for a part type: its own name plus the car maker's words for it (P4), with the catalogue filler
 * removed (Rev 2). The maker's words come from `part_maker_word` (answers-teach-roam AT-01): the seed rows are the old
 * hand-written partFinder rows, each on the one type it was written for, plus the owner's lessons. A catalogue writes
 * one part as a singular row and a plural name ("SHOE KIT" for "Brake shoes"), so both forms of a word count. A type
 * whose words are all filler keeps them, so it is never held for ever.
 */
export function typeWords(type: PartType, maker?: MakerWords | null): string[] {
  const all = new Set<string>();
  for (const w of `${type.name} ${wordsForType(maker, type.id).join(" ")}`.toUpperCase().split(/[^A-Z0-9]+/)) {
    if (w.length >= 3) all.add(w);
  }
  const distinctive = [...all].filter((w) => !isFillerWord(w));
  const base = distinctive.length ? distinctive : [...all];
  const forms = new Set<string>();
  for (const word of base) {
    forms.add(word);
    const singular = word.replace(/S$/, "");
    if (singular.length >= 3) forms.add(singular);
    if (!word.endsWith("S")) forms.add(`${word}S`);
  }
  return [...forms];
}

/**
 * Rev 2 §3.2: the words a part type's own name is made of, without the filler. "Brake shoes" → SHOES, "Rear wheel
 * cylinder kit" → CYLINDER. These are the words the group row's head is matched against.
 */
export function nameWords(type: PartType): string[] {
  const words = String(type.name ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !isFillerWord(w));
  return words.length ? words : String(type.name ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3);
}

/** The word lists P3 looks for. */
const AXLE_WORDS: Record<"front" | "rear", string[]> = { front: ["FRONT", "FR"], rear: ["REAR", "RR"] };
const SIDE_WORDS: Record<"left" | "right", string[]> = { left: ["LEFT", "LH"], right: ["RIGHT", "RH"] };

/** The plain words a quiet wait keeps (shared with the Add route's re-check; never shown to the owner). */
export const PLACE_AXLE_REASON = "The page doesn't say front or rear on that row";
/** RE-73: the car has drum brakes on that axle, so a disc-only part (pads, rotor, caliper) can't be there. */
export const DRUM_AXLE_REASON = "This car has drum brakes there, so this part can't be on it";
export const PLACE_SIDE_REASON = "The page doesn't say left or right on that row";
export const NO_TYPE_WORDS_REASON = "The page doesn't name this part type on that row";

/**
 * Rev 2 §3.6: a place only when the page itself says REAR and never FRONT — in the page's section heading, the group
 * row or the row. The part's name is car knowledge, not a page fact, so it is never used. A page that never says rear
 * inside the section leaves its parking-brake rows for later.
 */
export function impliedAxle(...pageTexts: Array<string | null | undefined>): "rear" | null {
  const upper = pageTexts.map((t) => String(t ?? "")).join(" | ").toUpperCase();
  if (!hasWord(upper, AXLE_WORDS.rear)) return null;
  if (hasWord(upper, AXLE_WORDS.front)) return null;
  return "rear";
}

/**
 * R5 step 5 / P4: does the row's own words (its group row and its line) carry the part type's words? This is the one
 * check that waited at upload — it needs the type, which only exists after Add.
 */
export function rowNamesType(
  type: PartType,
  maker: MakerWords | null | undefined,
  groupLine: string | null | undefined,
  lineText: string | null | undefined,
): boolean {
  if (lessonFor(maker, groupLine, null).type?.typeId === type.id) return true;
  return hasWord(`${groupLine ?? ""} | ${lineText ?? ""}`, typeWords(type, maker));
}

function hasWord(text: string, words: string[]): boolean {
  const upper = String(text ?? "").toUpperCase();
  return words.some((w) => new RegExp(`(^|[^A-Z0-9])${w}([^A-Z0-9]|$)`).test(upper));
}

export function typeFor(types: PartType[], name: string): PartType | null {
  const wanted = String(name ?? "").trim().toLowerCase();
  return types.find((t) => t.name.trim().toLowerCase() === wanted) ?? null;
}

/** The axle/side words a part type's page must carry (P3), and the words to send the AI. */
export function axleWordsFor(type: PartType): string[] {
  if (!type.scheme || !["axle", "four_corners", "axle_left_right", "axle_inner_outer", "axle_numbered"].includes(type.scheme)) return [];
  return SIDED.has(type.scheme) ? ["front", "rear", "left", "right"] : ["front", "rear"];
}

/** The group row counts only above the row, in the same table/list, with no dates of its own (SP-16). */
export function acceptedGroup(
  lines: string[],
  containers: number[],
  lineNo: number,
  groupLineNo: number | null | undefined,
): number | null {
  const g = Number(groupLineNo);
  if (!Number.isInteger(g) || g < 1 || g >= lineNo) return null;
  if (!lines[g - 1] || !lines[lineNo - 1]) return null;
  if (containers.length >= lineNo && containers[g - 1] !== containers[lineNo - 1]) return null;
  if (periodsOnLine(lines[g - 1]).length) return null;
  return g;
}

/** "11.2016" for a month index, "2016" when only a year is known. */
export function monthText(index: number): string {
  if (!Number.isFinite(index)) return "now";
  const year = Math.floor((index - 1) / 12);
  const month = index - year * 12;
  return `${String(month).padStart(2, "0")}.${year}`;
}

export function dateRangeText(from: number | null, to: number | null): string | null {
  if (from == null) return null;
  return `${monthText(from)} – ${to == null ? "now" : monthText(to)}`;
}

/** The version facts the page's own header lines state (Engine / Grade / Transmission / Options). */
export function headerFacts(headerLines: string[]): HeaderFacts {
  const facts: HeaderFacts = { engines: new Set(), grades: new Set(), transmissions: new Set(), options: new Set() };
  const put = (set: Set<string>, value: string) => {
    for (const token of String(value).split(/[^A-Za-z0-9-]+/)) {
      const n = norm(token);
      if (n.length >= 2) set.add(n);
    }
  };
  for (const line of headerLines) {
    const m = String(line ?? "").match(/^\s*(engine|grade|transmission|transmission\s*\/\s*gearbox|gearbox|options?)\s*[:\-]?\s*(.+)$/i);
    if (!m) continue;
    const label = m[1].toLowerCase();
    if (label === "engine") put(facts.engines, m[2]);
    else if (label === "grade") put(facts.grades, m[2]);
    else if (label.startsWith("transmission") || label === "gearbox") put(facts.transmissions, m[2]);
    else put(facts.options, m[2]);
  }
  return facts;
}

const ENGINE_SHAPE = /^\d{1,2}[A-Z]{2,3}[A-Z]{0,3}$/;
const GEARBOX_WORDS = new Set(["CVT", "AT", "MT", "DCT", "4AT", "5AT", "6AT", "7AT", "4MT", "5MT", "6MT"]);
const OPTION_WORDS = new Set(["2WD", "4WD", "AWD", "FF", "FR", "ABS", "TCS", "VSC", "ESC"]);

/**
 * P6 (SP-20): only engine, gearbox and option codes in the note are compared, against the page header and the car's own
 * engine / transmission. A different code of the same kind drops the row; every other note is evidence and never holds.
 */
export function fitNoteProblem(note: string | null | undefined, car: CarFacts, header: HeaderFacts): string | null {
  if (!note) return null;
  const engines = new Set([norm(car.engineCode), ...header.engines].filter((x) => x.length >= 3));
  const gearboxes = new Set([norm(car.transmission), ...header.transmissions].filter(Boolean));
  const options = header.options;
  for (const raw of String(note).toUpperCase().match(/[A-Z0-9][A-Z0-9-]*/g) ?? []) {
    const t = norm(raw);
    if (!t) continue;
    if (ENGINE_SHAPE.test(t) && t.length >= 5) {
      if (engines.size && !engines.has(t)) return `This row is for a different engine (${raw})`;
      continue;
    }
    if (GEARBOX_WORDS.has(t)) {
      if (gearboxes.size && !gearboxes.has(t)) return `This row is for a different gearbox (${raw})`;
      continue;
    }
    if (OPTION_WORDS.has(t)) {
      if (options.size && !options.has(t)) return `This row is for a different version (${raw})`;
    }
  }
  return null;
}

/** What a row's own line says about dates: one range, none, several different ones, or dates outside the build. */
type RowDates =
  | { kind: "none" }
  | { kind: "many" }
  | { kind: "outside" }
  | { kind: "one"; from: number; to: number };

/**
 * P2 (SP-48): a row's line must show exactly one date range that overlaps the car's build. More than one different
 * overlapping range is never resolved by taking the first one: the row is held.
 */
function readRowDates(line: string, build: CarBuild): RowDates {
  const ranges = periodsOnLine(line);
  if (!ranges.length) return { kind: "none" };
  const start = build.startYear ? build.startYear * 12 + (build.startMonth ?? 1) : null;
  const end = build.endYear ? build.endYear * 12 + (build.endMonth ?? 12) : null;
  const fits = ranges.filter((r) => (start == null || r.to >= start) && (end == null || r.from <= end));
  const unique = new Map<string, { from: number; to: number }>();
  for (const r of fits) unique.set(`${r.from}|${r.to}`, r);
  const different = [...unique.values()];
  if (different.length > 1) return { kind: "many" };
  if (different.length === 1) return { kind: "one", from: different[0].from, to: different[0].to };
  return { kind: "outside" };
}

const datesKey = (d: AiDates | null | undefined) =>
  d ? `${d.fromYear}-${d.fromMonth ?? ""}|${d.toYear}-${d.toMonth ?? ""}` : "";

/** §3.9: the five compared fields one read gave, ready to store. */
export function readFields(row: AiPartRow): ReadFields {
  return {
    number: String(row?.number ?? "").trim(),
    partType: String(row?.partType ?? "").trim(),
    axle: row?.axle ?? null,
    side: row?.side ?? null,
    dates: row?.dates ?? null,
  };
}

/** The one axle word a text prints: "front" or "rear"; null when both or neither (Rev 2 §3.6). */
function pageAxle(text: string): "front" | "rear" | null {
  const hits = (["front", "rear"] as const).filter((w) => hasWord(text, AXLE_WORDS[w]));
  return hits.length === 1 ? hits[0] : null;
}

/** The one side word a text prints: "left" or "right"; null when both or neither (Rev 2 §3.6). */
function pageSide(text: string): "left" | "right" | null {
  const hits = (["left", "right"] as const).filter((w) => hasWord(text, SIDE_WORDS[w]));
  return hits.length === 1 ? hits[0] : null;
}

/** §3.2: which of two names the group row's own head words pick. Null when the page names neither (or both). */
export function nameFromPageWords(
  candidates: PartType[],
  groupLine: string | null | undefined,
  lineText: string | null | undefined,
): PartType | null {
  if (candidates.length !== 2) return null;
  const parsed = parseGroupPhrase(groupLine);
  const words = new Set(
    (parsed ? parsed.headWords : String(lineText ?? "").split(/[^A-Za-z0-9]+/))
      .map((w) => stem(w))
      .filter((w) => w.length >= 3 && !isFillerWord(w)),
  );
  if (!words.size) return null;
  const hits = candidates.filter((t) => nameWords(t).some((w) => words.has(stem(w))));
  return hits.length === 1 ? hits[0] : null;
}

export type NameResolution = {
  /** The type the page picks (the first read's when the page is silent, so the row keeps a shelf for the retry). */
  type: PartType | null;
  /** The name to show while the row waits. */
  name: string;
  /** Rev 2 §3.3: the reads name two types and the page picks neither — the row is left for later. */
  ambiguous: boolean;
  /** The Roam types the two reads named (one or two), for the "Which part is this?" question (AT-05). */
  candidates: PartType[];
};

/**
 * §3.2 / §3.3: the type a row belongs to. One name both reads agree on (or one is "other") is taken as it is; two
 * different Roam types are settled by the page's own group row, and otherwise the row is ambiguous.
 */
export function resolvePartType(input: {
  names: Array<string | null | undefined>;
  types: PartType[];
  groupLine: string | null;
  lineText: string;
}): NameResolution {
  const names = [...new Set(input.names.map((n) => String(n ?? "").trim()).filter((n) => n && !isOtherTypeName(n)))];
  const candidates: PartType[] = [];
  for (const name of names) {
    const type = typeFor(input.types, name);
    if (type && !candidates.some((c) => c.id === type.id)) candidates.push(type);
  }
  if (!candidates.length) return { type: null, name: names[0] ?? "", ambiguous: false, candidates };
  if (candidates.length === 1) return { type: candidates[0], name: names[0] ?? candidates[0].name, ambiguous: false, candidates };
  const picked = nameFromPageWords(candidates, input.groupLine, input.lineText);
  if (picked) return { type: picked, name: picked.name, ambiguous: false, candidates };
  return { type: candidates[0], name: names[0] ?? candidates[0].name, ambiguous: true, candidates };
}

/**
 * Prove every row the two reads name. A row the page proves is kept; a row the page cannot settle is marked
 * `leftForLater` with its reason (Rev 2 §3.3); a row that is another car is dropped. The two reads never hold a row.
 */
export function proveRows(input: {
  reads: [AiPartRow[], AiPartRow[]];
  lines: string[];
  containers: number[];
  types: PartType[];
  car: CarFacts;
  header: HeaderFacts;
  /** The page's own heading lines (title and the lines above the first part row), for the place rule (Rev 2 §3.6). */
  headingText?: string;
  /** Is this number already confirmed on file for this car? Used only to pick between two numbers on one row. */
  isOnFile?: (number: string) => boolean;
  /** AT-01 / AT-02: the car maker's words and the owner's lessons for this make. */
  makerWords?: MakerWords | null;
  /** AT-03: the switch. On: a wording, two-type, front/rear or side row with a proved number and dates is a question. */
  askQuestions?: boolean;
}): ProvenRow[] {
  const { reads, lines, containers, types, car, header } = input;
  const headingText = input.headingText ?? "";
  const isOnFile = input.isOnFile ?? (() => false);
  const maker = input.makerWords ?? null;
  const askQuestions = input.askQuestions === true;
  const identity = [car.frame, car.engineCode, car.model, car.make].filter((x): x is string => Boolean(x));
  const byLine = (rows: AiPartRow[]) => {
    const map = new Map<number, AiPartRow>();
    for (const r of rows) {
      const n = Number(r?.lineNo);
      if (Number.isInteger(n) && n >= 1 && n <= lines.length) map.set(n, r);
    }
    return map;
  };
  const first = byLine(reads[0]);
  const second = byLine(reads[1]);
  const lineNos = [...new Set([...first.keys(), ...second.keys()])].sort((a, b) => a - b);
  const out: ProvenRow[] = [];

  for (const lineNo of lineNos) {
    const a = first.get(lineNo) ?? null;
    const b = second.get(lineNo) ?? null;
    const chosen = a ?? b!;
    const rowLine = lines[lineNo - 1] ?? "";
    const group = acceptedGroup(lines, containers, lineNo, a?.groupLineNo ?? b?.groupLineNo ?? null);
    const groupLine = group ? lines[group - 1] : null;
    const text = group ? `${groupLine} | ${rowLine}` : rowLine;
    const resolution = resolvePartType({
      names: [a?.partType, b?.partType],
      types,
      groupLine,
      lineText: rowLine,
    });
    // AT-02: the owner's lesson for this heading names the part type, whatever the two reads said.
    const lesson = lessonFor(maker, groupLine, car.model);
    const lessonType = lesson.type ? types.find((t) => t.id === lesson.type!.typeId) ?? null : null;
    const type = lessonType ?? resolution.type;
    const ambiguous = lessonType ? false : resolution.ambiguous;
    const lessonIds: string[] = lessonType && lesson.type ? [lesson.type.id] : [];
    const row: ProvenRow = {
      lineNo,
      groupLineNo: group,
      partTypeName: type ? type.name : resolution.name,
      type,
      groupLine: groupLine ? groupLine.slice(0, MAX_RESULT_LINE) : null,
      pageName: null,
      lineText: rowLine.slice(0, MAX_RESULT_LINE),
      axle: null,
      side: null,
      number: "",
      from: null,
      to: null,
      datesText: null,
      fitNote: chosen.fitNote ?? null,
      reason: null,
      numberOk: false,
      readsAgree: false,
      datesOk: false,
      placeOk: true,
      leftForLater: false,
      dropped: false,
      evidence: group ? `${groupLine}\n${rowLine}` : rowLine,
      question: null,
      lessonIds,
    };
    // AT-03: a wait the owner can answer (wording, two types, front/rear, side) is noted with its question; any other
    // wait is a page fact no answer can change, and the row stays a quiet skip.
    const asks: Array<{ question: RowQuestion; note: string }> = [];
    let pageFact = false;
    const wait = (note: string, question?: RowQuestion) => {
      row.leftForLater = true;
      if (!row.reason) row.reason = note;
      if (question) asks.push({ question, note });
      else pageFact = true;
    };

    // R1 (§3): a row Roam has no type for keeps the page's own name, number, dates and the lines that prove them, and
    // goes through the same checks a known row does. Only P4 has nothing to check against yet, so it is the one thing
    // that waits.
    if (!type) {
      row.pageName = pageNameFromGroupLine(row.groupLine) ?? (isOtherTypeName(resolution.name) ? null : resolution.name.trim() || null);
    }
    // §3.3: two different Roam types and the group row picks neither → the row waits. The first read's type is kept
    // only as a shelf for the retry; it must never save (the row's own title, "brake pads, set", would pass P4).
    if (ambiguous) {
      wait("The reads name two part types and the page names neither", {
        kind: "types",
        typeIds: resolution.candidates.map((t) => t.id),
      });
    }

    // §3.4 (Rev 2): the number the page prints wins. Read B's number only matters when read A's is not on the row; when
    // both are on the row, the one already on file is taken, and otherwise the row is left for later.
    const candidates = [...new Set([a?.number, b?.number].map((n) => String(n ?? "").trim()).filter(Boolean))];
    const onRow = candidates.filter((n) => Boolean(wholeNumberOnLine(rowLine, n)) && typedLooksLikePartNumber(n, rowLine, identity));
    if (onRow.length === 1) {
      row.number = wholeNumberOnLine(rowLine, onRow[0]) ?? onRow[0];
    } else if (onRow.length > 1) {
      const onFilePick = onRow.find((n) => isOnFile(n));
      if (onFilePick) row.number = wholeNumberOnLine(rowLine, onFilePick) ?? onFilePick;
      else wait("Two part numbers on the row and neither is on file");
    } else {
      wait(!candidates.length
        ? "No part number on that row"
        : candidates.some((n) => wholeNumberOnLine(rowLine, n))
          ? "That doesn't look like a part number"
          : "The number isn't written on that row");
    }
    if (row.number && group && wholeNumberOnLine(lines[group - 1], row.number)) {
      wait("That number is the group's own code, not a part number");
      row.number = "";
    }
    if (row.number) row.numberOk = true;

    // P2 dates: one range, written on the row; dates that miss the build drop the row as another car.
    const dates = readRowDates(rowLine, car.build);
    if (dates.kind === "none") wait("No dates shown on the page");
    else if (dates.kind === "many") wait("This row shows more than one set of dates");
    else if (dates.kind === "outside") row.dropped = true;
    else {
      row.from = dates.from;
      row.to = dates.to;
      row.datesText = dateRangeText(dates.from, dates.to);
      row.datesOk = true;
    }

    // §3.6 (Rev 2): the page's own single word sets the place. Both words or neither → the row is left for later. A
    // type with no place is not compared on place at all, and the side is never compared on a type that has no sides.
    if (type) {
      const positionAware = POSITION_SCHEMES.has(String(type.scheme ?? ""));
      if (positionAware) {
        // AT-07: the page's own word wins; an owner place lesson for this model fills a place the page doesn't say. A
        // page that says the other axle than the lesson is asked again, and nothing saves.
        const pagePlace = pageAxle(text) ?? impliedAxle(headingText, groupLine, rowLine);
        const learnedAxle = lesson.place?.typeId === type.id ? lesson.place.axle : null;
        if (pagePlace && learnedAxle && pagePlace !== learnedAxle) {
          row.placeOk = false;
          wait(PLACE_AXLE_REASON, { kind: "axle", typeIds: [type.id] });
        } else {
          row.axle = pagePlace ?? learnedAxle;
          if (!pagePlace && learnedAxle && lesson.place) lessonIds.push(lesson.place.id);
          if (!row.axle) {
            row.placeOk = false;
            wait(PLACE_AXLE_REASON, { kind: "axle", typeIds: [type.id] });
          }
        }
        if (SIDED.has(String(type.scheme ?? ""))) {
          const learnedSide = lesson.place?.typeId === type.id ? lesson.place.side : null;
          row.side = pageSide(text) ?? learnedSide;
          if (!pageSide(text) && learnedSide && lesson.place && !lessonIds.includes(lesson.place.id)) lessonIds.push(lesson.place.id);
          if (!row.side) {
            row.placeOk = false;
            wait(PLACE_SIDE_REASON, { kind: "side", typeIds: [type.id] });
          }
        }
      }
    } else {
      // R1: an unknown row keeps only a place the page itself writes — a later non-positional type is fine with none.
      const axle = pageAxle(text) ?? impliedAxle(headingText, groupLine, rowLine);
      const side = pageSide(text);
      row.axle = axle;
      row.side = side;
      // Nothing waits on an unknown row's place, so the flag is true: its place is exactly what the page printed.
      row.placeOk = true;
    }

    // P4 type: the row or group carries one of the part type's catalogue words ("SHOCK", not "SPRING"), without the
    // catalogue filler (Rev 2: "KIT" never names a type).
    // AT-02: the owner's lesson for this heading counts as naming the type. With the switch on, P4 is checked even when
    // a place is missing, so the card asks about the part first; with it off the first wait's reason is unchanged.
    const answerable = () => !pageFact && !row.dropped;
    if (type && !ambiguous && !row.dropped && (!row.leftForLater || (askQuestions && answerable()))) {
      const named = lessonType?.id === type.id || hasWord(text, typeWords(type, maker));
      if (!named) wait(NO_TYPE_WORDS_REASON, { kind: "wording", typeIds: [type.id] });
    }

    // P6 fits this car: only engine/gearbox/option codes in the note are compared (SP-20).
    if ((!row.leftForLater || (askQuestions && answerable())) && !row.dropped) {
      const problem = fitNoteProblem(row.fitNote, car, header);
      if (problem) {
        row.dropped = true;
        row.reason = problem;
      }
    }

    // AT-03: switch on, the number and dates proved, and every wait one the owner can answer → one question, the part
    // first, then front/rear, then the side. The row isn't saved until it's answered.
    if (askQuestions && asks.length && answerable() && row.numberOk && row.datesOk) {
      const order = ["types", "wording", "axle", "side"] as const;
      const pick = order.map((k) => asks.find((x) => x.question.kind === k)).find(Boolean)!;
      row.question = pick.question;
      row.reason = pick.note;
      row.leftForLater = false;
    }

    // P5 information only (Rev 2 §3.5): the five fields the old code compared. It never holds a row.
    row.readsAgree = Boolean(a && b)
      && norm(a!.number) === norm(b!.number)
      && norm(a!.partType) === norm(b!.partType)
      && (a!.axle ?? null) === (b!.axle ?? null)
      && (a!.side ?? null) === (b!.side ?? null)
      && datesKey(a!.dates) === datesKey(b!.dates);

    out.push(row);
  }
  return out;
}

/**
 * P7: the dates of one place's passing rows must cover the car's whole build. Returns the missing span as plain words,
 * or null when covered (rangesCoverBuild's touching months count).
 */
export function placeGap(ranges: Array<{ from: number; to: number }>, build: CarBuild): string | null {
  if (!build.startYear) return null;
  const start = build.startYear * 12 + (build.startMonth ?? 1);
  const end = build.endYear ? build.endYear * 12 + (build.endMonth ?? 12) : null;
  let reach = start - 1;
  for (const r of [...ranges].sort((x, y) => x.from - y.from)) {
    if (r.from > reach + 1) return `Dates missing ${monthText(reach + 1)} – ${monthText(r.from - 1)}`;
    reach = Math.max(reach, r.to);
  }
  if (reach < start) return `Dates missing ${monthText(start)} – ${monthText(end ?? start)}`;
  if (end != null && reach < end) return `Dates missing ${monthText(reach + 1)} – ${monthText(end)}`;
  return null;
}

/** True when the page's own version dates hold the car's whole build; a car with no end needs an open page (SP-13). */
export function versionDatesFit(periods: Array<{ from: number; to: number }>, build: CarBuild): boolean {
  if (!build.startYear) return false;
  const start = build.startYear * 12 + (build.startMonth ?? 1);
  if (!build.endYear) return periods.some((p) => p.from <= start && p.to === Number.POSITIVE_INFINITY);
  const end = build.endYear * 12 + (build.endMonth ?? 12);
  return periods.some((p) => p.from <= start && p.to >= end);
}

/**
 * The line the version is read from: the title and the lines above the first part row (SP-12). A part row is the first
 * line carrying a whole plain number; a frame number in a help link below it never counts.
 */
export function headerLineCount(lines: string[], identity: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    for (const token of lines[i].split(/[\s,;|]+/)) {
      const t = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      // A part number has letters and digits and no date punctuation; a date, a year or a version code never starts
      // the parts.
      if (t.length < 5 || !/[A-Za-z]/.test(t) || !/\d/.test(t) || /[./]/.test(t)) continue;
      if (typedLooksLikePartNumber(t, lines[i], identity)) return i;
    }
  }
  return Math.min(lines.length, 20);
}
