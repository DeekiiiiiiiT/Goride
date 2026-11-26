/**
 * R1 (docs/part-type-auto-sort-audit.md §2, §4 R1): decide the unknown names of one page, in the plan's order.
 *
 * The rule is one pure function: the caller passes the page's kept rows, the active types, the part groups and the
 * saved answers, and gets back either a decision (track / skip, with who set it and why) or an open name for the AI.
 * Nothing here reads the database.
 */
import type { PartType } from "./saved_page_proof.ts";
import type { ResultRow } from "./research_saved_page_routes.ts";
import {
  FIXINGS_WORDS,
  existingTypeFor,
  positionSchemeOf,
  suggestedGroupName,
} from "./saved_page_suggest.ts";
import {
  normalisePhrase,
  pagePhraseFromGroupLine,
  parseGroupPhrase,
  plainNameFromPhrase,
} from "./saved_page_phrases.ts";

/** One saved answer: the synonym row (track) or the dismissal row (skip), with who set it. */
export type SavedAnswer = {
  verdict: "track" | "skip";
  setBy: "owner" | "roam";
  typeId: string | null;
  typeName: string | null;
  reason: string | null;
};
export type SavedAnswers = ReadonlyMap<string, SavedAnswer>;

export type SortScheme = "none" | "axle" | "axle_left_right";

export type SortName = {
  key: string;
  phrase: string;
  name: string;
  groupName: string;
  groupId: string | null;
  positionScheme: SortScheme;
  line: string;
  rows: ResultRow[];
};

export type SortDecision = {
  key: string;
  phrase: string;
  name: string;
  groupName: string;
  groupId: string | null;
  positionScheme: SortScheme;
  rows: ResultRow[];
  verdict: "track" | "skip";
  setBy: "owner" | "roam";
  typeId: string | null;
  typeName: string | null;
  reason: string;
  /** False when the answer row already exists (owner answer, or Roam's saved answer). */
  writeAnswer: boolean;
};

export type SortOpen = {
  key: string;
  name: string;
  groupName: string;
  groupId: string | null;
  positionScheme: SortScheme;
  line: string;
  rows: ResultRow[];
};

/** Head nouns that are containers, trim or headings, never a part sold on its own (G3, AS-12). */
const GENERIC_NAMES = new Set([
  "cover",
  "case",
  "packing",
  "bracket",
  "unit",
  "parts",
  "common parts",
  "assembly",
  "label",
  "trim",
]);

/** Catalogue filler that is a heading, not a part name. */
const HEADING_PHRASES = new Set(["common parts", "parts", "unit", "assembly"]);

