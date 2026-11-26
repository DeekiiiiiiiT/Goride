/**
 * R2 (docs/part-type-learning-audit.md §3): turn the unknown, proved rows of one saved page into suggestions.
 *
 * One suggestion per catalogue group row. Existing types win, then fixings, then a new type; the plain name is the
 * page's own words with the head noun last ("INLET, AIR CLEANER, NO.1" → "Air cleaner inlet"); the part group comes
 * from the plan's 13-row table, first match wins; the position scheme comes from the places the page printed. At most
 * 20 suggestions, and any row beyond that is only counted.
 *
 * Nothing here reads the database: the active part types, the part groups on file and the dismissed phrases are
 * passed in, so the rule is one pure function and the route stays the only place that talks to Postgres.
 */
import type { PartType, ProvenRow } from "./saved_page_proof.ts";
import {
  headNoun,
  normalisePhrase,
  pagePhraseFromGroupLine,
  parseGroupPhrase,
  plainNameFromPhrase,
  qualifierWords,
} from "./saved_page_phrases.ts";

export type SuggestionKind = "new" | "existing" | "fixings";
export type SuggestionStatus = "open" | "added" | "dismissed";

/** D2's shape. `name` is the existing type's name for kind "existing" (that is what the card offers to save under). */
export type Suggestion = {
  key: string;
  name: string;
  groupId: string | null;
  groupName: string;
  kind: SuggestionKind;
  existingTypeId: string | null;
  positionScheme: "none" | "axle" | "axle_left_right";
  pagePhrase: string;
  numbers: string[];
  rowCount: number;
  numberCount: number;
  status: SuggestionStatus;
  typeId: string | null;
  typeName: string | null;
  reason: string | null;
};

/** PT-05: hardware words. A name whose head noun is one of these is a fixing, never a part type of its own. */
export const FIXINGS_WORDS = new Set([
  "bolt",
  "nut",
  "screw",
  "stud",
  "washer",
  "pin",
  "rivet",
  "clip",
  "clamp",
  "band",
  "retainer",
  "grommet",
]);

/**
 * R2.5: the part-group table, in the plan's order. The first row with a word in the suggested name wins, so a real
 * group beats a generic word ("EXHAUST PIPE" is exhaust, not a belt & hose).
 */
export const SUGGEST_GROUPS: ReadonlyArray<{ name: string; words: ReadonlyArray<string> }> = [
  { name: "Filters", words: ["filter", "element"] },
  { name: "Brakes", words: ["pad", "rotor", "disc", "caliper", "drum", "shoe", "brake"] },
  {
    name: "Exhaust & emissions",
    words: ["muffler", "catalyst", "catalytic", "oxygen", "o2", "exhaust", "dpf", "egr", "nox", "resonator"],
  },
  {
    name: "Suspension & steering",
    words: [
      "spring", "shock", "absorber", "strut", "arm", "ball joint", "tie rod", "link", "bar", "bush", "bushing",
      "bump stop", "hub", "bearing", "knuckle", "steering",
    ],
  },
  { name: "Belts & hoses", words: ["clamp", "hose", "pipe", "duct", "tube", "belt", "pulley", "tensioner"] },
  { name: "Lighting & visibility", words: ["lamp", "light", "bulb", "lens", "mirror", "wiper", "blade", "washer"] },
  { name: "HVAC", words: ["compressor", "condenser", "evaporator", "blower", "heater", "air con", "a/c", "refrigerant"] },
  {
    name: "Battery & electrical",
    words: ["battery", "alternator", "starter", "sensor", "switch", "relay", "fuse", "wire", "harness", "horn", "motor"],
  },
  {
    name: "Transmission",
    words: ["clutch", "gear", "gearbox", "transmission", "cv", "driveshaft", "axle", "differential", "converter"],
  },
  { name: "Hybrid & electric", words: ["inverter", "charging", "hv", "traction"] },
  { name: "Fluids", words: ["oil", "coolant", "fluid", "grease"] },
  { name: "Tires & wheels", words: ["tyre", "tire", "wheel", "rim", "valve stem"] },
];

/** R2.5 row 13: anything else is an engine part. */
export const DEFAULT_GROUP = "Engine";

/** R2.7: at most this many suggestions (fixings are counted separately, because the screen shows them as one line). */
export const MAX_SUGGESTIONS = 20;

/**
 * R2.5: the group a plain name belongs to, first match wins. A word matches inside a longer word on purpose — the
 * catalogue says "HEADLIGHT", and the plan's table word is "light". Two-letter words ("o2", "cv", "hv") must be whole
 * words, or "cv" would match half the language.
 */
export function suggestedGroupName(name: string): string {
  const hay = ` ${String(name ?? "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const group of SUGGEST_GROUPS) {
    for (const word of group.words) {
      if (word.length <= 2 ? hay.includes(` ${word} `) : hay.includes(word)) return group.name;
    }
  }
  return DEFAULT_GROUP;
}

/** PT-05: a fixing is a name whose head noun is a hardware word ("HOSE CLIP", "BOLT, FLANGE"). */
export function isFixingsName(name: string): boolean {
  return FIXINGS_WORDS.has(headNoun(name));
}

/**
 * R2.1 + R2.3: an active part type that already covers this part — the same head noun plus at least one shared
 * qualifying word. The best match (most shared words, then name) is used, so "Hose clamp" finds the Hose clamp type
 * and "Air cleaner hose" does not become a twin of "Radiator hose".
 */
export function existingTypeFor(baseName: string, types: ReadonlyArray<PartType>): PartType | null {
  const head = headNoun(baseName);
  if (!head) return null;
  const wanted = new Set(qualifierWords(baseName));
  let best: { type: PartType; shared: number } | null = null;
  for (const type of types) {
    if (headNoun(type.name) !== head) continue;
    const shared = qualifierWords(type.name).filter((word) => wanted.has(word)).length;
    if (shared < 1) continue;
    if (!best || shared > best.shared || (shared === best.shared && type.name.localeCompare(best.type.name) < 0)) {
      best = { type, shared };
    }
  }
  return best?.type ?? null;
}

/** R2.6: no front/rear words → none; front/rear → axle; front/rear and left/right → axle_left_right. */
export function positionSchemeOf(rows: ReadonlyArray<{ axle: string | null; side: string | null }>): "none" | "axle" | "axle_left_right" {
  const axle = rows.some((r) => r.axle === "front" || r.axle === "rear");
  const side = rows.some((r) => r.side === "left" || r.side === "right" || r.side === "both");
  if (axle && side) return "axle_left_right";
  return axle ? "axle" : "none";
}

export type SuggestionBuild = {
  suggestions: Suggestion[];
  /** D1: each covered row's suggestion key, by line number. Rows with no suggestion stay absent. */
  keyByLine: Map<number, string>;
  /** R2.7: rows Roam doesn't know beyond the 20 suggestions, for the screen's one line. */
  moreUnknownRows: number;
};

/**
 * Build one upload's suggestions. `rows` is every proven row; only unknown rows that passed every check are grouped.
 * Rows sharing a group row become one suggestion, so the three INLET rows of the sample page are one card.
 */
export function buildSuggestions(input: {
  rows: ReadonlyArray<ProvenRow>;
  types: ReadonlyArray<PartType>;
  groups: ReadonlyArray<{ id: string; name: string }>;
  dismissed?: ReadonlySet<string>;
  max?: number;
}): SuggestionBuild {
  const max = input.max ?? MAX_SUGGESTIONS;
  const dismissed = input.dismissed ?? new Set<string>();
  const groupByName = new Map(input.groups.map((g) => [g.name, g.id]));

  // R2.4's "another NO. of the same thing": every group row on the page (a known row's group counts too), by the
  // name without its "no. n".
  const numbersByBase = new Map<string, Set<number>>();
  for (const row of input.rows) {
    const parsed = parseGroupPhrase(row.groupLine);
    if (!parsed) continue;
    const set = numbersByBase.get(parsed.baseName) ?? new Set<number>();
    if (parsed.noNumber != null) set.add(parsed.noNumber);
    numbersByBase.set(parsed.baseName, set);
  }

  type Bucket = { key: string; phrase: string; rows: ProvenRow[] };
  const buckets = new Map<string, Bucket>();
  for (const row of input.rows) {
    if (row.type || row.dropped || row.reason) continue;
    const phrase = pagePhraseFromGroupLine(row.groupLine);
    if (!phrase) continue;
    const key = normalisePhrase(phrase);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { key, phrase, rows: [] };
    bucket.rows.push(row);
    buckets.set(key, bucket);
  }

  const ordered = [...buckets.values()].sort((a, b) => a.rows[0].lineNo - b.rows[0].lineNo);
  const cards: Array<{ suggestion: Suggestion; firstLine: number }> = [];
  const fixings: Array<{ suggestion: Suggestion; firstLine: number }> = [];

  for (const bucket of ordered) {
    // A phrase the owner marked "not a part we track" is never offered again, on any page (D3, R6).
    if (dismissed.has(bucket.key)) continue;
    const parsed = parseGroupPhrase(bucket.rows[0].groupLine);
    if (!parsed) continue;
    const keepNumber = parsed.noNumber != null && (numbersByBase.get(parsed.baseName)?.size ?? 0) > 1;
    const suggested = plainNameFromPhrase(bucket.rows[0].groupLine, { keepNumber });
    if (!suggested) continue;

    const existing = existingTypeFor(parsed.baseName, input.types);
    const kind: SuggestionKind = existing ? "existing" : isFixingsName(parsed.baseName) ? "fixings" : "new";
    const groupName = suggestedGroupName(suggested);
    const numbers: string[] = [];
    for (const row of bucket.rows) {
      const number = String(row.number ?? "").trim();
      if (number && !numbers.includes(number)) numbers.push(number);
    }

    const suggestion: Suggestion = {
      key: bucket.key,
      // The card offers "Save under <name>" for an existing type, so the name shown is that type's own (R2.1 / S1).
      name: existing ? existing.name : suggested,
      groupId: groupByName.get(groupName) ?? null,
      groupName,
      kind,
      existingTypeId: existing?.id ?? null,
      positionScheme: positionSchemeOf(bucket.rows),
      pagePhrase: bucket.phrase,
      numbers,
      rowCount: bucket.rows.length,
      numberCount: numbers.length,
      status: "open",
      typeId: null,
      typeName: null,
      reason: null,
    };
    (kind === "fixings" ? fixings : cards).push({ suggestion, firstLine: bucket.rows[0].lineNo });
  }

  // R2.7: the cap counts suggestions (cards). Fixings are never cards; the screen shows them as one line.
  const keptCards = cards.slice(0, Math.max(0, max));
  let moreUnknownRows = 0;
  for (const dropped of cards.slice(keptCards.length)) moreUnknownRows += dropped.suggestion.rowCount;

  const suggestions = [...keptCards, ...fixings].sort((a, b) => a.firstLine - b.firstLine).map((entry) => entry.suggestion);
  const keyByLine = new Map<number, string>();
  for (const bucket of [...keptCards, ...fixings]) {
    for (const row of input.rows) {
      if (!row.type && !row.dropped && !row.reason && normalisePhrase(pagePhraseFromGroupLine(row.groupLine)) === bucket.suggestion.key) {
        keyByLine.set(row.lineNo, bucket.suggestion.key);
      }
    }
  }
  return { suggestions, keyByLine, moreUnknownRows };
}