function cleanName(name: string): string {
  const stripped = String(name ?? "")
    .replace(/\b(sub-?assy|assy)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function placeOf(row: ResultRow): { axle: string | null; side: string | null } {
  const words = String(row.place ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const axle = words.includes("front") ? "front" : words.includes("rear") ? "rear" : null;
  const side = words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("both") ? "both" : null;
  return { axle, side };
}

/**
 * The page's sortable names: unknown rows that passed their proof checks, one per normalised group row. This is
 * deliberately built from the rows, not from the 20-card suggestion list (AS-18), so names past the old cap are
 * reached too.
 */
export function buildSortNames(
  rows: ReadonlyArray<ResultRow>,
  groups: ReadonlyArray<{ id: string; name: string }>,
): SortName[] {
  const numbersByBase = new Map<string, Set<number>>();
  for (const row of rows) {
    const parsed = parseGroupPhrase(row.groupLine);
    if (!parsed) continue;
    const set = numbersByBase.get(parsed.baseName) ?? new Set<number>();
    if (parsed.noNumber != null) set.add(parsed.noNumber);
    numbersByBase.set(parsed.baseName, set);
  }

  const buckets = new Map<string, ResultRow[]>();
  for (const row of rows) {
    if (row.group !== "not_roam_type") continue;
    if (!row.groupLine) continue;
    if (!row.numberOk || !row.datesOk || !row.readsAgree) continue;
    const key = row.phraseKey ?? normalisePhrase(pagePhraseFromGroupLine(row.groupLine));
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const names: SortName[] = [];
  for (const [key, bucket] of buckets) {
    const phrase = pagePhraseFromGroupLine(bucket[0].groupLine);
    if (!phrase) continue;
    const parsed = parseGroupPhrase(bucket[0].groupLine);
    if (!parsed) continue;
    const keepNumber = parsed.noNumber != null && (numbersByBase.get(parsed.baseName)?.size ?? 0) > 1;
    const name = cleanName(plainNameFromPhrase(bucket[0].groupLine, { keepNumber }));
    if (!name) continue;
    const groupName = suggestedGroupName(name);
    names.push({
      key,
      phrase,
      name,
      groupName,
      groupId: groups.find((g) => g.name === groupName)?.id ?? null,
      positionScheme: positionSchemeOf(bucket.map(placeOf)),
      line: String(bucket[0].lineText ?? "").slice(0, 300),
      rows: bucket,
    });
  }
  return names.sort((a, b) => (a.rows[0]?.lineNo ?? 0) - (b.rows[0]?.lineNo ?? 0));
}

/** §2 step 4 / G3: not a name Roam can make a type from, and why. */
export function notARealPartName(name: SortName): string | null {
  const parsed = parseGroupPhrase(name.phrase);
  if (parsed && parsed.headWords.some((word) => FIXINGS_WORDS.has(word.toLowerCase()))) return "A fixing";
  const lower = name.name.trim().toLowerCase();
  if (HEADING_PHRASES.has(name.phrase.trim().toLowerCase())) return "A section heading";
  if (GENERIC_NAMES.has(lower)) return "A section heading";
  const head = lower.split(/\s+/).filter(Boolean).pop() ?? "";
  if (GENERIC_NAMES.has(head)) return "A section heading";
  if (/\d{4,}/.test(name.name)) return "A part number, not a name";
  if (name.name.length < 3 || name.name.length > 60) return "Not a part name";
  return null;
}

/**
 * §2 steps 1–4, first answer wins:
 *   1. the owner's saved answer (absolute);
 *   2. a part type Roam already has (page phrase, then plain name);
 *   3. Roam's own saved answer (a track only while its type is active; a skip unless a type now covers the name);
 *   4. a fixing, a heading, a generic container or a number-shaped name;
 *   5. everything else is open for the AI.
 */
export function sortUnknownNames(input: {
  names: ReadonlyArray<SortName>;
  types: ReadonlyArray<PartType>;
  saved: SavedAnswers;
}): { decided: SortDecision[]; open: SortOpen[] } {
  const decided: SortDecision[] = [];
  const open: SortOpen[] = [];

  for (const name of input.names) {
    const base = {
      key: name.key,
      phrase: name.phrase,
      name: name.name,
      groupName: name.groupName,
      groupId: name.groupId,
      positionScheme: name.positionScheme,
      rows: name.rows,
    };
    const saved = input.saved.get(name.key);

    // 1. The owner's answer is absolute.
    if (saved?.setBy === "owner") {
      if (saved.verdict === "track") {
        decided.push({
          ...base,
          verdict: "track",
          setBy: "owner",
          typeId: saved.typeId,
          typeName: saved.typeName,
          reason: saved.reason ?? "You set this",
          writeAnswer: false,
        });
      } else {
        decided.push({
          ...base,
          verdict: "skip",
          setBy: "owner",
          typeId: null,
          typeName: null,
          reason: saved.reason ?? "You said not tracked",
          writeAnswer: false,
        });
      }
      continue;
    }

    // 2. A type Roam already has: the page phrase first, then the plain name.
    const parsed = parseGroupPhrase(name.phrase);
    const existing = (parsed ? existingTypeFor(parsed.baseName, input.types as PartType[]) : null)
      ?? existingTypeFor(name.name, input.types as PartType[]);
    if (existing) {
      decided.push({
        ...base,
        verdict: "track",
        setBy: "roam",
        typeId: existing.id,
        typeName: existing.name,
        reason: `Already on file as ${existing.name}`,
        writeAnswer: true,
      });
      continue;
    }

    // 3. Roam's own earlier answer.
    if (saved?.setBy === "roam") {
      if (saved.verdict === "track") {
        const type = input.types.find((t) => t.id === saved.typeId) ?? null;
        if (type) {
          decided.push({
            ...base,
            verdict: "track",
            setBy: "roam",
            typeId: type.id,
            typeName: type.name,
            reason: saved.reason ?? "Roam set this",
            writeAnswer: false,
          });
          continue;
        }
      } else {
        decided.push({
          ...base,
          verdict: "skip",
          setBy: "roam",
          typeId: null,
          typeName: null,
          reason: saved.reason ?? "Roam said not tracked",
          writeAnswer: false,
        });
        continue;
      }
    }

    // 4. Not a name Roam can make a type from.
    const notAPart = notARealPartName(name);
    if (notAPart) {
      decided.push({
        ...base,
        verdict: "skip",
        setBy: "roam",
        typeId: null,
        typeName: null,
        reason: notAPart,
        writeAnswer: true,
      });
      continue;
    }

    // 5. Ask the AI.
    open.push({
      key: name.key,
      name: name.name,
      groupName: name.groupName,
      groupId: name.groupId,
      positionScheme: name.positionScheme,
      line: name.line,
      rows: name.rows,
    });
  }

  return { decided, open };
}
